import * as vscode from 'vscode';

export const IDML_SCHEME = 'idml';

/** Builds an `idml://` URI addressing `internalPath` inside the archive at `archivePath`. */
export function toIdmlUri(archivePath: string, internalPath: string): vscode.Uri {
  const normalized = internalPath.replace(/^\/+/, '');
  return vscode.Uri.from({
    scheme: IDML_SCHEME,
    path: `/${normalized}`,
    query: `archive=${encodeURIComponent(archivePath)}`
  });
}

export interface IdmlUriParts {
  archivePath: string;
  internalPath: string;
}

/** Extracts the source archive path and in-archive path from an `idml://` URI. */
export function fromIdmlUri(uri: vscode.Uri): IdmlUriParts {
  if (uri.scheme !== IDML_SCHEME) {
    throw new Error(`Not an ${IDML_SCHEME}:// URI: ${uri.toString()}`);
  }

  const match = /(?:^|&)archive=([^&]*)/.exec(uri.query);
  if (!match) {
    throw new Error(`Missing "archive" query parameter on ${IDML_SCHEME}:// URI: ${uri.toString()}`);
  }

  return {
    archivePath: decodeURIComponent(match[1]),
    internalPath: uri.path.replace(/^\/+/, '')
  };
}
