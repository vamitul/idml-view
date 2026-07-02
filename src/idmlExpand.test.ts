import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { openUcfArchive, validateUcfMimetype, type UcfArchive } from './ucf';
import { buildFixtureZip, minimalValidUcfEntries } from './ucf/__fixtures__/buildFixture';
import { closeIdmlFolder, collapseIdmlFolder, expandIdmlFile, extractArchiveTo, isExpandedIdmlFolder } from './idmlExpand';

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'idml-view-expand-'));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('extractArchiveTo writes every entry to disk under the destination directory', async () => {
  await withTempDir(async (dir) => {
    const fixturePath = await buildFixtureZip(minimalValidUcfEntries());
    try {
      const archive = await openUcfArchive(fixturePath);
      try {
        const destDir = path.join(dir, 'shapes.idml_exp');
        await extractArchiveTo(archive, destDir);

        assert.equal(await fs.readFile(path.join(destDir, 'mimetype'), 'utf8'), 'application/vnd.adobe.indesign-idml-package');
        assert.equal(
          await fs.readFile(path.join(destDir, 'designmap.xml'), 'utf8'),
          '<?xml version="1.0"?><Document/>'
        );
        assert.equal(
          await fs.readFile(path.join(destDir, 'META-INF', 'container.xml'), 'utf8'),
          '<?xml version="1.0"?><container/>'
        );
      } finally {
        await archive.close();
      }
    } finally {
      await fs.rm(fixturePath, { force: true });
    }
  });
});

test('extractArchiveTo rejects entries that would escape the destination directory', async () => {
  // yazl itself refuses to build a real zip fixture with a "../" entry name,
  // so this exercises the guard directly against a fake UcfArchive instead.
  const maliciousArchive: UcfArchive = {
    sourcePath: 'fake.idml',
    entries: [
      {
        path: '../escape.txt',
        size: 4,
        mtime: undefined,
        isDirectoryMarker: false,
        compressionMethod: 0,
        extraFieldLength: 0
      }
    ],
    readEntry: async () => Buffer.from('nope'),
    close: async () => {}
  };

  await withTempDir(async (dir) => {
    await assert.rejects(() => extractArchiveTo(maliciousArchive, path.join(dir, 'dest')));
  });
});

async function withFixtureCopy<T>(dir: string, run: (idmlPath: string) => Promise<T>): Promise<T> {
  const idmlPath = path.join(dir, 'shapes.idml');
  const fixturePath = await buildFixtureZip(minimalValidUcfEntries());
  try {
    await fs.copyFile(fixturePath, idmlPath);
  } finally {
    await fs.rm(fixturePath, { force: true });
  }
  return run(idmlPath);
}

test('expandIdmlFile replaces the original file with a same-named folder', async () => {
  await withTempDir(async (dir) => {
    await withFixtureCopy(dir, async (idmlPath) => {
      const archive = await openUcfArchive(idmlPath);
      await expandIdmlFile(idmlPath, archive);

      const stat = await fs.stat(idmlPath);
      assert.equal(stat.isDirectory(), true);
      assert.equal(
        await fs.readFile(path.join(idmlPath, 'designmap.xml'), 'utf8'),
        '<?xml version="1.0"?><Document/>'
      );
      assert.equal(await isExpandedIdmlFolder(idmlPath), true);

      // The staging folder should not be left behind alongside the final one.
      assert.equal(
        await fs
          .access(`${idmlPath.replace(/\.idml$/, '')}.idml_exp`)
          .then(() => true, () => false),
        false
      );
    });
  });
});

test('collapseIdmlFolder restores the original file and removes the extracted contents', async () => {
  await withTempDir(async (dir) => {
    await withFixtureCopy(dir, async (idmlPath) => {
      const originalBytes = await fs.readFile(idmlPath);
      const archive = await openUcfArchive(idmlPath);
      await expandIdmlFile(idmlPath, archive);

      await collapseIdmlFolder(idmlPath);

      const stat = await fs.stat(idmlPath);
      assert.equal(stat.isFile(), true);
      assert.deepEqual(await fs.readFile(idmlPath), originalBytes);
    });
  });
});

test('isExpandedIdmlFolder returns false for an unrelated folder', async () => {
  await withTempDir(async (dir) => {
    const unrelated = path.join(dir, 'not-idml-related');
    await fs.mkdir(unrelated, { recursive: true });
    assert.equal(await isExpandedIdmlFolder(unrelated), false);
  });
});

test('closeIdmlFolder repacks edited contents into a valid, mimetype-first .idml file', async () => {
  await withTempDir(async (dir) => {
    await withFixtureCopy(dir, async (idmlPath) => {
      const archive = await openUcfArchive(idmlPath);
      await expandIdmlFile(idmlPath, archive);

      // Simulate the user editing an extracted file before closing.
      await fs.writeFile(path.join(idmlPath, 'designmap.xml'), '<?xml version="1.0"?><Document edited="true"/>');

      await closeIdmlFolder(idmlPath);

      const stat = await fs.stat(idmlPath);
      assert.equal(stat.isFile(), true);

      const repacked = await openUcfArchive(idmlPath);
      try {
        assert.equal(validateUcfMimetype(repacked).valid, true);
        assert.equal(
          await repacked.readEntry('designmap.xml').then((b) => b.toString('utf8')),
          '<?xml version="1.0"?><Document edited="true"/>'
        );
        assert.equal(
          await repacked.readEntry('META-INF/container.xml').then((b) => b.toString('utf8')),
          '<?xml version="1.0"?><container/>'
        );
        assert.ok(
          !repacked.entries.some((e) => e.path.startsWith('.idml-view')),
          'repacked archive must not contain the marker directory'
        );
      } finally {
        await repacked.close();
      }
    });
  });
});

test('closeIdmlFolder leaves no temporary artifacts behind after a successful repack', async () => {
  await withTempDir(async (dir) => {
    await withFixtureCopy(dir, async (idmlPath) => {
      const archive = await openUcfArchive(idmlPath);
      await expandIdmlFile(idmlPath, archive);
      await closeIdmlFolder(idmlPath);

      const siblings = await fs.readdir(dir);
      assert.deepEqual(siblings, ['shapes.idml']);
    });
  });
});

test('closeIdmlFolder rejects and leaves the folder untouched when given a non-expanded folder', async () => {
  await withTempDir(async (dir) => {
    const plainFolder = path.join(dir, 'not-expanded.idml');
    await fs.mkdir(plainFolder, { recursive: true });
    await fs.writeFile(path.join(plainFolder, 'mimetype'), 'x');

    await assert.rejects(() => closeIdmlFolder(plainFolder));

    // Nothing should have been renamed/deleted by the failed attempt.
    assert.equal(await fs.readFile(path.join(plainFolder, 'mimetype'), 'utf8'), 'x');
    const siblings = await fs.readdir(dir);
    assert.deepEqual(siblings, ['not-expanded.idml']);
  });
});
