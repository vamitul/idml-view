import * as vscode from 'vscode';
import { openUcfArchive, validateUcfMimetype } from './ucf';
import { IdmlFileSystemProvider } from './idmlFileSystemProvider';
import { toIdmlUri } from './idmlUri';

async function pickIdmlFile(): Promise<vscode.Uri | undefined> {
  const files = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'IDML Files': ['idml'] }
  });
  return files?.[0];
}

async function mountIdmlArchive(fileUri: vscode.Uri): Promise<void> {
  const archive = await openUcfArchive(fileUri.fsPath);
  const validation = validateUcfMimetype(archive);
  await archive.close();

  if (!validation.valid) {
    void vscode.window.showWarningMessage(
      `This file does not look like a valid UCF/IDML container: ${validation.issues.join(' ')} ` +
        'InDesign may refuse to open a repacked version of this file.'
    );
  }

  // Opened in a dedicated new window rather than added to the current
  // window's workspace folders: `updateWorkspaceFolders` forces an
  // extension-host restart when adding the first folder to an empty
  // window, which reads as a jarring hiccup in a window you're already
  // using. A fresh window's normal startup absorbs that same restart
  // unnoticed.
  const rootUri = toIdmlUri(fileUri.fsPath, '');
  await vscode.commands.executeCommand('vscode.openFolder', rootUri, { forceNewWindow: true });
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new IdmlFileSystemProvider();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('idml', provider, {
      isReadonly: true,
      isCaseSensitive: true
    })
  );

  const openArchive = vscode.commands.registerCommand('idml-view.openArchive', async (initialUri?: vscode.Uri) => {
    const target = initialUri ?? (await pickIdmlFile());
    if (!target) {
      return;
    }
    await mountIdmlArchive(target);
  });

  context.subscriptions.push(openArchive);
}

export function deactivate(): void {}
