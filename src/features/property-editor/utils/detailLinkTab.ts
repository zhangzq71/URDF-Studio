import type { DetailLinkTab } from '@/types';

export function resolveDetailLinkTabAfterViewerMeshSelect(
  currentTab: DetailLinkTab,
  objectType: 'visual' | 'collision',
): DetailLinkTab {
  if (objectType === 'collision') {
    return 'collision';
  }

  return currentTab;
}

export function resolveDetailLinkTabAfterGeometrySelection(
  subType: 'visual' | 'collision',
): DetailLinkTab {
  return subType;
}
