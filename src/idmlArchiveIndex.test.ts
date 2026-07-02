import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildArchiveIndex, readArchiveDirectory, statArchivePath } from './idmlArchiveIndex';
import type { UcfEntry } from './ucf';

function entry(path: string, overrides: Partial<UcfEntry> = {}): UcfEntry {
  return {
    path,
    size: 0,
    mtime: undefined,
    isDirectoryMarker: path.endsWith('/'),
    compressionMethod: 0,
    extraFieldLength: 0,
    ...overrides
  };
}

test('buildArchiveIndex synthesizes intermediate directories from file paths', () => {
  const index = buildArchiveIndex([entry('mimetype'), entry('Spreads/Spread_ab3.xml'), entry('META-INF/container.xml')]);

  assert.deepEqual(readArchiveDirectory(index, '').sort(), [
    ['META-INF', 'directory'],
    ['Spreads', 'directory'],
    ['mimetype', 'file']
  ]);
  assert.deepEqual(readArchiveDirectory(index, 'Spreads'), [['Spread_ab3.xml', 'file']]);
  assert.deepEqual(readArchiveDirectory(index, 'META-INF'), [['container.xml', 'file']]);
});

test('buildArchiveIndex registers explicit directory-marker entries', () => {
  const index = buildArchiveIndex([entry('Links/')]);
  assert.deepEqual(readArchiveDirectory(index, ''), [['Links', 'directory']]);
  assert.deepEqual(readArchiveDirectory(index, 'Links'), []);
});

test('statArchivePath distinguishes files from directories', () => {
  const index = buildArchiveIndex([entry('mimetype'), entry('Spreads/Spread_ab3.xml')]);

  assert.equal(statArchivePath(index, 'mimetype')?.type, 'file');
  assert.equal(statArchivePath(index, 'Spreads')?.type, 'directory');
  assert.equal(statArchivePath(index, '')?.type, 'directory');
  assert.equal(statArchivePath(index, 'does/not/exist'), undefined);
});

test('readArchiveDirectory throws for a path that is not a known directory', () => {
  const index = buildArchiveIndex([entry('mimetype')]);
  assert.throws(() => readArchiveDirectory(index, 'nope'));
});
