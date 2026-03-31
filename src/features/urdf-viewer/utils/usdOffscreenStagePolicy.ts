import type { ToolMode, URDFViewerProps } from '../types';
import { supportsUsdWorkerRenderer } from './usdWorkerRendererSupport';

interface ShouldUseUsdOffscreenStageOptions {
  toolMode: ToolMode;
  selection?: URDFViewerProps['selection'];
  hoveredSelection?: URDFViewerProps['hoveredSelection'];
  focusTarget?: string | null;
  workerRendererSupported?: boolean;
}

function hasResolvedSelection(
  selection?: URDFViewerProps['selection'] | URDFViewerProps['hoveredSelection'],
): boolean {
  return Boolean(
    selection
      && selection.type !== null
      && selection.id !== null
      && String(selection.id).trim() !== '',
  );
}

export function shouldUseUsdOffscreenStage({
  toolMode,
  selection,
  hoveredSelection,
  focusTarget,
  workerRendererSupported = supportsUsdWorkerRenderer(),
}: ShouldUseUsdOffscreenStageOptions): boolean {
  if (!workerRendererSupported) {
    return false;
  }

  if (toolMode !== 'view') {
    return false;
  }

  if (hasResolvedSelection(selection) || hasResolvedSelection(hoveredSelection)) {
    return false;
  }

  if (typeof focusTarget === 'string' && focusTarget.trim() !== '') {
    return false;
  }

  return true;
}
