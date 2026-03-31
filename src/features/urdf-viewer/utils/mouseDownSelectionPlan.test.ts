import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMouseDownSelectionPlan } from './mouseDownSelectionPlan.ts';

test('mode `detail` keeps mesh selection sync for clicked link geometry', () => {
  const result = resolveMouseDownSelectionPlan({
    mode: 'detail',
    linkName: 'forearm_link',
    jointName: 'elbow_joint',
    subType: 'visual',
  });

  assert.deepEqual(result, {
    selectTarget: { type: 'link', id: 'forearm_link', subType: 'visual' },
    shouldApplyImmediateGeometryHighlight: true,
    shouldSyncMeshSelection: true,
  });
});

test('detail mode keeps the same link geometry selection semantics for repeated clicks', () => {
  const result = resolveMouseDownSelectionPlan({
    mode: 'detail',
    linkName: 'forearm_link',
    jointName: 'elbow_joint',
    subType: 'visual',
  });

  assert.deepEqual(result, {
    selectTarget: { type: 'link', id: 'forearm_link', subType: 'visual' },
    shouldApplyImmediateGeometryHighlight: true,
    shouldSyncMeshSelection: true,
  });
});

test('detail mode keeps collision mesh selection metadata when no joint exists', () => {
  const result = resolveMouseDownSelectionPlan({
    mode: 'detail',
    linkName: 'base_link',
    jointName: null,
    subType: 'collision',
  });

  assert.deepEqual(result, {
    selectTarget: { type: 'link', id: 'base_link', subType: 'collision' },
    shouldApplyImmediateGeometryHighlight: true,
    shouldSyncMeshSelection: true,
  });
});
