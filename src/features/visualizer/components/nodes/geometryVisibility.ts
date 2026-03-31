import type { AppMode } from '@/types';

export interface GeometryVisibilityState {
  shouldRender: boolean;
  visible: boolean;
  interactive: boolean;
}

interface ResolveGeometryVisibilityStateOptions {
  mode: AppMode;
  isCollision: boolean;
  showGeometry: boolean;
  showCollision: boolean;
}

export function resolveGeometryVisibilityState({
  mode,
  isCollision,
  showGeometry,
  showCollision,
}: ResolveGeometryVisibilityStateOptions): GeometryVisibilityState {
  void mode;
  void showGeometry;

  if (isCollision) {
    if (!showCollision) {
      return { shouldRender: false, visible: false, interactive: false };
    }

    return { shouldRender: true, visible: true, interactive: true };
  }

  return { shouldRender: true, visible: true, interactive: true };
}
