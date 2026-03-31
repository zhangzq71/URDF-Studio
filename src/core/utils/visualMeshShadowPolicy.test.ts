import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  applyVisualMeshShadowPolicy,
  getVisualMeshTriangleCount,
  shouldVisualMeshParticipateInShadows,
} from './visualMeshShadowPolicy';

function createIndexedTriangleMesh(triangleCount: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ], 3),
  );

  const index = new Uint32Array(triangleCount * 3);
  for (let i = 0; i < index.length; i += 3) {
    index[i] = 0;
    index[i + 1] = 1;
    index[i + 2] = 2;
  }

  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x999999 }));
}

test('shared visual mesh shadow policy keeps G1-class meshes in the shadow pass', () => {
  const g1ScaleMesh = createIndexedTriangleMesh(51410);

  assert.equal(getVisualMeshTriangleCount(g1ScaleMesh), 51410);
  assert.equal(shouldVisualMeshParticipateInShadows(g1ScaleMesh), true);

  applyVisualMeshShadowPolicy(g1ScaleMesh);

  assert.equal(g1ScaleMesh.castShadow, true);
  assert.equal(g1ScaleMesh.receiveShadow, true);
});

test('shared visual mesh shadow policy keeps extremely dense meshes in the shadow pass', () => {
  const hugeMesh = createIndexedTriangleMesh(86240);

  assert.equal(getVisualMeshTriangleCount(hugeMesh), 86240);
  assert.equal(shouldVisualMeshParticipateInShadows(hugeMesh), true);

  applyVisualMeshShadowPolicy(hugeMesh);

  assert.equal(hugeMesh.castShadow, true);
  assert.equal(hugeMesh.receiveShadow, true);
});
