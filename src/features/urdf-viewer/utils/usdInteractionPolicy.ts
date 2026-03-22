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

export function resolveUsdStageInteractionPolicy(
  mode: 'detail' | 'hardware',
): UsdStageInteractionPolicy {
  if (mode === 'hardware') {
    return {
      enableContinuousHover: true,
      enableJointRotation: true,
      enableMeshSelection: false,
    };
  }

  return {
    enableContinuousHover: true,
    enableJointRotation: false,
    enableMeshSelection: true,
  };
}

export function resolveUsdStageJointRotationRuntime({
  highlightMode,
  mode,
  showVisual,
  showCollision,
  toolMode,
}: ResolveUsdStageJointRotationOptions): UsdStageJointRotationRuntime {
  if (toolMode === 'measure') {
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
