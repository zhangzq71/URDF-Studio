import type { ResolvedInteractionSelectionHit } from './selectionTargets';

export interface ResolvedHoverInteractionCandidate extends ResolvedInteractionSelectionHit {
  distance: number;
}

export interface HoverInteractionResolution {
  primaryInteraction: ResolvedHoverInteractionCandidate | null;
}

export function resolveHoverInteractionResolution(
  candidates: ResolvedHoverInteractionCandidate[],
): HoverInteractionResolution {
  return {
    primaryInteraction: candidates[0] ?? null,
  };
}
