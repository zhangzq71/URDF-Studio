import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createUsdBaseMaterial,
  expandUsdMultiMaterialMeshesForSerialization,
  normalizeUsdRenderableMaterials,
} from './usdMaterialNormalization.ts';

test('normalizeUsdRenderableMaterials converts renderable materials to MeshStandardMaterial instances', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: '#123456',
      opacity: 0.35,
      transparent: true,
      side: THREE.DoubleSide,
      name: 'basic-source',
    }),
  );

  normalizeUsdRenderableMaterials(mesh, '#abcdef');

  assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
  assert.equal(mesh.material.name, 'basic-source');
  assert.equal(mesh.material.transparent, true);
  assert.equal(mesh.material.opacity, 0.35);
  assert.equal(mesh.material.side, THREE.FrontSide);
  assert.equal(mesh.material.color.getHexString(), '123456');
});

test('expandUsdMultiMaterialMeshesForSerialization replaces a multi-material mesh with ordered single-material variants', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ], 3));
  geometry.clearGroups();
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);

  const mesh = new THREE.Mesh(
    geometry,
    [
      createUsdBaseMaterial('#ff0000'),
      createUsdBaseMaterial('#00ff00'),
    ],
  );
  mesh.name = 'panel';

  const root = new THREE.Group();
  root.add(mesh);

  expandUsdMultiMaterialMeshesForSerialization(root);

  assert.equal(root.children.length, 2);
  const firstVariant = root.children[0];
  const secondVariant = root.children[1];

  assert.ok(firstVariant instanceof THREE.Mesh);
  assert.ok(secondVariant instanceof THREE.Mesh);
  assert.equal(firstVariant.name, 'panel');
  assert.equal(secondVariant.name, 'panel_1');
  assert.ok(!Array.isArray(firstVariant.material));
  assert.ok(!Array.isArray(secondVariant.material));
  assert.equal((firstVariant.userData as { usdSerializeFilteredGroups?: boolean }).usdSerializeFilteredGroups, true);
  assert.equal((secondVariant.userData as { usdSerializeFilteredGroups?: boolean }).usdSerializeFilteredGroups, true);

  const firstGeometry = firstVariant.geometry as THREE.BufferGeometry;
  const secondGeometry = secondVariant.geometry as THREE.BufferGeometry;
  assert.deepEqual(firstGeometry.groups.map((group) => group.materialIndex), [0]);
  assert.deepEqual(secondGeometry.groups.map((group) => group.materialIndex), [0]);
});
