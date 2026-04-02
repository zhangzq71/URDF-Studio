export interface LoadingHudStateInput {
  loadedCount?: number | null;
  totalCount?: number | null;
  progressPercent?: number | null;
  fallbackDetail: string;
}

export interface LoadingHudState {
  detail: string;
  progress: number | null;
  statusLabel: string | null;
}

export interface IndeterminateStreamingMeshProgressInput {
  phase?: string | null;
  loadedCount?: number | null;
  totalCount?: number | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildLoadingHudState({
  loadedCount,
  totalCount,
  progressPercent,
  fallbackDetail,
}: LoadingHudStateInput): LoadingHudState {
  const safeTotalCount = Number.isFinite(totalCount) ? Math.max(0, Math.round(Number(totalCount))) : 0;
  const safeLoadedCount = Number.isFinite(loadedCount) ? Math.round(Number(loadedCount)) : 0;

  if (safeTotalCount > 0) {
    const normalizedLoadedCount = clamp(safeLoadedCount, 0, safeTotalCount);

    return {
      detail: `${normalizedLoadedCount} / ${safeTotalCount}`,
      progress: normalizedLoadedCount / safeTotalCount,
      statusLabel: `${normalizedLoadedCount} / ${safeTotalCount}`,
    };
  }

  if (Number.isFinite(progressPercent)) {
    const normalizedPercent = clamp(Math.round(Number(progressPercent)), 0, 100);

    return {
      detail: `${normalizedPercent}%`,
      progress: normalizedPercent / 100,
      statusLabel: `${normalizedPercent}%`,
    };
  }

  return {
    detail: fallbackDetail,
    progress: null,
    statusLabel: null,
  };
}

export function shouldUseIndeterminateStreamingMeshProgress({
  phase,
  loadedCount,
  totalCount,
}: IndeterminateStreamingMeshProgressInput): boolean {
  if (phase !== 'streaming-meshes') {
    return false;
  }

  const safeTotalCount = Number.isFinite(totalCount) ? Math.max(0, Math.round(Number(totalCount))) : 0;
  const safeLoadedCount = Number.isFinite(loadedCount) ? Math.max(0, Math.round(Number(loadedCount))) : 0;

  return safeTotalCount > 0 && safeLoadedCount === 0;
}
