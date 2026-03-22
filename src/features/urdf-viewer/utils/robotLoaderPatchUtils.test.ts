import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { markVisualObject, updateVisualMaterial } from './robotLoaderPatchUtils';

test('markVisualObject preserves authored multi-material palettes without an explicit color override', () => {
  const authoredLightMaterial = new THREE.MeshPhongMaterial({
    name: 'light',
    color: new THREE.Color('#e8ecf2'),
  });
  const authoredDarkMaterial = new THREE.MeshPhongMaterial({
    name: 'dark',
    color: new THREE.Color('#1b1f24'),
  });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    [authoredLightMaterial, authoredDarkMaterial],
  );

  markVisualObject(mesh, 'base', undefined, true);

  const nextMaterials = mesh.material as THREE.Material[];
  assert.equal(nextMaterials[0], authoredLightMaterial);
  assert.equal(nextMaterials[1], authoredDarkMaterial);
  assert.equal(mesh.userData.parentLinkName, 'base');
  assert.equal(mesh.userData.isVisualMesh, true);
  assert.equal(mesh.visible, true);
});

test('updateVisualMaterial applies an explicit override across all mesh materials', () => {
  const texture = new THREE.Texture();
  const authoredLightMaterial = new THREE.MeshPhongMaterial({
    name: 'light',
    color: new THREE.Color('#e8ecf2'),
    map: texture,
  });
  const authoredDarkMaterial = new THREE.MeshPhongMaterial({
    name: 'dark',
    color: new THREE.Color('#1b1f24'),
  });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    [authoredLightMaterial, authoredDarkMaterial],
  );
  const disposedMaterials = new Set<THREE.Material>();

  updateVisualMaterial(mesh, '#123456', disposedMaterials);

  const nextMaterials = mesh.material as THREE.MeshStandardMaterial[];
  assert.equal(nextMaterials[0] instanceof THREE.MeshStandardMaterial, true);
  assert.equal(nextMaterials[1] instanceof THREE.MeshStandardMaterial, true);
  assert.notEqual(nextMaterials[0], authoredLightMaterial);
  assert.notEqual(nextMaterials[1], authoredDarkMaterial);
  assert.equal(nextMaterials[0].map, texture);
  assert.equal(nextMaterials[0].color.getHexString(), '123456');
  assert.equal(nextMaterials[1].color.getHexString(), '123456');
  assert.equal(nextMaterials[0].userData.urdfColorApplied, true);
  assert.equal(nextMaterials[1].userData.urdfColorApplied, true);
  assert.equal(disposedMaterials.has(authoredLightMaterial), true);
  assert.equal(disposedMaterials.has(authoredDarkMaterial), true);
});
