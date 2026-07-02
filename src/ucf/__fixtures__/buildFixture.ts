import * as yazl from 'yazl';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface FixtureEntry {
  path: string;
  content: string;
  /** Defaults to true (DEFLATE). Set to false for STORED. */
  compress?: boolean;
}

/**
 * Builds a zip fixture from the given entries, written in the given order
 * (yazl preserves call order in the output), and writes it to a temp file.
 * Caller is responsible for deleting the returned path.
 */
export async function buildFixtureZip(entries: FixtureEntry[]): Promise<string> {
  const zipfile = new yazl.ZipFile();
  for (const entry of entries) {
    zipfile.addBuffer(Buffer.from(entry.content, 'utf8'), entry.path, {
      compress: entry.compress ?? true,
      // Avoid yazl's default Unix-timestamp extra field, so a "no extra
      // field" fixture is actually extra-field-free.
      forceDosTimestamp: true
    });
  }
  zipfile.end();

  const outPath = path.join(os.tmpdir(), `idml-view-fixture-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(outPath);
    zipfile.outputStream.pipe(out);
    out.on('close', () => resolve());
    out.on('error', reject);
    zipfile.outputStream.on('error', reject);
  });

  return outPath;
}

/** A minimal, valid UCF fixture: mimetype first + STORED, plus two other parts. */
export function minimalValidUcfEntries(): FixtureEntry[] {
  return [
    { path: 'mimetype', content: 'application/vnd.adobe.indesign-idml-package', compress: false },
    { path: 'designmap.xml', content: '<?xml version="1.0"?><Document/>' },
    { path: 'META-INF/container.xml', content: '<?xml version="1.0"?><container/>' }
  ];
}
