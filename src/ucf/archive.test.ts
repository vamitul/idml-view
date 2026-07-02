import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { openUcfArchive } from './archive';
import { buildFixtureZip, minimalValidUcfEntries } from './__fixtures__/buildFixture';

test('openUcfArchive lists all entries with correct paths and sizes', async () => {
  const fixturePath = await buildFixtureZip(minimalValidUcfEntries());
  try {
    const archive = await openUcfArchive(fixturePath);
    try {
      const paths = archive.entries.map((e) => e.path);
      assert.deepEqual(paths, ['mimetype', 'designmap.xml', 'META-INF/container.xml']);

      const mimetype = archive.entries[0];
      assert.equal(mimetype.size, 'application/vnd.adobe.indesign-idml-package'.length);
    } finally {
      await archive.close();
    }
  } finally {
    await fs.rm(fixturePath, { force: true });
  }
});

test('readEntry returns correct bytes for a known entry', async () => {
  const fixturePath = await buildFixtureZip(minimalValidUcfEntries());
  try {
    const archive = await openUcfArchive(fixturePath);
    try {
      const content = await archive.readEntry('designmap.xml');
      assert.equal(content.toString('utf8'), '<?xml version="1.0"?><Document/>');
    } finally {
      await archive.close();
    }
  } finally {
    await fs.rm(fixturePath, { force: true });
  }
});

test('readEntry rejects a nonexistent path', async () => {
  const fixturePath = await buildFixtureZip(minimalValidUcfEntries());
  try {
    const archive = await openUcfArchive(fixturePath);
    try {
      await assert.rejects(() => archive.readEntry('does/not/exist.xml'));
    } finally {
      await archive.close();
    }
  } finally {
    await fs.rm(fixturePath, { force: true });
  }
});
