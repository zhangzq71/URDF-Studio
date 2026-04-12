import type { ToolMode } from '../types';

export const DEFAULT_SELECT_CLICK_DRAG_THRESHOLD_PX = 6;

export interface PointerClickThresholdOptions {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thresholdPx?: number;
}

export interface PointerInteractionFinalizationOptions {
  interactionStarted: boolean;
  dragging: boolean;
  hasPendingSelection: boolean;
}

export function shouldDeferSelectionUntilPointerUp(
  toolMode: ToolMode,
  hasDirectJointDragTarget = false,
  hasDeferredViewModeSelection = false,
  hasHelperTarget = false,
): boolean {
  if (hasHelperTarget) {
    return false;
  }

  return (
    (toolMode === 'select' && !hasDirectJointDragTarget) ||
    (toolMode === 'view' && hasDeferredViewModeSelection)
  );
}

export function isPointerInteractionWithinClickThreshold({
  startX,
  startY,
  endX,
  endY,
  thresholdPx = DEFAULT_SELECT_CLICK_DRAG_THRESHOLD_PX,
}: PointerClickThresholdOptions): boolean {
  const dx = endX - startX;
  const dy = endY - startY;
  return dx * dx + dy * dy <= thresholdPx * thresholdPx;
}

export function shouldFinalizePointerInteraction({
  interactionStarted,
  dragging,
  hasPendingSelection,
}: PointerInteractionFinalizationOptions): boolean {
  return interactionStarted || dragging || hasPendingSelection;
}
