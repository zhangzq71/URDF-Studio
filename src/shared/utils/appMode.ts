import type { AppMode } from '@/types';

export const MERGED_EDIT_APP_MODE: AppMode = 'detail';

/**
 * The workspace now exposes a single legacy edit mode. Historical
 * `skeleton` / `hardware` values are normalized here so older callers can
 * keep passing them without reviving separate mode behavior.
 */
export function normalizeMergedAppMode(mode: AppMode | 'skeleton' | 'hardware'): AppMode {
  void mode;
  return MERGED_EDIT_APP_MODE;
}
