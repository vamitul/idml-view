import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createUcfArchive, type UcfArchive } from './ucf';

const MARKER_DIR = '.idml-view';
const ORIGINAL_FILENAME = 'original.idml';

function markerDirPath(dirPath: string): string {
  return path.join(dirPath, MARKER_DIR);
}

function markerFilePath(dirPath: string): string {
  return path.join(markerDirPath(dirPath), ORIGINAL_FILENAME);
}

/** Writes every entry of `archive` to disk under `destDir`, preserving its internal directory structure. */
export async function extractArchiveTo(archive: UcfArchive, destDir: string): Promise<void> {
  for (const entry of archive.entries) {
    const destPath = path.join(destDir, ...entry.path.split('/'));
    const relative = path.relative(destDir, destPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Refusing to extract entry outside destination directory: ${entry.path}`);
    }

    if (entry.isDirectoryMarker) {
      await fs.mkdir(destPath, { recursive: true });
      continue;
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, await archive.readEntry(entry.path));
  }
}

/**
 * Extracts `archive` (read from `idmlPath`) directly onto `idmlPath` itself:
 * the original file is renamed out of the way first (freeing up the name),
 * then the archive is extracted straight into a new directory created at
 * that same path, and finally the renamed-away original is moved inside it
 * as a hidden marker (`.idml-view/original.idml`) — no settings/configuration
 * is touched. The expanded folder therefore has the exact same path/name the
 * original file had, so it shows up in the Explorer as e.g. "shapes.idml"
 * with no visible marker suffix.
 */
export async function expandIdmlFile(idmlPath: string, archive: UcfArchive): Promise<void> {
  const renamedOriginal = `${idmlPath}_tmp`;
  await fs.rename(idmlPath, renamedOriginal);

  await fs.mkdir(idmlPath, { recursive: true });
  await extractArchiveTo(archive, idmlPath);
  await archive.close();

  const marker = markerFilePath(idmlPath);
  await fs.mkdir(path.dirname(marker), { recursive: true });
  await fs.rename(renamedOriginal, marker);
}

/**
 * Whether `folderPath` looks like a folder previously produced by
 * {@link expandIdmlFile} (i.e. safe to hand to {@link collapseIdmlFolder} or
 * {@link closeIdmlFolder}). Since the final folder no longer carries a
 * distinguishing name suffix, this checks for the marker file left inside it
 * instead.
 */
export async function isExpandedIdmlFolder(folderPath: string): Promise<boolean> {
  try {
    await fs.access(markerFilePath(folderPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reverses {@link expandIdmlFile}: restores the original file to
 * `folderPath` and removes the extracted contents. The restore target is
 * the same path currently occupied by the (non-empty) expanded folder, so
 * this goes through a temporary sibling path rather than renaming directly
 * onto it.
 */
export async function collapseIdmlFolder(folderPath: string): Promise<void> {
  const tempRestorePath = `${folderPath}.idml-view-restore-tmp`;
  await fs.rename(markerFilePath(folderPath), tempRestorePath);
  await fs.rm(folderPath, { recursive: true, force: true });
  await fs.rename(tempRestorePath, folderPath);
}

/**
 * Reverses {@link expandIdmlFile} like {@link collapseIdmlFolder}, but by
 * repacking the (possibly edited) extracted contents into a new `.idml`
 * file instead of restoring the original one, which is discarded.
 *
 * The marker directory is relocated out of `folderPath` before packing (so
 * it's never included as an archive entry) and only discarded once the
 * repack has fully succeeded — if packing fails, it's moved back and the
 * error is rethrown, leaving `folderPath` exactly as it was.
 *
 * The new archive is written to a temporary sibling path, not `folderPath`
 * itself: `folderPath` is still a populated directory holding the source
 * files being streamed into the archive for the entire duration of the
 * write, so it can't be deleted (or opened for writing as a file) until
 * that finishes.
 */
export async function closeIdmlFolder(folderPath: string): Promise<void> {
  const markerDir = markerDirPath(folderPath);
  const markerDirBackup = `${folderPath}.idml-view-marker-tmp`;
  await fs.rename(markerDir, markerDirBackup);

  const tempOutputPath = `${folderPath}.idml-view-repack-tmp`;
  try {
    const archive = await createUcfArchive(folderPath);
    try {
      await archive.writePackage(tempOutputPath);
    } finally {
      await archive.close();
    }
  } catch (err) {
    await fs.rename(markerDirBackup, markerDir);
    await fs.rm(tempOutputPath, { force: true });
    throw err;
  }

  await fs.rm(folderPath, { recursive: true, force: true });
  await fs.rename(tempOutputPath, folderPath);
  await fs.rm(markerDirBackup, { recursive: true, force: true });
}
