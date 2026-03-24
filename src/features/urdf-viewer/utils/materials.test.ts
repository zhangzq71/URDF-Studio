import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  collisionBaseMaterial,
  configureCollisionOverlayMaterial,
  createCollisionOverlayMaterial,
  enhanceSingleMaterial,
} from './materials';

test('enhanceSingleMaterial preserves OBJ vertex colors for baked export meshes', () => {
  const sourceMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    vertexColors: true,
  });

  const enhancedMaterial = enhanceSingleMaterial(sourceMaterial) as THREE.MeshStandardMaterial;

  assert.equal(enhancedMaterial instanceof THREE.MeshStandardMaterial, true);
  assert.equal(enhancedMaterial.vertexColors, true);
  assert.equal(enhancedMaterial.toneMapped, false);
  assert.equal(enhancedMaterial.color.getHexString(), 'ffffff');
});

test('configureCollisionOverlayMaterial normalizes overlay depth and polygon settings', () => {
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });

  const configuredMaterial = configureCollisionOverlayMaterial(material);

  assert.equal(configuredMaterial, material);
  assert.equal(configuredMaterial.transparent, true);
  assert.equal(configuredMaterial.depthWrite, false);
  assert.equal(configuredMaterial.depthTest, false);
  assert.equal(configuredMaterial.polygonOffset, true);
  assert.equal(configuredMaterial.polygonOffsetFactor, -1);
  assert.equal(configuredMaterial.polygonOffsetUnits, -4);
  assert.equal(configuredMaterial.userData.isCollisionMaterial, true);
});

test('createCollisionOverlayMaterial and the shared collision material stay in sync', () => {
  const createdMaterial = createCollisionOverlayMaterial('collision_test');

  assert.equal(createdMaterial instanceof THREE.MeshStandardMaterial, true);
  assert.equal(createdMaterial.name, 'collision_test');
  assert.equal(createdMaterial.depthWrite, false);
  assert.equal(createdMaterial.depthTest, false);
  assert.equal(createdMaterial.polygonOffset, true);
  assert.equal(createdMaterial.polygonOffsetFactor, -1);
  assert.equal(createdMaterial.polygonOffsetUnits, -4);
  assert.equal(createdMaterial.opacity, 0.35);
  assert.equal(createdMaterial.transparent, true);
  assert.equal(createdMaterial.userData.isCollisionMaterial, true);

  assert.equal(collisionBaseMaterial.depthWrite, false);
  assert.equal(collisionBaseMaterial.depthTest, false);
  assert.equal(collisionBaseMaterial.polygonOffset, true);
  assert.equal(collisionBaseMaterial.userData.isCollisionMaterial, true);
  assert.equal(collisionBaseMaterial.userData.isSharedMaterial, true);
});
