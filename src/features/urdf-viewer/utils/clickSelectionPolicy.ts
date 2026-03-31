import type { ToolMode } from '../types';

export const DEFAULT_SELECT_CLICK_DRAG_THRESHOLD_PX = 6;

export interface PointerClickThresholdOptions {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thresholdPx?: number;
}

export function shouldDeferSelectionUntilPointerUp(
  toolMode: ToolMode,
  hasDirectJointDragTarget = false,
): boolean {
  return toolMode === 'select' && !hasDirectJointDragTarget;
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
