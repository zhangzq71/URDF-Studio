import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { DEFAULT_LINK } from '@/types';
import { composeUsdMeshOverrideWorldMatrix } from './usdRuntimeLinkOverrides.ts';
import { extractUsdGeometryTransformFromWorldMatrix } from './usdCollisionTransform.ts';

function toQuaternionFromRpy(rotation: { r: number; p: number; y: number }) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.r, rotation.p, rotation.y, 'ZYX'),
  );
}

test('extracts the next USD geometry transform from a dragged mesh world matrix', () => {
  const linkWorldMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(1.5, -0.5, 0.75),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.2, 0.45)),
    new THREE.Vector3(1, 1, 1),
  );

  const authoredWorldMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(2.25, 0.5, -1.25),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, 0.25, 0.05)),
    new THREE.Vector3(1, 1, 1),
  );

  const currentGeometry = {
    ...DEFAULT_LINK.collision,
    origin: {
      xyz: { x: 0.3, y: -0.4, z: 0.9 },
      rpy: { r: 0.2, p: -0.1, y: 0.35 },
    },
    dimensions: { x: 1.4, y: 0.8, z: 1.1 },
  };

  const nextGeometry = {
    ...DEFAULT_LINK.collision,
    origin: {
      xyz: { x: -0.25, y: 0.6, z: 1.15 },
      rpy: { r: -0.05, p: 0.3, y: -0.2 },
    },
    dimensions: currentGeometry.dimensions,
  };

  const currentMeshWorldMatrix = composeUsdMeshOverrideWorldMatrix({
    authoredWorldMatrix,
    geometry: currentGeometry,
    linkWorldMatrix,
  });

  const nextMeshWorldMatrix = composeUsdMeshOverrideWorldMatrix({
    authoredWorldMatrix,
    geometry: nextGeometry,
    linkWorldMatrix,
  });

  const extracted = extractUsdGeometryTransformFromWorldMatrix({
    currentGeometry,
    currentMeshWorldMatrix,
    nextMeshWorldMatrix,
    linkWorldMatrix,
  });

  assert.ok(Math.abs(extracted.position.x - nextGeometry.origin.xyz.x) < 1e-6);
  assert.ok(Math.abs(extracted.position.y - nextGeometry.origin.xyz.y) < 1e-6);
  assert.ok(Math.abs(extracted.position.z - nextGeometry.origin.xyz.z) < 1e-6);

  const expectedQuaternion = toQuaternionFromRpy(nextGeometry.origin.rpy);
  const extractedQuaternion = toQuaternionFromRpy(extracted.rotation);
  assert.ok(expectedQuaternion.angleTo(extractedQuaternion) < 1e-6);
});
