import test from 'node:test';
import assert from 'node:assert/strict';

import type { Selection } from '@/store/selectionStore';
import { DEFAULT_JOINT, JointType, type UrdfJoint } from '@/types';

import {
  EMPTY_TREE_SELECTION,
  buildParentLinkByChild,
  getTreeNodeSelectionScope,
  resolveDirectChildBranchLinkId,
  resolveTreeSelectionIdentity,
} from './treeSelectionScope.ts';

const joints: Record<string, UrdfJoint> = {
  elbow: {
    ...DEFAULT_JOINT,
    id: 'elbow',
    name: 'elbow',
    type: JointType.REVOLUTE,
    parentLinkId: 'shoulder',
    childLinkId: 'forearm',
  },
  wrist: {
    ...DEFAULT_JOINT,
    id: 'wrist',
    name: 'wrist',
    type: JointType.REVOLUTE,
    parentLinkId: 'forearm',
    childLinkId: 'gripper',
  },
};

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

test('resolves joint selections addressed by joint name back to the canonical joint id', () => {
  assert.deepEqual(
    resolveTreeSelectionIdentity(
      { type: 'joint', id: 'elbow' },
      {
        links: {},
        joints: {
          elbow_joint_id: {
            ...joints.elbow,
            id: 'elbow_joint_id',
            name: 'elbow',
          },
        },
      },
    ),
    { type: 'joint', id: 'elbow_joint_id' },
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
