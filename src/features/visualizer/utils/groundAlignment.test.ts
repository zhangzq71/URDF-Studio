import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { resetSyntheticRootGroundOffset } from './groundAlignment.ts';

test('resetSyntheticRootGroundOffset clears stale grounded z offsets on synthetic roots', () => {
  const root = new THREE.Group();
  root.position.set(0, 0, 1.0442);

  const changed = resetSyntheticRootGroundOffset(root);

  assert.equal(changed, true);
  assert.equal(root.position.z, 0);
});

test('resetSyntheticRootGroundOffset is a no-op when the root is already neutral', () => {
  const root = new THREE.Group();

  const changed = resetSyntheticRootGroundOffset(root);

  assert.equal(changed, false);
  assert.equal(root.position.z, 0);
});
