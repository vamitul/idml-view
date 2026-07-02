import type { UcfArchiveRead, UcfValidationResult } from './types';

const STORED = 0;

/**
 * Checks the UCF (Universal Container Format) constraint that IDML/EPUB-style
 * containers rely on: the `mimetype` entry must be the first entry in the
 * archive, stored uncompressed, with no extra field, so its bytes land at a
 * fixed, predictable offset.
 */
export function validateUcfMimetype(archive: UcfArchiveRead): UcfValidationResult {
  const issues: string[] = [];
  const first = archive.entries[0];

  if (!first || first.path !== 'mimetype') {
    issues.push('The "mimetype" entry must be the first entry in the archive.');
  } else {
    if (first.compressionMethod !== STORED) {
      issues.push('The "mimetype" entry must be stored uncompressed (STORED), not compressed.');
    }
    if (first.extraFieldLength !== 0) {
      issues.push('The "mimetype" entry must not have an extra field.');
    }
  }

  return { valid: issues.length === 0, issues };
}
