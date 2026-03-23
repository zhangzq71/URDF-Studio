export type ViewerHighlightMode = 'link' | 'collision';
export type InteractiveGeometrySubType = 'visual' | 'collision';

export interface EffectiveInteractionSubType {
  subType: InteractiveGeometrySubType | null;
  didFallback: boolean;
}

export function resolveEffectiveInteractionSubType(
  highlightMode: ViewerHighlightMode,
  showVisual: boolean,
  showCollision: boolean,
): EffectiveInteractionSubType {
  const preferredSubType: InteractiveGeometrySubType =
    highlightMode === 'collision' ? 'collision' : 'visual';
  const fallbackSubType: InteractiveGeometrySubType =
    preferredSubType === 'visual' ? 'collision' : 'visual';

  const isPreferredVisible =
    preferredSubType === 'visual' ? showVisual : showCollision;

  if (isPreferredVisible) {
    return { subType: preferredSubType, didFallback: false };
  }

  const isFallbackVisible =
    fallbackSubType === 'visual' ? showVisual : showCollision;

  if (isFallbackVisible) {
    return { subType: fallbackSubType, didFallback: true };
  }

  return { subType: null, didFallback: false };
}
