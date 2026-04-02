export type UnsavedChangesSaveScope = 'all' | 'robot' | 'assembly';

type UnsavedChangesBaselineMarker = ((scope?: UnsavedChangesSaveScope) => void) | null;

let unsavedChangesBaselineMarker: UnsavedChangesBaselineMarker = null;

export function registerUnsavedChangesBaselineMarker(marker: UnsavedChangesBaselineMarker) {
  unsavedChangesBaselineMarker = marker;
}

export function markUnsavedChangesBaselineSaved(scope: UnsavedChangesSaveScope = 'all') {
  unsavedChangesBaselineMarker?.(scope);
}
