import * as vscode from 'vscode';
import { isExpandedIdmlFolder } from './idmlExpand';

/**
 * Badges expanded IDML folders (any `*.idml` path with our marker inside)
 * in the Explorer. VS Code's `contributes.iconThemes` can't target folders
 * by name pattern (only exact `folderNames` matches, and our expanded
 * folders keep the original file's arbitrary basename) — a
 * `FileDecorationProvider` badge is the mechanism that actually works for
 * that case, and unlike an icon theme it doesn't require the user to switch
 * away from their existing icon theme.
 */
export class IdmlFolderDecorationProvider implements vscode.FileDecorationProvider {
  async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
    if (uri.scheme !== 'file' || !uri.fsPath.endsWith('.idml')) {
      return undefined;
    }
    if (!(await isExpandedIdmlFolder(uri.fsPath))) {
      return undefined;
    }
    return new vscode.FileDecoration('ID', 'Expanded IDML package');
  }
}
