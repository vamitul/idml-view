# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies.
- `npm run compile` — type-check and build with `tsc` into `dist/`.
- `npm run watch` — incremental build on file change.
- `npm run lint` — run ESLint over `src` (no config committed yet — add one before relying on this).
- `npm run test:unit` — compiles, then runs the plain Node unit tests (`node --test "dist/**/*.test.js"`) that
  cover `src/ucf/*` and `src/idmlExpand.ts`. These are ordinary `node:test` files (no VS Code host involved),
  colocated with the source as `*.test.ts`.
- Run/debug the extension: open this folder in VS Code and press F5 (or use the "Run Extension" launch config in
  `.vscode/launch.json`). This launches an Extension Development Host with the extension loaded; the build task
  in `.vscode/tasks.json` runs `npm run compile` first. There is no automated VS Code integration test harness
  (`@vscode/test-cli`/`@vscode/test-electron`) yet — end-to-end behavior (opening an archive, browsing the
  extracted tree, closing it) is verified manually via F5.

## Project purpose

A minimal VS Code extension for opening and browsing Adobe InDesign IDML files. **Only `.idml` files already
inside the current VS Code workspace are in scope** — there's no support for (and no intent to support) archives
living outside it.

Key facts about the IDML format that shape the design:
- An IDML file is a **UCF (Universal Container Format)** container, and UCF is built on top of the **ZIP** format
  (the same lineage as EPUB's OCF).
- Being a valid ZIP is necessary but not sufficient — UCF requires the `mimetype` entry to be the **first entry**
  in the ZIP (both physically and in the central directory), **stored uncompressed** (not DEFLATE), with **no
  extra field**. `src/ucf/validate.ts` checks this. Breaking it means InDesign may refuse to open a repacked file.
- Internally, an IDML package is a directory-like tree of XML parts (spreads, stories, styles, resources, etc.).

## Architecture

Archive contents are **extracted to real files on disk**, next to (in fact, in place of) the source `.idml`
file — not served through a virtual filesystem. An earlier version of this extension used a custom `idml://`
`vscode.FileSystemProvider` scheme instead; that was scrapped in favor of real extraction because a
virtual-FS-backed workspace folder kept hitting VS Code's extension-host-reload races around
`updateWorkspaceFolders` (see the git history around commit `76816d0`/`29a5c75` for that dead end). Real files
sidestep the whole problem: VS Code's built-in file explorer handles them natively.

**No `vscode.workspace.updateWorkspaceFolders` calls anywhere** — a deliberate simplification, not an oversight.
Since scope is limited to `.idml` files already inside the current workspace, extraction happens in place (the
folder ends up at the exact path the file had), so VS Code's own file watcher picks up the file→folder swap and
re-renders the Explorer automatically; there's nothing to explicitly mount or unmount. This also means none of
the workspace-folder-reload races that motivated dropping the `idml://` scheme apply here at all.

### Open (`idml-view.openArchive`)

For `path/to/shapes.idml`, `expandIdmlFile` (`src/idmlExpand.ts`) does the whole sequence:
1. Rename the original file out of the way (`shapes.idml` → `shapes.idml_tmp`), freeing up its name.
2. Create a directory at `shapes.idml` (the now-free original path) and extract every archive entry into it
   (`extractArchiveTo`) — including a guard against zip-slip path traversal (entries whose path would resolve
   outside the destination directory are rejected).
3. Move the renamed-away original into the new folder, at the reserved path `.idml-view/original.idml`. This is
   how the original file is hidden from the Explorer — **not** `files.exclude`/settings.json, which was tried
   first and rejected: it requires persisting to a settings file, and (worse) an earlier version's in-memory
   bookkeeping for restoring it was silently wiped by an extension-host reload. Physically moving the file needs
   no bookkeeping at all — it's plain filesystem state, inherently reload-proof. Trade-off, explicitly accepted
   for now and flagged for revisiting once tested under real usage: the file's on-disk path genuinely changes
   while "open," not just its visibility.

The net effect: the expanded folder ends up at the **exact same path** the original file had, so it shows up in
the Explorer as `shapes.idml` with no visible marker at all — no display-name override or virtual mount needed.

`openIdmlArchive` in `extension.ts` wraps this: it checks the target is a real file (bails with an info message
if a same-named folder — i.e. an already-expanded archive — is there instead), runs `validateUcfMimetype` (warns
non-fatally if the UCF mimetype constraint looks violated), then calls `expandIdmlFile`.

### Close (`idml-view.closeArchive`)

Available from the Command Palette and from the Explorer context menu on any **folder** ending in `.idml`
(`package.json`'s `explorer/context` menu: `resourceExtname == .idml && explorerResourceIsFolder` — the sibling
`idml-view.openArchive` entry is gated on `!explorerResourceIsFolder`, so exactly one of the two shows depending
on whether the `.idml`-named resource is currently a file or an expanded folder). Since the final folder carries
no distinguishing name suffix, `isExpandedIdmlFolder` (`src/idmlExpand.ts`) detects "is this one of ours" by
checking for the `.idml-view/original.idml` marker inside it, rather than trusting the name — this guards against
closing/deleting an unrelated folder that happens to be named `something.idml`.

If invoked without a specific folder (Command Palette with nothing focused), `findOpenIdmlFolders` in
`extension.ts` finds candidates via `vscode.workspace.findFiles('**/.idml-view/original.idml')` — a
workspace-scoped search (consistent with the "only files inside the current workspace" scope) that correctly
finds expanded folders anywhere in the tree. An earlier version scanned `vscode.workspace.workspaceFolders`
instead, which only lists top-level workspace roots — since nothing is ever mounted as a root anymore (see
above), that scan would never find an expanded folder that's just an ordinary subfolder, silently reporting "No
IDML archives are currently open" even when one was clearly visible. `findFiles` doesn't have that gap.

The user is then asked whether to **preserve changes**:
- **No** → `collapseIdmlFolder`: restores the original file, discards the extracted folder. Three-step swap
  (can't rename the marker file directly onto `folderPath`, since that path is currently a non-empty directory):
  move `.idml-view/original.idml` out to a temporary sibling path, delete the expanded folder, then rename the
  temp file onto the final path.
- **Yes** → `closeIdmlFolder`: repacks the (possibly edited) extracted contents into a new `.idml` file via
  `createUcfArchive`/`writePackage` (`src/ucf/archive.ts`), discarding the original backup. Order matters a lot
  here, and getting it wrong previously caused a real data-loss bug (fixed, see below):
  1. Relocate the marker directory (`.idml-view/`) *out* of `folderPath` first — not deleted, moved to a
     sibling temp path — so it's never walked/included as an archive entry, and can be moved back if anything
     below fails.
  2. Build the archive and write it to a **temporary sibling path**, not `folderPath` itself: `folderPath` is
     still the populated directory holding the source files `yazl` streams from for the *entire* duration of the
     write (registering an entry via `addFile` doesn't read the file — the bytes are streamed lazily as the
     output is consumed), so it can't be deleted, or opened for writing as a file, until that finishes.
  3. Only once the write fully succeeds: delete `folderPath` (the extracted directory), rename the temp output
     onto that now-free path, and discard the (no-longer-needed) marker backup.
  4. If step 2 throws, the marker directory is moved back into place and the error is rethrown — `folderPath` is
     left exactly as it was, nothing is lost.

  **Bug history:** an earlier version of `closeIdmlFolder` (a) called the removed `fs.rmdir(dir, { recursive:
  true })` form directly on the marker directory (Node hard-removed that option; this throws
  `ERR_INVALID_ARG_VALUE` on current Node, though older/deprecated-but-still-functional Node versions would
  proceed), and (b) called `archive.writePackage(folderPath)` directly — i.e. tried to `fs.open(folderPath, 'w')`
  while `folderPath` was still an existing, populated directory, which throws `EISDIR`. Critically, (a) deleted
  the only backup of the original file *before* (b)'s crash, meaning on a Node/Electron version where (a)
  doesn't hard-fail, the sequence would delete the original and then fail to produce any replacement — permanent
  data loss. Both are fixed by the ordering above (relocate-then-restore-on-failure, write-to-temp-then-swap).
  `src/idmlExpand.test.ts` now exercises the happy path (including that user edits to extracted files survive the
  repack and the marker never leaks into the output) and the "reject cleanly on a non-expanded folder" case. The
  "recover after a failure occurring specifically mid-write" path is *not* separately covered by an automated
  test — forcing a deterministic, portable failure at that exact point (after the marker has been relocated but
  before the write completes) proved impractical without platform-specific hacks; it's covered by code review
  reasoning only.

### Icons

- `contributes.languages` (`package.json`) registers an `idml-file` language for the `.idml` extension with a
  custom `icon.light`/`icon.dark` pointing at `icons/idml-file.svg`. This is the lightweight, per-language icon
  mechanism — it applies automatically regardless of the user's active icon theme, unlike a full
  `contributes.iconThemes` contribution (tried first and dropped: icon themes fully replace the user's file-icon
  theme when selected, an opt-in switch most users won't make just for one file type). It only covers **files**,
  though — VS Code has no per-extension icon mechanism for **folders** at all.
- `src/idmlFolderDecorationProvider.ts` (`IdmlFolderDecorationProvider`, registered in `activate()`) covers
  folders instead, via `vscode.FileDecorationProvider` — badges any `*.idml`-named folder that passes
  `isExpandedIdmlFolder` with a small `"ID"` badge. This is a badge overlay, not a full icon replacement
  (`FileDecoration.badge` is a short string, not an arbitrary image), but it works with any icon theme, no
  switching required. `"onStartupFinished"` was added to `activationEvents` so this decoration appears without
  requiring the user to run a command first.

### Layout

- **`src/ucf/`** — VS-Code-agnostic UCF/ZIP reading *and* writing. No `import * as vscode` here; unit tested
  independently.
  - `types.ts` — `UcfEntry`, `UcfArchiveRead` (aliased as `UcfArchive` from the barrel), `UcfArchiveWrite`,
    `UcfValidationResult`.
  - `archive.ts` — `openUcfArchive(filePath)` (read, via `yauzl`'s promise API) and `createUcfArchive(folderPath)`
    (write, via `yazl` — packs a folder's contents into a `UcfArchiveWrite`, sorting the `mimetype` entry first
    and storing it uncompressed, matching the UCF constraint).
  - `validate.ts` — `validateUcfMimetype(archive)`.
  - `__fixtures__/buildFixture.ts` — builds throwaway zip fixtures for tests using `yazl` (also a real runtime
    dependency now, not just a fixture-building one, now that `createUcfArchive` uses it for the repack path).
- **`src/idmlExpand.ts`** — the extraction/hide/restore/repack logic described above (`extractArchiveTo`,
  `expandIdmlFile`, `isExpandedIdmlFolder`, `collapseIdmlFolder`, `closeIdmlFolder`). Also VS-Code-agnostic and
  unit tested (`src/idmlExpand.test.ts`), using real temp directories on disk rather than mocks.
- **`src/idmlFolderDecorationProvider.ts`** — the folder badge described above.
- **`src/extension.ts`** — activation entry point. Registers `idml-view.openArchive`, `idml-view.closeArchive`,
  and the decoration provider, gluing the above together with VS Code APIs (`showOpenDialog`, `findFiles`,
  `showQuickPick`, `showInformationMessage`).
