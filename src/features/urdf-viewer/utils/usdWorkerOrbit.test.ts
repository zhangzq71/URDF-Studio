import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  applyUsdWorkerOrbitPointerDelta,
  applyUsdWorkerOrbitToCamera,
  applyUsdWorkerOrbitZoomDelta,
  createUsdWorkerOrbitState,
} from './usdWorkerOrbit.ts';

function assertApprox(actual: number, expected: number, epsilon = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
}

test('createUsdWorkerOrbitState round-trips the camera position through applyUsdWorkerOrbitToCamera', () => {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1000);
  camera.position.set(2.6, -2.6, 4.6);
  const target = new THREE.Vector3(0, 0, 0);

  const orbit = createUsdWorkerOrbitState(camera.position, target);
  camera.position.set(0, 0, 0);

  applyUsdWorkerOrbitToCamera(orbit, camera);

  assertApprox(camera.position.x, 2.6);
  assertApprox(camera.position.y, -2.6);
  assertApprox(camera.position.z, 4.6);
});

test('applyUsdWorkerOrbitPointerDelta clamps the polar angle away from the singularities', () => {
  const orbit = createUsdWorkerOrbitState(
    new THREE.Vector3(0, -2, 2),
    new THREE.Vector3(0, 0, 0),
  );

  applyUsdWorkerOrbitPointerDelta(orbit, 0, -10_000);
  assert.ok(orbit.polar > 0);

  applyUsdWorkerOrbitPointerDelta(orbit, 0, 10_000);
  assert.ok(orbit.polar < Math.PI);
});

test('applyUsdWorkerOrbitZoomDelta keeps the radius inside the provided clamp window', () => {
  const orbit = createUsdWorkerOrbitState(
    new THREE.Vector3(0, -3, 3),
    new THREE.Vector3(0, 0, 0),
  );

  applyUsdWorkerOrbitZoomDelta(orbit, -10_000, {
    minRadius: 1,
    maxRadius: 6,
  });
  assertApprox(orbit.radius, 1, 1e-3);

  applyUsdWorkerOrbitZoomDelta(orbit, 10_000, {
    minRadius: 1,
    maxRadius: 6,
  });
  assertApprox(orbit.radius, 6, 1e-3);
});
