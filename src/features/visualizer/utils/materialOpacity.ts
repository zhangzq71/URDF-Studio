interface ResolveVisualizerMaterialOpacityOptions {
  isCollision: boolean;
  isHovered: boolean;
  isSelected: boolean;
  modelOpacity: number;
}

export function resolveVisualizerMaterialOpacity({
  isCollision,
  isHovered,
  isSelected,
  modelOpacity,
}: ResolveVisualizerMaterialOpacityOptions): number {
  if (isCollision) {
    return isSelected || isHovered ? 0.6 : 0.3;
  }

  const normalizedOpacity = Number.isFinite(modelOpacity)
    ? Math.max(0.1, Math.min(1, modelOpacity))
    : 1;

  return normalizedOpacity;
}
