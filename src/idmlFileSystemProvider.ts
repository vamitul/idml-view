import * as vscode from 'vscode';
import { openUcfArchive, type UcfArchive } from './ucf';
import { buildArchiveIndex, readArchiveDirectory, statArchivePath, type ArchiveIndex } from './idmlArchiveIndex';
import { fromIdmlUri } from './idmlUri';

function toFileType(type: 'file' | 'directory'): vscode.FileType {
  return type === 'file' ? vscode.FileType.File : vscode.FileType.Directory;
}

/**
 * Serves the contents of `.idml` (UCF/ZIP) archives as a read-only virtual
 * filesystem on the `idml://` scheme. Each archive is opened and indexed
 * lazily on first access and then treated as an immutable snapshot for the
 * lifetime of the provider.
 */
export class IdmlFileSystemProvider implements vscode.FileSystemProvider {
  private readonly archives = new Map<string, Promise<{ archive: UcfArchive; index: ArchiveIndex }>>();

  private readonly changeEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.changeEmitter.event;

  private loadArchive(archivePath: string): Promise<{ archive: UcfArchive; index: ArchiveIndex }> {
    let pending = this.archives.get(archivePath);
    if (!pending) {
      pending = openUcfArchive(archivePath).then((archive) => ({
        archive,
        index: buildArchiveIndex(archive.entries)
      }));
      this.archives.set(archivePath, pending);
    }
    return pending;
  }

  watch(): vscode.Disposable {
    // Archives are treated as immutable snapshots in read-only mode, so
    // there is nothing to watch for changes.
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { archivePath, internalPath } = fromIdmlUri(uri);
    const { index } = await this.loadArchive(archivePath);

    const result = statArchivePath(index, internalPath);
    if (!result) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return {
      type: toFileType(result.type),
      ctime: 0,
      mtime: result.entry?.mtime?.getTime() ?? 0,
      size: result.entry?.size ?? 0,
      permissions: vscode.FilePermission.Readonly
    };
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { archivePath, internalPath } = fromIdmlUri(uri);
    const { index } = await this.loadArchive(archivePath);

    try {
      return readArchiveDirectory(index, internalPath).map(([name, type]) => [name, toFileType(type)]);
    } catch {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { archivePath, internalPath } = fromIdmlUri(uri);
    const { archive, index } = await this.loadArchive(archivePath);

    const result = statArchivePath(index, internalPath);
    if (!result || result.type !== 'file') {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return archive.readEntry(internalPath);
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  writeFile(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  rename(oldUri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(oldUri);
  }
}
