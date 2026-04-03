import type { ViewerDocumentLoadEvent } from '../types';

const USD_BOOTSTRAP_HANDOFF_PROGRESS_PERCENT = 96;

export function normalizeUsdBootstrapDocumentLoadEvent(
  event: ViewerDocumentLoadEvent,
  options: {
    useUsdOffscreenBootstrap: boolean;
  },
): ViewerDocumentLoadEvent {
  if (!options.useUsdOffscreenBootstrap || event.status !== 'ready') {
    return event;
  }

  return {
    status: 'loading',
    phase: 'finalizing-scene',
    message: null,
    progressPercent: USD_BOOTSTRAP_HANDOFF_PROGRESS_PERCENT,
    loadedCount: null,
    totalCount: null,
    error: null,
  };
}

