import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  DEFAULT_WORKSPACE_ORBIT_CLIPPING,
  syncWorkspacePerspectiveClipPlanes,
} from './workspaceOrbitClipping.ts';

test('syncWorkspacePerspectiveClipPlanes tightens perspective clip planes for close inspection', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 5, 50);
  camera.position.set(0.24, 0.24, 0.24);

  const controls = {
    target: new THREE.Vector3(0, 0, 0),
  };

  const changed = syncWorkspacePerspectiveClipPlanes(camera, controls);

  assert.equal(changed, true);

  const distance = camera.position.distanceTo(controls.target);
  const expectedNear = THREE.MathUtils.clamp(
    distance * DEFAULT_WORKSPACE_ORBIT_CLIPPING.nearFactor,
    DEFAULT_WORKSPACE_ORBIT_CLIPPING.minNear,
    DEFAULT_WORKSPACE_ORBIT_CLIPPING.maxNear,
  );
  const expectedFar = Math.max(
    expectedNear + 10,
    THREE.MathUtils.clamp(
      distance * DEFAULT_WORKSPACE_ORBIT_CLIPPING.farFactor,
      DEFAULT_WORKSPACE_ORBIT_CLIPPING.minFar,
      DEFAULT_WORKSPACE_ORBIT_CLIPPING.maxFar,
    ),
  );

  assert.equal(camera.near, expectedNear);
  assert.equal(camera.far, expectedFar);
  assert.ok(camera.near < 0.01, 'expected near plane to stay conservative for close zooms');
});

test('syncWorkspacePerspectiveClipPlanes leaves orthographic cameras untouched', () => {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 500);
  const controls = {
    target: new THREE.Vector3(0, 0, 0),
  };

  const changed = syncWorkspacePerspectiveClipPlanes(camera, controls);

  assert.equal(changed, false);
  assert.equal(camera.near, 0.5);
  assert.equal(camera.far, 500);
});
