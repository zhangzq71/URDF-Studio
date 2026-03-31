import type { UnifiedViewerMode } from './unifiedViewerMountState';

export function resolveUnifiedViewerSceneMode(mode: UnifiedViewerMode): 'detail' {
  // The merged workspace now routes every viewer-backed scene through the
  // legacy detail runtime so hardware no longer carries its own viewer mode.
  void mode;
  return 'detail';
}
