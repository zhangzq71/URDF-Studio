import type { ViewerInteractiveLayer } from '../types';

export interface ResolveInteractiveLayerPriorityOptions {
  showVisual: boolean;
  showCollision: boolean;
  showCollisionAlwaysOnTop: boolean;
  showOrigins: boolean;
  showOriginsOverlay: boolean;
  showJointAxes: boolean;
  showJointAxesOverlay: boolean;
  showCenterOfMass: boolean;
  showCoMOverlay: boolean;
  showInertia: boolean;
  showInertiaOverlay: boolean;
  activationOrder: Record<ViewerInteractiveLayer, number>;
}

const BASE_LAYER_PRIORITY: Record<ViewerInteractiveLayer, number> = {
  visual: 6,
  collision: 5,
  'origin-axes': 4,
  'joint-axis': 3,
  'center-of-mass': 2,
  inertia: 1,
};

function getVisibleLayers({
  showVisual,
  showCollision,
  showOrigins,
  showJointAxes,
  showCenterOfMass,
  showInertia,
}: ResolveInteractiveLayerPriorityOptions): ViewerInteractiveLayer[] {
  const layers: ViewerInteractiveLayer[] = [];

  if (showVisual) layers.push('visual');
  if (showCollision) layers.push('collision');
  if (showOrigins) layers.push('origin-axes');
  if (showJointAxes) layers.push('joint-axis');
  if (showCenterOfMass) layers.push('center-of-mass');
  if (showInertia) layers.push('inertia');

  return layers;
}

function isOverlayLayer(
  layer: ViewerInteractiveLayer,
  options: ResolveInteractiveLayerPriorityOptions,
): boolean {
  switch (layer) {
    case 'collision':
      return options.showCollisionAlwaysOnTop;
    case 'origin-axes':
      return options.showOriginsOverlay;
    case 'joint-axis':
      return options.showJointAxesOverlay;
    case 'center-of-mass':
      return options.showCoMOverlay;
    case 'inertia':
      return options.showInertiaOverlay;
    case 'visual':
    default:
      return false;
  }
}

export function resolveInteractiveLayerPriority(
  options: ResolveInteractiveLayerPriorityOptions,
): ViewerInteractiveLayer[] {
  return getVisibleLayers(options).sort((left, right) => {
    const overlayDelta = Number(isOverlayLayer(right, options)) - Number(isOverlayLayer(left, options));
    if (overlayDelta !== 0) {
      return overlayDelta;
    }

    const activationDelta = (options.activationOrder[right] ?? 0) - (options.activationOrder[left] ?? 0);
    if (activationDelta !== 0) {
      return activationDelta;
    }

    return BASE_LAYER_PRIORITY[right] - BASE_LAYER_PRIORITY[left];
  });
}
