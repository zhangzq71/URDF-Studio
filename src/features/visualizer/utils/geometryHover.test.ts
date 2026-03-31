import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGeometryHoverTargetSelection,
  matchesGeometryHoverSelection,
} from './geometryHover.ts';

test('visual hover targets match label-level hover selection without subtype metadata', () => {
  const target = createGeometryHoverTargetSelection('arm_link', 'visual', 0);

  assert.equal(
    matchesGeometryHoverSelection({ type: 'link', id: 'arm_link' }, target),
    true,
  );
});

test('clear-path matching does not treat label-level hover as geometry-owned hover', () => {
  const target = createGeometryHoverTargetSelection('arm_link', 'visual', 0);

  assert.equal(
    matchesGeometryHoverSelection(
      { type: 'link', id: 'arm_link' },
      target,
      { allowLabelHoverFallback: false },
    ),
    false,
  );
});

test('visual hover targets treat undefined and zero object indexes as the same visual body', () => {
  const target = createGeometryHoverTargetSelection('arm_link', 'visual', 0);

  assert.equal(
    matchesGeometryHoverSelection(
      { type: 'link', id: 'arm_link', subType: 'visual', objectIndex: undefined },
      target,
    ),
    true,
  );
});

test('collision hover targets require the same collision object index', () => {
  const target = createGeometryHoverTargetSelection('arm_link', 'collision', 2);

  assert.equal(
    matchesGeometryHoverSelection(
      { type: 'link', id: 'arm_link', subType: 'collision', objectIndex: 2 },
      target,
    ),
    true,
  );
  assert.equal(
    matchesGeometryHoverSelection(
      { type: 'link', id: 'arm_link', subType: 'collision', objectIndex: 1 },
      target,
    ),
    false,
  );
});

test('hover selections for other links or joints do not match a geometry hover target', () => {
  const target = createGeometryHoverTargetSelection('arm_link', 'visual', 0);

  assert.equal(
    matchesGeometryHoverSelection({ type: 'joint', id: 'shoulder_joint' }, target),
    false,
  );
  assert.equal(
    matchesGeometryHoverSelection({ type: 'link', id: 'forearm_link', subType: 'visual' }, target),
    false,
  );
});
