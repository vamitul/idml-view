import type { UcfEntry } from './ucf';

export type ArchiveEntryType = 'file' | 'directory';

export interface ArchiveIndex {
  /** Directory path ('' for root) -> immediate children (name -> type). */
  directories: Map<string, Map<string, ArchiveEntryType>>;
  /** Full file path -> the source UcfEntry. */
  files: Map<string, UcfEntry>;
}

function ensureDirectoryChain(directories: ArchiveIndex['directories'], dirPath: string): void {
  if (dirPath === '') {
    return;
  }

  const segments = dirPath.split('/');
  let current = '';
  for (const segment of segments) {
    const parent = current;
    current = current === '' ? segment : `${current}/${segment}`;
    if (!directories.has(current)) {
      directories.set(current, new Map());
    }
    directories.get(parent)!.set(segment, 'directory');
  }
}

/**
 * Builds a directory tree from a flat list of ZIP/UCF entries. ZIP archives
 * don't reliably contain real directory entries, so intermediate
 * directories are synthesized from file paths; explicit directory-marker
 * entries (trailing slash) are also registered.
 */
export function buildArchiveIndex(entries: readonly UcfEntry[]): ArchiveIndex {
  const directories: ArchiveIndex['directories'] = new Map([['', new Map()]]);
  const files: ArchiveIndex['files'] = new Map();

  for (const entry of entries) {
    if (entry.isDirectoryMarker) {
      ensureDirectoryChain(directories, entry.path.replace(/\/+$/, ''));
      continue;
    }

    const segments = entry.path.split('/');
    const name = segments[segments.length - 1];
    const parentDir = segments.slice(0, -1).join('/');

    ensureDirectoryChain(directories, parentDir);
    directories.get(parentDir)!.set(name, 'file');
    files.set(entry.path, entry);
  }

  return { directories, files };
}

export function statArchivePath(
  index: ArchiveIndex,
  path: string
): { type: ArchiveEntryType; entry?: UcfEntry } | undefined {
  const file = index.files.get(path);
  if (file) {
    return { type: 'file', entry: file };
  }
  if (index.directories.has(path)) {
    return { type: 'directory' };
  }
  return undefined;
}

export function readArchiveDirectory(index: ArchiveIndex, path: string): [string, ArchiveEntryType][] {
  const children = index.directories.get(path);
  if (!children) {
    throw new Error(`No such directory in archive index: ${path || '/'}`);
  }
  return [...children.entries()];
}
