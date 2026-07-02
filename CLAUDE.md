# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies.
- `npm run compile` — type-check and build with `tsc` into `dist/`.
- `npm run watch` — incremental build on file change.
- `npm run lint` — run ESLint over `src` (no config committed yet — add one before relying on this).
- Run/debug the extension: open this folder in VS Code and press F5 (or use the "Run Extension" launch config in
  `.vscode/launch.json`). This launches an Extension Development Host with the extension loaded; the build task
  in `.vscode/tasks.json` runs `npm run compile` first.
- There is no test runner configured yet (no `@vscode/test-electron` / `@vscode/test-cli` setup). Add one before
  writing tests.

## Project purpose

A minimal VS Code extension for opening and browsing Adobe InDesign IDML files.

Key facts about the IDML format that shape the design:
- An IDML file is a **UCF (Universal Container Format)** container, and UCF is built on top of the **ZIP** format.
- Being a valid ZIP is necessary but not sufficient — UCF imposes additional rules on top of plain ZIP (e.g.
  requirements around the `mimetype` entry and how it must be stored). Any code that reads or writes IDML files
  needs to respect these UCF constraints, not just treat the file as a generic ZIP.
- Internally, an IDML package is a directory-like tree of XML parts (spreads, stories, styles, resources, etc.).

## Intended functionality

- Open an `.idml` file and present its internal contents as a file tree in VS Code (likely via a `TreeDataProvider`
  and/or a custom editor), similar to browsing an archive.
- One implementation approach under consideration: expand the ZIP contents into a temp folder on disk and expose
  that as the tree, rather than reading entries into memory on demand. If this approach is used, be mindful of
  temp folder lifecycle (creation/cleanup on close) and avoid leaking files across sessions.
- Initial scope is **read-only** browsing/viewing of the archive contents.
- Write support (editing entries and repacking a valid IDML/UCF file) is a possible future enhancement, not
  required initially. Any future write path must preserve UCF validity (correct mimetype entry handling, etc.),
  not just re-zip the directory naively.

## Current scaffold

- Standard VS Code extension anatomy: `package.json` (manifest + `contributes.commands`), `tsconfig.json`
  (compiles `src/**/*.ts` to `dist/`, CommonJS, strict mode), and `src/extension.ts` as the activation entry
  point (`activate`/`deactivate`), matching `main` in `package.json`.
- Currently registers a single placeholder command, `idml-view.openArchive`, that opens a file picker filtered
  to `.idml` files and shows the selected path — a stand-in until real IDML parsing and tree-view rendering are
  implemented.
- `.vscode/launch.json` + `.vscode/tasks.json` wire up F5 debugging (build via `npm run compile`, then launch an
  Extension Development Host).

## Architecture notes for future implementation

- Favor a clean separation between:
  - **UCF/ZIP parsing** — format-aware logic for reading (and later writing) the IDML/UCF container itself, kept
    independent of VS Code APIs so it can be tested standalone. Not implemented yet; no ZIP library is installed
    yet (e.g. `yauzl`, `adm-zip`, or Node's built-in zlib-based approaches are candidates).
  - **VS Code integration** — tree/editor providers (e.g. `TreeDataProvider`, or a custom editor) that consume
    the parsing layer and render it in the UI. Not implemented yet.
