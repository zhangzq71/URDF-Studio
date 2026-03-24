import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { prepareUsdVisualMesh } from './usdVisualRendering';

test('prepareUsdVisualMesh enables the same shadow participation as the URDF viewer path', () => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhysicalMaterial({ color: '#ff6c0a' }),
  );

  mesh.castShadow = false;
  mesh.receiveShadow = false;

  prepareUsdVisualMesh(mesh);

  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
  assert.equal(mesh.userData.__usdVisualMeshPrepared, true);
});

test('prepareUsdVisualMesh re-applies the normalized shadow flags on repeated calls', () => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshPhysicalMaterial({ color: '#808080' }),
  );

  prepareUsdVisualMesh(mesh);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  prepareUsdVisualMesh(mesh);

  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
  assert.equal(mesh.userData.__usdVisualMeshPrepared, true);
});
