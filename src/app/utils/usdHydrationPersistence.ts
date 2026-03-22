interface UsdHydrationResolutionLike {
  usdSceneSnapshot?: unknown | null;
}

interface UsdHydrationPersistencePlanOptions {
  resolution: UsdHydrationResolutionLike;
  existingSceneSnapshot?: unknown | null;
  existingPreparedExportCache?: unknown | null;
}

export interface UsdHydrationPersistencePlan {
  sceneSnapshot: unknown | null;
  shouldSeedSceneSnapshot: boolean;
  shouldSeedPreparedExportCache: boolean;
}

export function buildUsdHydrationPersistencePlan({
  resolution,
  existingSceneSnapshot = null,
  existingPreparedExportCache = null,
}: UsdHydrationPersistencePlanOptions): UsdHydrationPersistencePlan {
  const resolvedSceneSnapshot = existingSceneSnapshot ?? resolution.usdSceneSnapshot ?? null;

  return {
    sceneSnapshot: resolvedSceneSnapshot,
    shouldSeedSceneSnapshot: existingSceneSnapshot == null && resolution.usdSceneSnapshot != null,
    shouldSeedPreparedExportCache: existingPreparedExportCache == null && resolvedSceneSnapshot != null,
  };
}
