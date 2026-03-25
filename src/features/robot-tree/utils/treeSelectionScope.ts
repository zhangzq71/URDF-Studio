import type { Selection } from '@/store/selectionStore';
import type { RobotState } from '@/types';

type TreeJoint = RobotState['joints'][string];

export const EMPTY_TREE_SELECTION: Selection = { type: null, id: null };

export interface TreeNodeSelectionScope {
  directChildBranchLinkId: string | null;
  jointAttentionSelection: Selection;
  jointHoveredSelection: Selection;
  jointSelection: Selection;
  linkAttentionSelection: Selection;
  linkHoveredSelection: Selection;
  linkSelection: Selection;
  selectionInBranch: boolean;
}

interface TreeNodeSelectionScopeInput {
  attentionSelection: Selection;
  childJoints: TreeJoint[];
  hoveredSelection: Selection;
  jointsById: Record<string, TreeJoint>;
  linkId: string;
  parentLinkByChild?: Record<string, string>;
  readOnly: boolean;
  selection: Selection;
}

export function buildChildJointsByParent(
  joints: Record<string, TreeJoint>,
): Record<string, TreeJoint[]> {
  const grouped: Record<string, TreeJoint[]> = {};

  Object.values(joints).forEach((joint) => {
    if (!grouped[joint.parentLinkId]) {
      grouped[joint.parentLinkId] = [];
    }
    grouped[joint.parentLinkId].push(joint);
  });

  return grouped;
}

export function buildParentLinkByChild(
  joints: Record<string, TreeJoint>,
): Record<string, string> {
  const parentLinkByChild: Record<string, string> = {};

  Object.values(joints).forEach((joint) => {
    parentLinkByChild[joint.childLinkId] = joint.parentLinkId;
  });

  return parentLinkByChild;
}

function resolveSelectionBranchStartLinkId(
  selection: Selection,
  jointsById: Record<string, TreeJoint>,
): string | null {
  if (selection.type === 'link' && selection.id) {
    return selection.id;
  }

  if (selection.type === 'joint' && selection.id) {
    return jointsById[selection.id]?.parentLinkId ?? null;
  }

  return null;
}

function scopeLinkSelection(selection: Selection, linkId: string): Selection {
  return selection.type === 'link' && selection.id === linkId ? selection : EMPTY_TREE_SELECTION;
}

function scopeDirectChildJointSelection(selection: Selection, childJoints: TreeJoint[]): Selection {
  if (selection.type !== 'joint' || !selection.id) {
    return EMPTY_TREE_SELECTION;
  }

  return childJoints.some((joint) => joint.id === selection.id)
    ? selection
    : EMPTY_TREE_SELECTION;
}

export function getTreeNodeSelectionScope({
  attentionSelection,
  childJoints,
  hoveredSelection,
  jointsById,
  linkId,
  parentLinkByChild,
  readOnly,
  selection,
}: TreeNodeSelectionScopeInput): TreeNodeSelectionScope {
  const linkSelection = scopeLinkSelection(selection, linkId);
  const directChildBranchLinkId = parentLinkByChild
    ? resolveDirectChildBranchLinkId(linkId, selection, jointsById, parentLinkByChild)
    : null;

  return {
    directChildBranchLinkId,
    jointAttentionSelection: readOnly
      ? EMPTY_TREE_SELECTION
      : scopeDirectChildJointSelection(attentionSelection, childJoints),
    jointHoveredSelection: readOnly
      ? EMPTY_TREE_SELECTION
      : scopeDirectChildJointSelection(hoveredSelection, childJoints),
    jointSelection: scopeDirectChildJointSelection(selection, childJoints),
    linkAttentionSelection: readOnly ? EMPTY_TREE_SELECTION : scopeLinkSelection(attentionSelection, linkId),
    linkHoveredSelection: readOnly ? EMPTY_TREE_SELECTION : scopeLinkSelection(hoveredSelection, linkId),
    linkSelection,
    selectionInBranch: parentLinkByChild
      ? isLinkInSelectionBranch(linkId, selection, jointsById, parentLinkByChild)
      : false,
  };
}

export function isLinkInSelectionBranch(
  linkId: string,
  selection: Selection,
  jointsById: Record<string, TreeJoint>,
  parentLinkByChild: Record<string, string>,
): boolean {
  let currentLinkId = resolveSelectionBranchStartLinkId(selection, jointsById);

  while (currentLinkId) {
    if (currentLinkId === linkId) {
      return true;
    }
    currentLinkId = parentLinkByChild[currentLinkId] ?? null;
  }

  return false;
}

export function resolveDirectChildBranchLinkId(
  linkId: string,
  selection: Selection,
  jointsById: Record<string, TreeJoint>,
  parentLinkByChild: Record<string, string>,
): string | null {
  let currentLinkId = resolveSelectionBranchStartLinkId(selection, jointsById);
  let previousLinkId: string | null = null;

  while (currentLinkId) {
    if (currentLinkId === linkId) {
      return previousLinkId;
    }
    previousLinkId = currentLinkId;
    currentLinkId = parentLinkByChild[currentLinkId] ?? null;
  }

  return null;
}
