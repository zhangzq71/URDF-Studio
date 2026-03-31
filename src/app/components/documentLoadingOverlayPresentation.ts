export interface DocumentLoadingOverlayLikeState {
  status: 'idle' | 'loading' | 'hydrating' | 'ready' | 'error';
  format?: string | null;
}

export interface DocumentLoadingOverlayPresentation {
  blocksViewport: boolean;
  overlayClassName: string;
  hudWrapperClassName?: string;
}

export function shouldBlockDocumentViewport(state: DocumentLoadingOverlayLikeState): boolean {
  void state;
  return false;
}

export function resolveDocumentLoadingOverlayPresentation(
  state: DocumentLoadingOverlayLikeState,
): DocumentLoadingOverlayPresentation {
  const blocksViewport = shouldBlockDocumentViewport(state);

  return {
    blocksViewport,
    // Keep the workspace canvas visible while documents stream in so the user
    // still sees the horizon, grid, and existing empty-stage context instead of
    // a near-opaque white curtain.
    overlayClassName: 'pointer-events-none absolute inset-0 z-20 flex items-end justify-end p-4',
    hudWrapperClassName: undefined,
  };
}
