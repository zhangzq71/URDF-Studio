import test from 'node:test';
import assert from 'node:assert/strict';

import type { Selection } from '@/store/selectionStore';

import {
  EMPTY_TREE_SELECTION,
  buildParentLinkByChild,
  getTreeNodeSelectionScope,
  resolveDirectChildBranchLinkId,
} from './treeSelectionScope.ts';

const joints = {
  elbow: {
    id: 'elbow',
    name: 'elbow',
    parentLinkId: 'shoulder',
    childLinkId: 'forearm',
  },
  wrist: {
    id: 'wrist',
    name: 'wrist',
    parentLinkId: 'forearm',
    childLinkId: 'gripper',
  },
} as const;

const parentLinkByChild = buildParentLinkByChild(joints);

test('resolves the direct child branch link for a selected descendant link', () => {
  assert.equal(
    resolveDirectChildBranchLinkId(
      'shoulder',
      { type: 'link', id: 'gripper' },
      joints,
      parentLinkByChild,
    ),
    'forearm',
  );
});

test('does not mark a direct child branch for a joint selected on the current link', () => {
  assert.equal(
    resolveDirectChildBranchLinkId(
      'shoulder',
      { type: 'joint', id: 'elbow' },
      joints,
      parentLinkByChild,
    ),
    null,
  );
});

test('scopes tree node selections to the current link and its direct child joints', () => {
  const hoveredSelection: Selection = { type: 'joint', id: 'wrist' };
  const scope = getTreeNodeSelectionScope({
    attentionSelection: EMPTY_TREE_SELECTION,
    childJoints: [joints.elbow],
    hoveredSelection,
    jointsById: joints,
    linkId: 'shoulder',
    parentLinkByChild,
    readOnly: false,
    selection: { type: 'link', id: 'gripper' },
  });

  assert.deepEqual(scope.linkSelection, EMPTY_TREE_SELECTION);
  assert.deepEqual(scope.jointHoveredSelection, EMPTY_TREE_SELECTION);
  assert.equal(scope.selectionInBranch, true);
  assert.equal(scope.directChildBranchLinkId, 'forearm');
});

test('retains local joint selection and strips hover state in read-only mode', () => {
  const selectedJoint: Selection = { type: 'joint', id: 'elbow' };
  const hoveredSelection: Selection = { type: 'link', id: 'shoulder' };
  const scope = getTreeNodeSelectionScope({
    attentionSelection: hoveredSelection,
    childJoints: [joints.elbow],
    hoveredSelection,
    jointsById: joints,
    linkId: 'shoulder',
    parentLinkByChild,
    readOnly: true,
    selection: selectedJoint,
  });

  assert.deepEqual(scope.jointSelection, selectedJoint);
  assert.deepEqual(scope.linkHoveredSelection, EMPTY_TREE_SELECTION);
  assert.deepEqual(scope.linkAttentionSelection, EMPTY_TREE_SELECTION);
});
