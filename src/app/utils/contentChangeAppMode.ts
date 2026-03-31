import type { AppMode } from '@/types';
import { normalizeMergedAppMode } from '@/shared/utils/appMode';

/**
 * Newly loaded robot content should reopen in the merged legacy edit mode so
 * stale `skeleton` / `hardware` values never revive separate scene behavior.
 */
export function resolveAppModeAfterRobotContentChange(mode: AppMode | 'skeleton' | 'hardware'): AppMode {
  return normalizeMergedAppMode(mode);
}
