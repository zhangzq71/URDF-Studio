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
  return state.format === 'usd'
    && (state.status === 'loading' || state.status === 'hydrating');
}

export function resolveDocumentLoadingOverlayPresentation(
  state: DocumentLoadingOverlayLikeState,
): DocumentLoadingOverlayPresentation {
  const blocksViewport = shouldBlockDocumentViewport(state);

  return {
    blocksViewport,
    overlayClassName: blocksViewport
      ? 'absolute inset-0 z-20 flex items-center justify-center bg-google-light-bg/96 dark:bg-google-dark-bg/96 p-4 backdrop-blur-[3px]'
      : 'pointer-events-none absolute inset-0 z-20 flex items-end justify-end p-4',
    hudWrapperClassName: blocksViewport
      ? 'pointer-events-none flex w-full items-center justify-center'
      : undefined,
  };
}
