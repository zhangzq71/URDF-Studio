export type UnifiedViewerMode = 'skeleton' | 'detail' | 'hardware';

export interface UnifiedViewerMountState {
  viewerMounted: boolean;
  visualizerMounted: boolean;
}

export interface UnifiedViewerMountStateInput {
  mode: UnifiedViewerMode;
  isPreviewing: boolean;
}

export function isUnifiedViewerMode({
  mode,
  isPreviewing,
}: UnifiedViewerMountStateInput): boolean {
  return isPreviewing || mode === 'detail' || mode === 'hardware';
}

export function createInitialUnifiedViewerMountState(
  input: UnifiedViewerMountStateInput,
): UnifiedViewerMountState {
  const viewerMode = isUnifiedViewerMode(input);

  return {
    viewerMounted: viewerMode,
    visualizerMounted: !viewerMode,
  };
}

export function resolveUnifiedViewerMountState(
  currentState: UnifiedViewerMountState,
  input: UnifiedViewerMountStateInput,
): UnifiedViewerMountState {
  const viewerMode = isUnifiedViewerMode(input);

  return {
    viewerMounted: currentState.viewerMounted || viewerMode,
    visualizerMounted: currentState.visualizerMounted || !viewerMode,
  };
}
