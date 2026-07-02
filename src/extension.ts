import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const openArchive = vscode.commands.registerCommand('idml-view.openArchive', async () => {
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'IDML Files': ['idml'] }
    });

    if (!files || files.length === 0) {
      return;
    }

    vscode.window.showInformationMessage(`Selected IDML file: ${files[0].fsPath}`);
  });

  context.subscriptions.push(openArchive);
}

export function deactivate(): void {}
