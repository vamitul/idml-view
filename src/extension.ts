import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { openUcfArchive, validateUcfMimetype } from './ucf';
import { collapseIdmlFolder, closeIdmlFolder, expandIdmlFile, isExpandedIdmlFolder } from './idmlExpand';
import { IdmlFolderDecorationProvider } from './idmlFolderDecorationProvider';

async function pickIdmlFile(): Promise<vscode.Uri | undefined> {
  const files = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'IDML Files': ['idml'] }
  });
  return files?.[0];
}

async function openIdmlArchive(fileUri: vscode.Uri): Promise<void> {
  const idmlPath = fileUri.fsPath;

  const stat = await fs.stat(idmlPath).catch(() => undefined);
  if (!stat) {
    void vscode.window.showWarningMessage(`${path.basename(idmlPath)} no longer exists.`);
    return;
  }
  if (!stat.isFile()) {
    void vscode.window.showInformationMessage(`${path.basename(idmlPath)} is already open.`);
    return;
  }

  const archive = await openUcfArchive(idmlPath);
  const validation = validateUcfMimetype(archive);

  if (!validation.valid) {
    void vscode.window.showWarningMessage(
      `This file does not look like a valid UCF/IDML container: ${validation.issues.join(' ')} ` +
        'InDesign may refuse to open a repacked version of this file.'
    );
  }

  // Closes the archive internally once extraction finishes.
  await expandIdmlFile(idmlPath, archive);
}

/** Expanded IDML folders currently visible anywhere in the open workspace. */
async function findOpenIdmlFolders(): Promise<vscode.Uri[]> {
  const markers = await vscode.workspace.findFiles('**/.idml-view/original.idml');
  return markers.map((marker) => vscode.Uri.file(path.dirname(path.dirname(marker.fsPath))));
}

async function closeIdmlArchive(explicitUri?: vscode.Uri): Promise<void> {
  let folderPath: string | undefined;

  if (explicitUri) {
    folderPath = explicitUri.fsPath;
  } else {
    const candidates = await findOpenIdmlFolders();
    if (candidates.length === 0) {
      void vscode.window.showInformationMessage('No IDML archives are currently open.');
      return;
    }
    if (candidates.length === 1) {
      folderPath = candidates[0].fsPath;
    } else {
      const pick = await vscode.window.showQuickPick(
        candidates.map((uri) => ({ label: path.basename(uri.fsPath), uri })),
        { placeHolder: 'Close which IDML archive?' }
      );
      folderPath = pick?.uri.fsPath;
    }
  }

  if (!folderPath) {
    return;
  }

  if (!(await isExpandedIdmlFolder(folderPath))) {
    void vscode.window.showWarningMessage(`${path.basename(folderPath)} doesn't look like an IDML View expanded folder.`);
    return;
  }

  const preserve = await vscode.window.showInformationMessage('Preserve changes?', { modal: true }, 'No', 'Yes');
  if (preserve !== 'Yes' && preserve !== 'No') {
    return;
  }

  try {
    if (preserve === 'Yes') {
      await closeIdmlFolder(folderPath);
    } else {
      await collapseIdmlFolder(folderPath);
    }
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to close IDML archive: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('idml-view.openArchive', async (initialUri?: vscode.Uri) => {
      const target = initialUri ?? (await pickIdmlFile());
      if (!target) {
        return;
      }
      await openIdmlArchive(target);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('idml-view.closeArchive', (uri?: vscode.Uri) => closeIdmlArchive(uri))
  );

  context.subscriptions.push(vscode.window.registerFileDecorationProvider(new IdmlFolderDecorationProvider()));
}

export function deactivate(): void {}
