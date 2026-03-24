import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMouseDownSelectionPlan } from './mouseDownSelectionPlan.ts';

test('detail mode keeps mesh selection sync for clicked link geometry', () => {
  const result = resolveMouseDownSelectionPlan({
    mode: 'detail',
    linkName: 'forearm_link',
    jointName: 'elbow_joint',
    subType: 'visual',
  });

  assert.deepEqual(result, {
    selectTarget: { type: 'link', id: 'forearm_link', subType: 'visual' },
    shouldSyncMeshSelection: true,
  });
});

test('hardware mode selects the parent joint without mesh selection churn', () => {
  const result = resolveMouseDownSelectionPlan({
    mode: 'hardware',
    linkName: 'forearm_link',
    jointName: 'elbow_joint',
    subType: 'visual',
  });

  assert.deepEqual(result, {
    selectTarget: { type: 'joint', id: 'elbow_joint' },
    shouldSyncMeshSelection: false,
  });
});

test('hardware mode falls back to link selection when no controllable joint exists', () => {
  const result = resolveMouseDownSelectionPlan({
    mode: 'hardware',
    linkName: 'base_link',
    jointName: null,
    subType: 'collision',
  });

  assert.deepEqual(result, {
    selectTarget: { type: 'link', id: 'base_link', subType: 'collision' },
    shouldSyncMeshSelection: false,
  });
});
