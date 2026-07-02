import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { openUcfArchive } from './archive';
import { validateUcfMimetype } from './validate';
import { buildFixtureZip, minimalValidUcfEntries } from './__fixtures__/buildFixture';

async function validateFixture(entries: Parameters<typeof buildFixtureZip>[0]) {
  const fixturePath = await buildFixtureZip(entries);
  try {
    const archive = await openUcfArchive(fixturePath);
    try {
      return validateUcfMimetype(archive);
    } finally {
      await archive.close();
    }
  } finally {
    await fs.rm(fixturePath, { force: true });
  }
}

test('validateUcfMimetype passes for a well-formed fixture', async () => {
  const result = await validateFixture(minimalValidUcfEntries());
  assert.deepEqual(result, { valid: true, issues: [] });
});

test('validateUcfMimetype fails when mimetype entry is missing', async () => {
  const result = await validateFixture([
    { path: 'designmap.xml', content: '<?xml version="1.0"?><Document/>' }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes('first entry')));
});

test('validateUcfMimetype fails when mimetype is not the first entry', async () => {
  const result = await validateFixture([
    { path: 'designmap.xml', content: '<?xml version="1.0"?><Document/>' },
    { path: 'mimetype', content: 'application/vnd.adobe.indesign-idml-package', compress: false }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes('first entry')));
});

test('validateUcfMimetype fails when mimetype is compressed', async () => {
  const result = await validateFixture([
    { path: 'mimetype', content: 'application/vnd.adobe.indesign-idml-package', compress: true }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes('stored uncompressed')));
});
