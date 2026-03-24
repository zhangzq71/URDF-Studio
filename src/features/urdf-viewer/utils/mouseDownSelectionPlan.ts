export interface MouseDownSelectionPlanOptions {
  mode?: 'detail' | 'hardware';
  linkName: string;
  jointName: string | null;
  subType: 'visual' | 'collision';
}

export interface MouseDownSelectionPlan {
  selectTarget:
    | { type: 'link'; id: string; subType: 'visual' | 'collision' }
    | { type: 'joint'; id: string };
  shouldSyncMeshSelection: boolean;
}

export function resolveMouseDownSelectionPlan({
  mode,
  linkName,
  jointName,
  subType,
}: MouseDownSelectionPlanOptions): MouseDownSelectionPlan {
  if (mode === 'detail') {
    return {
      selectTarget: { type: 'link', id: linkName, subType },
      shouldSyncMeshSelection: true,
    };
  }

  if (jointName) {
    return {
      selectTarget: { type: 'joint', id: jointName },
      shouldSyncMeshSelection: false,
    };
  }

  return {
    selectTarget: { type: 'link', id: linkName, subType },
    shouldSyncMeshSelection: false,
  };
}
