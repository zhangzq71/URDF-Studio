export interface PreparedUsdPreloadFile {
  path: string;
  blob: Blob | null;
  bytes?: ArrayBuffer | Uint8Array | null;
  mimeType?: string | null;
  error?: string | null;
}

export interface PreparedUsdStageOpenData {
  stageSourcePath: string;
  criticalDependencyPaths: string[];
  preloadFiles: PreparedUsdPreloadFile[];
}
