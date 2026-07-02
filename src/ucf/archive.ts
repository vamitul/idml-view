import * as yauzl from 'yauzl';
import type { UcfArchive, UcfEntry } from './types';

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

export async function openUcfArchive(filePath: string): Promise<UcfArchive> {
  const zipfile = await yauzl.openPromise(filePath, { lazyEntries: true, autoClose: false });

  const entries: UcfEntry[] = [];
  const entryByPath = new Map<string, yauzl.Entry>();

  for await (const entry of zipfile.eachEntry()) {
    const path = normalizeEntryPath(entry.fileName);
    entryByPath.set(path, entry);
    entries.push({
      path,
      size: entry.uncompressedSize,
      mtime: entry.getLastModDate(),
      isDirectoryMarker: path.endsWith('/'),
      compressionMethod: entry.compressionMethod,
      extraFieldLength: entry.extraFieldLength
    });
  }

  return {
    sourcePath: filePath,
    entries,

    async readEntry(path: string): Promise<Buffer> {
      const entry = entryByPath.get(path);
      if (!entry) {
        throw new Error(`No such entry in archive: ${path}`);
      }
      const stream = await zipfile.openReadStreamPromise(entry);
      return readStreamToBuffer(stream);
    },

    async close(): Promise<void> {
      zipfile.close();
    }
  };
}
