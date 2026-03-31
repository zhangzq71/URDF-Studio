interface ResolveUnifiedViewerHandoffReadyStateArgs {
  isViewerMode: boolean;
  isPreviewing: boolean;
  visualizerAvailableForViewportHandoff: boolean;
  viewerLoadScopeKey: string;
  pendingViewerLoadScopeKey: string | null;
  releasedViewerLoadScopeKey: string | null;
  startViewerViewportHandoff: boolean;
  continueViewerViewportHandoff: boolean;
  keepExistingViewerViewportHandoff: boolean;
  hasPendingViewerHandoffForScope: boolean;
}

export interface UnifiedViewerHandoffReadyState {
  pendingViewerLoadScopeKey: string | null;
  viewerSceneReady: boolean;
}

export function resolveUnifiedViewerHandoffReadyState({
  isViewerMode,
  isPreviewing,
  visualizerAvailableForViewportHandoff,
  viewerLoadScopeKey,
  pendingViewerLoadScopeKey,
  releasedViewerLoadScopeKey,
  startViewerViewportHandoff,
  continueViewerViewportHandoff,
  keepExistingViewerViewportHandoff,
  hasPendingViewerHandoffForScope,
}: ResolveUnifiedViewerHandoffReadyStateArgs): UnifiedViewerHandoffReadyState {
  if (!isViewerMode || isPreviewing || !visualizerAvailableForViewportHandoff) {
    return {
      pendingViewerLoadScopeKey: null,
      viewerSceneReady: true,
    };
  }

  if (releasedViewerLoadScopeKey === viewerLoadScopeKey) {
    return {
      pendingViewerLoadScopeKey: null,
      viewerSceneReady: true,
    };
  }

  if (startViewerViewportHandoff && !hasPendingViewerHandoffForScope) {
    return {
      pendingViewerLoadScopeKey: viewerLoadScopeKey,
      viewerSceneReady: false,
    };
  }

  if (keepExistingViewerViewportHandoff) {
    return {
      pendingViewerLoadScopeKey,
      viewerSceneReady: false,
    };
  }

  if (!startViewerViewportHandoff && !continueViewerViewportHandoff) {
    if (hasPendingViewerHandoffForScope) {
      return {
        pendingViewerLoadScopeKey,
        viewerSceneReady: false,
      };
    }

    return {
      pendingViewerLoadScopeKey: null,
      viewerSceneReady: true,
    };
  }

  return {
    pendingViewerLoadScopeKey,
    viewerSceneReady: false,
  };
}
