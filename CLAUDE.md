# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies.
- `npm run compile` — type-check and build with `tsc` into `dist/`.
- `npm run watch` — incremental build on file change.
- `npm run lint` — run ESLint over `src` (no config committed yet — add one before relying on this).
- `npm run test:unit` — compiles, then runs the plain Node unit tests (`node --test "dist/**/*.test.js"`) that
  cover `src/ucf/*` and `src/idmlArchiveIndex.ts`. These are ordinary `node:test` files (no VS Code host
  involved), colocated with the source as `*.test.ts`.
- Run/debug the extension: open this folder in VS Code and press F5 (or use the "Run Extension" launch config in
  `.vscode/launch.json`). This launches an Extension Development Host with the extension loaded; the build task
  in `.vscode/tasks.json` runs `npm run compile` first. There is no automated VS Code integration test harness
  (`@vscode/test-cli`/`@vscode/test-electron`) yet — end-to-end behavior (mounting an archive, browsing the tree,
  opening files) is verified manually via F5.

## Project purpose

A minimal VS Code extension for opening and browsing Adobe InDesign IDML files.

Key facts about the IDML format that shape the design:
- An IDML file is a **UCF (Universal Container Format)** container, and UCF is built on top of the **ZIP** format
  (the same lineage as EPUB's OCF).
- Being a valid ZIP is necessary but not sufficient — UCF requires the `mimetype` entry to be the **first entry**
  in the ZIP (both physically and in the central directory), **stored uncompressed** (not DEFLATE), with **no
  extra field**. `src/ucf/validate.ts` checks this. Breaking it means InDesign may refuse to open a repacked file.
- Internally, an IDML package is a directory-like tree of XML parts (spreads, stories, styles, resources, etc.).

## Architecture

Archive contents are served as a **virtual filesystem** on a custom `idml://` URI scheme via
`vscode.FileSystemProvider`, rather than a `TreeDataProvider` + temp-file-extraction approach. This makes archive
entries behave like real files — they show up in the Explorer and open in native editors via `workspace.fs` — and
gives a natural, symmetric path to future write support (`FileSystemProvider.writeFile`), which a
temp-file/tree-view approach would not.

The code is split into two layers:

- **`src/ucf/`** — VS-Code-agnostic UCF/ZIP parsing. No `import * as vscode` here; it's plain Node and unit
  tested independently (`npm run test:unit`).
  - `types.ts` — `UcfEntry`, `UcfArchive`, `UcfValidationResult`.
  - `archive.ts` — `openUcfArchive(filePath)`, wrapping `yauzl`'s promise API (`openPromise`,
    `eachEntry()` async iterator, `openReadStreamPromise`) to list entries and read entry bytes.
  - `validate.ts` — `validateUcfMimetype(archive)`, checking the mimetype-first-STORED-no-extra-field rule.
  - `__fixtures__/buildFixture.ts` — builds throwaway zip fixtures for tests using `yazl` (dev-only dependency,
    used only to construct fixtures with precise control over entry order/compression — not used at runtime).
- **VS Code integration**, at the top level of `src/`:
  - `idmlUri.ts` — `toIdmlUri`/`fromIdmlUri` encode/decode `idml://` URIs as
    `idml:/<internal-path>?archive=<url-encoded-absolute-archive-path>`.
  - `idmlArchiveIndex.ts` — pure transform from a flat `UcfEntry[]` list into a synthesized directory tree
    (`buildArchiveIndex`/`statArchivePath`/`readArchiveDirectory`). Kept free of `vscode` imports specifically so
    it's unit-testable without a VS Code host, even though it's conceptually part of the FS-provider layer.
  - `idmlFileSystemProvider.ts` — `IdmlFileSystemProvider`, implementing `stat`/`readDirectory`/`readFile` against
    a per-archive cache of `{ archive, index }`; `createDirectory`/`writeFile`/`delete`/`rename` all throw
    `FileSystemError.NoPermissions` (registered with `isReadonly: true`); `watch` is an inert no-op since each
    archive is treated as an immutable snapshot for the provider's lifetime.
  - `extension.ts` — activation entry point. Registers the provider on the `idml` scheme and the
    `idml-view.openArchive` command (also reachable via the `.idml` file's Explorer context menu). The command
    opens the picked archive once to run `validateUcfMimetype` (warning the user non-fatally if it looks invalid),
    then opens `idml://<archive>` in a **dedicated new window** via
    `vscode.commands.executeCommand('vscode.openFolder', rootUri, { forceNewWindow: true })`. This was chosen
    over `vscode.workspace.updateWorkspaceFolders` (added to the current window) after testing showed the latter
    forces a jarring extension-host restart when adding the first folder to an already-open window; a fresh
    window's normal startup absorbs that same restart unnoticed. Individual entries open via VS Code's normal
    editor resolution — no custom editor is registered.

**`activationEvents` includes `"onFileSystem:idml"`** (`package.json`), the activation event VS Code documents
specifically for custom-scheme `FileSystemProvider`s (see the `FileSystemProvider` doc-comment in
`@types/vscode`). It's a defense-in-depth safeguard alongside the dedicated-window mount strategy above — it
ensures the extension activates whenever anything needs to resolve an `idml://` resource, not only when the
`idml-view.openArchive` command itself runs. Keep it even though the current mount flow doesn't strictly depend
on it.

**Current scope is read-only.** Write support (editing entries and repacking a valid UCF file) is a known future
direction: it would need to buffer edits in memory and, on save, fully rewrite the archive via `yazl` (promoted
from dev-only to a runtime dependency), re-adding unchanged entries first followed by changes, writing `mimetype`
uncompressed and first — `yazl` writes entries in call order, so ordering must be handled explicitly. Not
designed further than that yet.
