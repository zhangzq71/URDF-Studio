export interface UnifiedViewerOptionsVisibilitySnapshot {
  viewer: boolean;
  visualizer: boolean;
}

interface CaptureUnifiedViewerOptionsVisibilityArgs {
  showViewerOptions: boolean;
  showVisualizerOptions: boolean;
}

interface ResolveUnifiedViewerOptionsRestoreArgs {
  wasVisibleAtPointerDown: boolean;
  isVisibleNow: boolean;
  hasRestoreHandler: boolean;
}

export function captureUnifiedViewerOptionsVisibility({
  showViewerOptions,
  showVisualizerOptions,
}: CaptureUnifiedViewerOptionsVisibilityArgs): UnifiedViewerOptionsVisibilitySnapshot {
  return {
    viewer: showViewerOptions,
    visualizer: showVisualizerOptions,
  };
}

export function shouldRestoreUnifiedViewerOptionsPanel({
  wasVisibleAtPointerDown,
  isVisibleNow,
  hasRestoreHandler,
}: ResolveUnifiedViewerOptionsRestoreArgs): boolean {
  return hasRestoreHandler && wasVisibleAtPointerDown && !isVisibleNow;
}
