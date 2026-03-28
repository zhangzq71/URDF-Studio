import type { ToolMode } from '../types.ts';
import {
  resolveEffectiveInteractionSubType,
  type InteractiveGeometrySubType,
  type ViewerHighlightMode,
} from './interactionMode.ts';

export interface UsdStageInteractionPolicy {
  enableContinuousHover: boolean;
  enableJointRotation: boolean;
  enableMeshSelection: boolean;
}

export interface ResolveUsdStageJointRotationOptions {
  mode: 'detail' | 'hardware';
  highlightMode: ViewerHighlightMode;
  showVisual: boolean;
  showCollision: boolean;
  toolMode: ToolMode;
}

export interface UsdStageJointRotationRuntime {
  enabled: boolean;
  pickSubType: InteractiveGeometrySubType | null;
}

function isInteractiveSelectionEnabledForToolMode(toolMode: ToolMode): boolean {
  return toolMode !== 'view' && toolMode !== 'face';
}

export function isContinuousHoverEnabledForToolMode(toolMode: ToolMode): boolean {
  return toolMode !== 'view';
}

export function resolveUsdStageInteractionPolicy(
  mode: 'detail' | 'hardware',
  toolMode: ToolMode = 'select',
): UsdStageInteractionPolicy {
  const enableContinuousHover = isContinuousHoverEnabledForToolMode(toolMode);
  const enableSelection = isInteractiveSelectionEnabledForToolMode(toolMode);

  if (mode === 'hardware') {
    return {
      enableContinuousHover,
      enableJointRotation: enableSelection,
      enableMeshSelection: false,
    };
  }

  return {
    enableContinuousHover,
    enableJointRotation: false,
    enableMeshSelection: enableSelection,
  };
}

export function resolveUsdStageJointRotationRuntime({
  highlightMode,
  mode,
  showVisual,
  showCollision,
  toolMode,
}: ResolveUsdStageJointRotationOptions): UsdStageJointRotationRuntime {
  if (toolMode === 'measure' || !isInteractiveSelectionEnabledForToolMode(toolMode)) {
    return {
      enabled: false,
      pickSubType: null,
    };
  }

  const { subType } = resolveEffectiveInteractionSubType(
    highlightMode,
    showVisual,
    showCollision,
  );

  if (subType !== 'visual') {
    return {
      enabled: false,
      pickSubType: subType,
    };
  }

  return {
    enabled: mode === 'detail' || mode === 'hardware',
    pickSubType: subType,
  };
}
