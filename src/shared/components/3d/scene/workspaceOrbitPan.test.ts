import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  DEFAULT_WORKSPACE_ORBIT_PAN_TUNING,
  resolveWorkspaceOrbitPanSpeed,
} from './workspaceOrbitPan.ts';

test('resolveWorkspaceOrbitPanSpeed keeps the base speed when zoom level is comfortable', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(2, 0, 0);

  const panSpeed = resolveWorkspaceOrbitPanSpeed({
    basePanSpeed: 0.9,
    camera,
    target: new THREE.Vector3(0, 0, 0),
    sceneBounds: new THREE.Box3(
      new THREE.Vector3(-0.5, -0.5, -0.5),
      new THREE.Vector3(0.5, 0.5, 0.5),
    ),
    minDistance: 0.1,
  });

  assert.equal(panSpeed, 0.9);
});

test('resolveWorkspaceOrbitPanSpeed boosts close-range panning for perspective inspection', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0.12, 0, 0);

  const sceneBounds = new THREE.Box3(
    new THREE.Vector3(-0.5, -0.5, -0.5),
    new THREE.Vector3(0.5, 0.5, 0.5),
  );
  const distanceFloor =
    sceneBounds.getSize(new THREE.Vector3()).length() *
    DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.closeRangeDistanceFactor;

  const panSpeed = resolveWorkspaceOrbitPanSpeed({
    basePanSpeed: 0.9,
    camera,
    target: new THREE.Vector3(0, 0, 0),
    sceneBounds,
    minDistance: 0.02,
  });

  assert.ok(panSpeed > 0.9, 'expected close inspection to receive a pan speed boost');
  assert.equal(panSpeed, 0.9 * (distanceFloor / 0.12));
});

test('resolveWorkspaceOrbitPanSpeed caps the boost so ultra-close zooms do not overshoot', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0.01, 0, 0);

  const panSpeed = resolveWorkspaceOrbitPanSpeed({
    basePanSpeed: 0.9,
    camera,
    target: new THREE.Vector3(0, 0, 0),
    sceneBounds: new THREE.Box3(
      new THREE.Vector3(-0.5, -0.5, -0.5),
      new THREE.Vector3(0.5, 0.5, 0.5),
    ),
    minDistance: 0.02,
  });

  assert.equal(panSpeed, 0.9 * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.maxBoost);
});

test('resolveWorkspaceOrbitPanSpeed allows stronger boosts for elongated joint chains', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0.1, 0, 0);

  const sceneBounds = new THREE.Box3(
    new THREE.Vector3(-0.05, -0.05, -0.05),
    new THREE.Vector3(0.05, 0.05, 50),
  );
  const sceneDiagonal = sceneBounds.getSize(new THREE.Vector3()).length();
  const expectedMaxBoost = THREE.MathUtils.clamp(
    sceneDiagonal * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.largeSceneBoostFactor,
    DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.maxBoost,
    DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.maxLargeSceneBoost,
  );

  const panSpeed = resolveWorkspaceOrbitPanSpeed({
    basePanSpeed: 0.9,
    camera,
    target: new THREE.Vector3(0, 0, 0),
    sceneBounds,
    minDistance: 0.02,
  });

  assert.ok(
    panSpeed > 0.9 * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.maxBoost,
    'expected elongated scenes to lift the default max boost cap',
  );
  assert.equal(panSpeed, 0.9 * expectedMaxBoost);
});

test('resolveWorkspaceOrbitPanSpeed falls back to minDistance when scene bounds are unavailable', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0.05, 0, 0);

  const panSpeed = resolveWorkspaceOrbitPanSpeed({
    basePanSpeed: 0.9,
    camera,
    target: new THREE.Vector3(0, 0, 0),
    minDistance: 0.1,
  });

  assert.equal(panSpeed, 0.9 * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.maxBoost);
});

test('resolveWorkspaceOrbitPanSpeed leaves orthographic cameras unchanged', () => {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  camera.position.set(0.02, 0, 0);

  const panSpeed = resolveWorkspaceOrbitPanSpeed({
    basePanSpeed: 0.9,
    camera,
    target: new THREE.Vector3(0, 0, 0),
    minDistance: 0.1,
  });

  assert.equal(panSpeed, 0.9);
});
