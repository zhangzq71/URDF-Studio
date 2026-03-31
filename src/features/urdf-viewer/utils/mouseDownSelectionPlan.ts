import type { ViewerSceneMode } from '../types';

export interface MouseDownSelectionPlanOptions {
  mode?: ViewerSceneMode;
  linkName: string;
  jointName: string | null;
  subType: 'visual' | 'collision';
}

export interface MouseDownSelectionPlan {
  selectTarget:
    | { type: 'link'; id: string; subType: 'visual' | 'collision' }
    | { type: 'joint'; id: string };
  shouldApplyImmediateGeometryHighlight: boolean;
  shouldSyncMeshSelection: boolean;
}

export function resolveMouseDownSelectionPlan({
  mode,
  linkName,
  subType,
}: MouseDownSelectionPlanOptions): MouseDownSelectionPlan {
  void mode;

  return {
    selectTarget: { type: 'link', id: linkName, subType },
    shouldApplyImmediateGeometryHighlight: true,
    shouldSyncMeshSelection: true,
  };
}
