# IDML View

A minimal VS Code extension for browsing the contents of Adobe InDesign `.idml` files.

`.idml` files are ZIP-based UCF (Universal Container Format) containers holding a tree of XML parts (spreads,
stories, styles, resources, `designmap.xml`, etc.). This extension lets you open one and browse those parts
directly in VS Code's Explorer, without manually unzipping the file.

## Usage

1. Run the **IDML View: Open IDML Archive...** command from the Command Palette, or right-click a `.idml` file in
   the Explorer and choose it from the context menu.
2. The archive opens in a new VS Code window, with its contents shown as the workspace's file tree. Expand it to
   browse the internal file tree; click any entry to open it in a normal editor.

## Scope

- **Read-only.** Entries can be browsed and opened, but not edited, created, deleted, or renamed. Write support
  (editing and repacking a valid `.idml` file) may be added later.
- If a file doesn't look like a valid UCF container (e.g. its `mimetype` entry isn't first, or isn't stored
  uncompressed), a warning is shown when it's opened. The file can still be browsed, but a tool that later
  repacks it without preserving that structure may produce a file InDesign refuses to open.
