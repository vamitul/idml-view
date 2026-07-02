import * as vscode from 'vscode';
import * as path from 'node:path';
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

  const rootUri = toIdmlUri(fileUri.fsPath, '');
  vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, {
    uri: rootUri,
    name: path.basename(fileUri.fsPath)
  });
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
