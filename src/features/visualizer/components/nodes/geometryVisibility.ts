export interface GeometryVisibilityState {
  shouldRender: boolean;
  visible: boolean;
  interactive: boolean;
}

interface ResolveGeometryVisibilityStateOptions {
  mode: 'skeleton' | 'detail' | 'hardware';
  isCollision: boolean;
  showGeometry: boolean;
  showCollision: boolean;
}

/**
 * Skeleton mode still needs visual meshes mounted while hidden so ground
 * alignment can use the same lowest-point baseline as Detail mode.
 */
export function resolveGeometryVisibilityState({
  mode,
  isCollision,
  showGeometry,
  showCollision,
}: ResolveGeometryVisibilityStateOptions): GeometryVisibilityState {
  if (mode === 'detail') {
    if (isCollision && !showCollision) {
      return { shouldRender: false, visible: false, interactive: false };
    }

    return { shouldRender: true, visible: true, interactive: true };
  }

  if (isCollision) {
    return { shouldRender: false, visible: false, interactive: false };
  }

  if (mode === 'skeleton' && !showGeometry) {
    return { shouldRender: true, visible: false, interactive: false };
  }

  return { shouldRender: true, visible: true, interactive: true };
}
