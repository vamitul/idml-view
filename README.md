# IDML View

A minimal VS Code extension for browsing and editing the contents of Adobe InDesign `.idml` files that are
already inside your workspace.

`.idml` files are ZIP-based UCF (Universal Container Format) containers holding a tree of XML parts (spreads,
stories, styles, resources, `designmap.xml`, etc.). IDML View extracts one in place, right where the file was, so
you can browse and edit those parts directly in the Explorer without manually unzipping anything — and repack
your edits back into a valid `.idml` file when you're done.

## Features

- **Open** — extracts an `.idml` file into a real folder at the exact same path, so it appears in the Explorer
  in the file's place. No virtual filesystem, no separate mount step.
- **Browse and edit** — the extracted contents are ordinary files on disk; open, edit, and save them like
  anything else in your workspace.
- **Close, with a choice** — discard your changes and restore the original file untouched, or repack the
  (possibly edited) contents back into a valid `.idml` file, preserving the UCF `mimetype`-first constraint
  IDML/InDesign requires.
- **Validity check on open** — warns if a file doesn't look like a properly-formed UCF container, so a later
  repack isn't a surprise.
- **Custom file icon** for `.idml` files, and a small badge on folders that are currently expanded.

## Usage

1. Run **IDML View: Open IDML Archive...** from the Command Palette, or right-click a `.idml` file in the
   Explorer and choose it from the context menu.
2. The archive is extracted in place — the resulting folder takes over the original file's exact name, so it
   shows up in the Explorer right where the file was, with no visible marker. Expand it to browse the internal
   file tree; click any entry to open it in a normal editor.
3. To close it, right-click the folder in the Explorer (or run **IDML View: Close IDML Archive** from the
   Command Palette) and choose whether to preserve your changes:
   - **No** — discards the extracted folder and restores the original `.idml` file untouched.
   - **Yes** — repacks the extracted contents (including any edits) into a new `.idml` file in its place.

## Scope

- Only `.idml` files already inside the current VS Code workspace are supported.
- If a file doesn't look like a valid UCF container (e.g. its `mimetype` entry isn't first, or isn't stored
  uncompressed), a warning is shown when it's opened. It can still be extracted and browsed.
- While an archive is open, the original `.idml` file is physically relocated into the extracted folder rather
  than merely hidden, so that closing doesn't depend on any state that could be lost across a window reload. This
  mechanism may change as the extension gets more real-world testing.

## Installing

Not yet published to the Marketplace. Build and install locally:

```sh
npm install
npm run package             # produces idml-view-<version>.vsix
```

Then, in VS Code: Command Palette → **Extensions: Install from VSIX...** → select the generated `.vsix` file.

## Development

- `npm run compile` — type-check and build.
- `npm run watch` — incremental build on change.
- `npm run test:unit` — run the unit test suite.
- Press F5 (with this folder open in VS Code) to launch an Extension Development Host for manual testing.

See `CLAUDE.md` for architecture notes.

## License

[Unlicense](LICENSE) — public domain.
