import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import type { UcfArchiveRead, UcfArchiveWrite, UcfEntry } from './types';

function normalizeEntryPath(rawPath: string): string {
  if (rawPath.includes('\\')) {
    throw new Error(`Unexpected backslash in zip entry path: ${rawPath}`);
  }
  return rawPath.replace(/^\/+/, '');
}

async function readStreamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function openUcfArchive(filePath: string): Promise<UcfArchiveRead> {
  const zipfile = await yauzl.openPromise(filePath, { lazyEntries: true, autoClose: false });

  const entries: UcfEntry[] = [];
  const entryByPath = new Map<string, yauzl.Entry>();

  for await (const entry of zipfile.eachEntry()) {
    const entryPath = normalizeEntryPath(entry.fileName);
    entryByPath.set(entryPath, entry);
    entries.push({
      path: entryPath,
      size: entry.uncompressedSize,
      mtime: entry.getLastModDate(),
      isDirectoryMarker: entryPath.endsWith('/'),
      compressionMethod: entry.compressionMethod,
      extraFieldLength: entry.extraFieldLength
    });
  }

  return {
    sourcePath: filePath,
    entries,

    async readEntry(entryPath: string): Promise<Buffer> {
      const entry = entryByPath.get(entryPath);
      if (!entry) {
        throw new Error(`No such entry in archive: ${entryPath}`);
      }
      const stream = await zipfile.openReadStreamPromise(entry);
      return readStreamToBuffer(stream);
    },

    async close(): Promise<void> {
      zipfile.close();
    }
  };
}

interface CollectedEntry {
  zipPath: string;
  isDirectory: boolean;
}

async function collectFolderEntries(folderPath: string): Promise<CollectedEntry[]> {
  const entries: CollectedEntry[] = [];

  async function walk(dir: string, parentZipPath: string): Promise<void> {
    const dirents = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const dirent of dirents) {
      const zipPath = parentZipPath ? `${parentZipPath}/${dirent.name}` : dirent.name;

      if (dirent.isDirectory()) {
        entries.push({ zipPath: `${zipPath}/`, isDirectory: true });
        await walk(path.join(dir, dirent.name), zipPath);
      } else if (dirent.isFile()) {
        entries.push({ zipPath, isDirectory: false });
      }
    }
  }

  await walk(folderPath, '');
  return entries;
}

/**
 * Packs `folderPath`'s contents into a UCF/ZIP archive, ordering the
 * `mimetype` entry first and storing it uncompressed (per the UCF
 * constraint `validateUcfMimetype` checks), and compressing everything
 * else.
 */
export async function createUcfArchive(folderPath: string): Promise<UcfArchiveWrite> {
  const zipfile = new yazl.ZipFile();

  const collected = await collectFolderEntries(folderPath);
  collected.sort((a, b) => {
    const aIsMime = a.zipPath === 'mimetype';
    const bIsMime = b.zipPath === 'mimetype';
    if (aIsMime && !bIsMime) return -1;
    if (!aIsMime && bIsMime) return 1;
    return a.zipPath.localeCompare(b.zipPath);
  });

  for (const entry of collected) {
    if (entry.isDirectory) {
      zipfile.addEmptyDirectory(entry.zipPath, { forceDosTimestamp: true });
      continue;
    }

    const realPath = path.resolve(folderPath, ...entry.zipPath.split('/'));
    const isMimetype = entry.zipPath === 'mimetype';
    zipfile.addFile(realPath, entry.zipPath, { compress: !isMimetype, forceDosTimestamp: true });
  }

  zipfile.end();

  const outputStream = zipfile.outputStream;
  const closePromise = new Promise<void>((resolve, reject) => {
    outputStream.on('end', resolve);
    outputStream.on('error', reject);
  });

  return {
    sourcePath: folderPath,

    async writePackage(destPath: string): Promise<void> {
      const file = await fsPromises.open(destPath, 'w');
      try {
        const writeStream = file.createWriteStream();
        outputStream.pipe(writeStream);
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
      } finally {
        await file.close();
      }
    },

    async close(): Promise<void> {
      await closePromise;
    }
  };
}
