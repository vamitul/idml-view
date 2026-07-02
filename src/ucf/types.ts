export interface UcfEntry {
  /** Normalized forward-slash path relative to archive root, e.g. "Spreads/Spread_ab3.xml" */
  path: string;
  size: number;
  mtime: Date | undefined;
  isDirectoryMarker: boolean;
  /** 0 = STORED, 8 = DEFLATE */
  compressionMethod: number;
  extraFieldLength: number;
}

export interface UcfArchive {
  readonly sourcePath: string;
  /** In central-directory order. */
  readonly entries: readonly UcfEntry[];
  readEntry(path: string): Promise<Buffer>;
  close(): Promise<void>;
}

export interface UcfValidationResult {
  valid: boolean;
  issues: string[];
}
