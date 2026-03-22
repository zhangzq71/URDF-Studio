function normalizeUsdStagePath(path: string | null | undefined): string {
  return String(path || '').trim().replace(/^\/+/, '');
}

export interface UsdStageHydrationDecision {
  pendingFileName?: string | null;
  selectedFileName?: string | null;
  stageSourcePath?: string | null;
}

export function shouldApplyUsdStageHydration({
  pendingFileName,
  selectedFileName,
  stageSourcePath,
}: UsdStageHydrationDecision): boolean {
  const normalizedPendingFileName = normalizeUsdStagePath(pendingFileName);
  const normalizedSelectedFileName = normalizeUsdStagePath(selectedFileName);
  const normalizedStageSourcePath = normalizeUsdStagePath(stageSourcePath);

  if (!normalizedPendingFileName || !normalizedSelectedFileName) {
    return false;
  }

  if (normalizedPendingFileName !== normalizedSelectedFileName) {
    return false;
  }

  if (normalizedStageSourcePath && normalizedStageSourcePath !== normalizedSelectedFileName) {
    return false;
  }

  return true;
}
