export const SNAPSHOT_MIN_LONG_EDGE = 3840;
export const SNAPSHOT_MAX_LONG_EDGE_FALLBACK = 8192;

interface ResolveSnapshotRenderPlanOptions {
  baseWidth: number;
  baseHeight: number;
  basePixelRatio: number;
  targetLongEdge?: number | null;
  minLongEdge?: number;
  maxRenderbufferSize?: number | null;
  maxTextureSize?: number | null;
}

export interface SnapshotRenderPlan {
  baseWidth: number;
  baseHeight: number;
  basePixelRatio: number;
  scale: number;
  targetWidth: number;
  targetHeight: number;
  targetPixelRatio: number;
}

function sanitizePositiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.round(value));
}

function sanitizePositiveNumber(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

export function resolveSnapshotRenderPlan({
  baseWidth,
  baseHeight,
  basePixelRatio,
  targetLongEdge = null,
  minLongEdge = SNAPSHOT_MIN_LONG_EDGE,
  maxRenderbufferSize,
  maxTextureSize,
}: ResolveSnapshotRenderPlanOptions): SnapshotRenderPlan {
  const safeBaseWidth = sanitizePositiveInteger(baseWidth, 1);
  const safeBaseHeight = sanitizePositiveInteger(baseHeight, 1);
  const safeBasePixelRatio = sanitizePositiveNumber(basePixelRatio, 1);
  const baseLongEdge = Math.max(safeBaseWidth, safeBaseHeight);
  const desiredLongEdge = targetLongEdge == null
    ? Math.max(
      baseLongEdge,
      sanitizePositiveInteger(minLongEdge, SNAPSHOT_MIN_LONG_EDGE),
    )
    : sanitizePositiveInteger(targetLongEdge, baseLongEdge);

  const gpuCaps = [maxRenderbufferSize, maxTextureSize]
    .filter((value): value is number => Number.isFinite(value) && value > 0)
    .map((value) => Math.max(baseLongEdge, Math.floor(value)));
  const maxLongEdge = gpuCaps.length > 0
    ? Math.min(...gpuCaps)
    : Math.max(baseLongEdge, SNAPSHOT_MAX_LONG_EDGE_FALLBACK);
  const resolvedTargetLongEdge = Math.min(desiredLongEdge, maxLongEdge);
  const scale = resolvedTargetLongEdge / baseLongEdge;

  return {
    baseWidth: safeBaseWidth,
    baseHeight: safeBaseHeight,
    basePixelRatio: safeBasePixelRatio,
    scale,
    targetWidth: Math.max(1, Math.round(safeBaseWidth * scale)),
    targetHeight: Math.max(1, Math.round(safeBaseHeight * scale)),
    targetPixelRatio: safeBasePixelRatio * scale,
  };
}
