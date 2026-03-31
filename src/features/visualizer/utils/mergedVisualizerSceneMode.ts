import type { AppMode } from '@/types';

export interface ResolveMergedVisualizerJointPresentationOptions {
  mode: AppMode;
  showGeometry: boolean;
  showJointLabel: boolean;
  showOrigin: boolean;
  showJointAxes: boolean;
}

export interface MergedVisualizerJointPresentation {
  showConnectorLine: boolean;
  connectorDashed: boolean;
  showHelperSphere: boolean;
}

export function resolveMergedVisualizerJointPresentation({
  mode,
  showGeometry,
  showJointLabel,
  showOrigin,
  showJointAxes,
}: ResolveMergedVisualizerJointPresentationOptions): MergedVisualizerJointPresentation {
  void mode;
  void showGeometry;

  return {
    showConnectorLine: showJointLabel,
    connectorDashed: false,
    // When another visible joint affordance is already on screen, keep the
    // surrounding canvas truly draggable instead of leaving hidden pick pads.
    showHelperSphere: !showOrigin && !showJointAxes && !showJointLabel,
  };
}

export function shouldRenderMergedVisualizerConstraintOverlay(
  mode: AppMode,
): boolean {
  void mode;
  return false;
}

export function shouldEnableMergedVisualizerJointTransformControls(
  mode: AppMode,
): boolean {
  void mode;
  return true;
}
