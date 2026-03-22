import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  beginInitialGroundAlignment,
  hasInitialGroundAlignment,
  setPreserveAuthoredRootTransform,
  shouldPreserveAuthoredRootTransform,
} from './robotPositioning.ts';

test('preserve authored root transform flag is opt-in on runtime robots', () => {
  const robot = new THREE.Group();

  assert.equal(shouldPreserveAuthoredRootTransform(robot), false);

  setPreserveAuthoredRootTransform(robot, true);
  assert.equal(shouldPreserveAuthoredRootTransform(robot), true);

  setPreserveAuthoredRootTransform(robot, false);
  assert.equal(shouldPreserveAuthoredRootTransform(robot), false);
});

test('initial ground alignment only begins once per runtime robot', () => {
  const robot = new THREE.Group();

  assert.equal(hasInitialGroundAlignment(robot), false);
  assert.equal(beginInitialGroundAlignment(robot), true);
  assert.equal(hasInitialGroundAlignment(robot), true);
  assert.equal(beginInitialGroundAlignment(robot), false);
});
