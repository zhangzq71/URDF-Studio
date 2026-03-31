interface ResolveUnifiedViewerLoadReleaseStateArgs {
  pendingViewerLoadScopeKey: string | null;
  viewerLoadScopeKey: string;
}

export interface UnifiedViewerLoadReleaseState {
  canReleaseViewerLoadScope: boolean;
  pendingViewerLoadScopeKey: string | null;
  releasedViewerLoadScopeKey: string | null;
  viewerSceneReady: boolean;
}

export function resolveUnifiedViewerLoadReleaseState({
  pendingViewerLoadScopeKey,
  viewerLoadScopeKey,
}: ResolveUnifiedViewerLoadReleaseStateArgs): UnifiedViewerLoadReleaseState {
  const hasMismatchedPendingScope = pendingViewerLoadScopeKey !== null
    && pendingViewerLoadScopeKey !== viewerLoadScopeKey;

  if (hasMismatchedPendingScope) {
    return {
      canReleaseViewerLoadScope: false,
      pendingViewerLoadScopeKey,
      releasedViewerLoadScopeKey: null,
      viewerSceneReady: false,
    };
  }

  return {
    canReleaseViewerLoadScope: true,
    pendingViewerLoadScopeKey: pendingViewerLoadScopeKey === viewerLoadScopeKey
      ? null
      : pendingViewerLoadScopeKey,
    releasedViewerLoadScopeKey: viewerLoadScopeKey,
    viewerSceneReady: true,
  };
}
