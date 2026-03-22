export type CurrentUsdExportMode = 'live-stage' | 'bundle' | 'unavailable';

export interface ResolveCurrentUsdExportModeOptions {
  isHydrating: boolean;
  hasLiveStageExportHandler: boolean;
  hasPreparedExportCache: boolean;
  hasSceneSnapshot: boolean;
}

export function resolveCurrentUsdExportMode({
  isHydrating,
  hasLiveStageExportHandler,
  hasPreparedExportCache,
  hasSceneSnapshot,
}: ResolveCurrentUsdExportModeOptions): CurrentUsdExportMode {
  if (hasLiveStageExportHandler) {
    return 'live-stage';
  }

  if (!isHydrating && (hasPreparedExportCache || hasSceneSnapshot)) {
    return 'bundle';
  }

  return 'unavailable';
}
