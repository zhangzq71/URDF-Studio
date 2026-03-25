import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createUsdBaseMaterial } from './usdMaterialNormalization.ts';
import { collectUsdSerializationContext } from './usdSerializationContext.ts';

const createTriangleGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  return geometry;
};

const createTexturedTriangleGeometry = () => {
  const geometry = createTriangleGeometry();
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0, 1,
  ], 2));
  return geometry;
};

test('collectUsdSerializationContext deduplicates shared geometry and shared material appearances', async () => {
  const geometry = createTriangleGeometry();
  const firstMesh = new THREE.Mesh(geometry, createUsdBaseMaterial('#12ab34'));
  const secondMesh = new THREE.Mesh(geometry, createUsdBaseMaterial('#12ab34'));

  firstMesh.name = 'first';
  secondMesh.name = 'second';

  const root = new THREE.Group();
  root.name = 'demo_robot';
  root.add(firstMesh, secondMesh);

  const context = await collectUsdSerializationContext(root);

  assert.equal(context.materialRecords.length, 1);
  assert.equal(context.geometryRecords.length, 1);
  assert.equal(context.materialByObject.get(firstMesh), context.materialByObject.get(secondMesh));
  assert.equal(context.geometryByObject.get(firstMesh), context.geometryByObject.get(secondMesh));
  assert.equal(context.materialRecords[0]?.path, '/demo_robot/Looks/Material_0');
  assert.equal(context.geometryRecords[0]?.path, '/demo_robot/__MeshLibrary/Geometry_0');
});

test('collectUsdSerializationContext builds texture-aware material records from explicit USD display metadata', async () => {
  const mesh = new THREE.Mesh(
    createTexturedTriangleGeometry(),
    createUsdBaseMaterial('#ffffff'),
  );
  mesh.name = 'textured';
  mesh.userData.usdDisplayColor = '#12ab3480';
  mesh.userData.usdMaterial = {
    texture: 'textures/checker.png',
  };

  const root = new THREE.Group();
  root.name = 'demo_robot';
  root.add(mesh);

  const context = await collectUsdSerializationContext(root);
  const materialRecord = context.materialByObject.get(mesh);

  assert.ok(materialRecord, 'expected material record for textured mesh');
  assert.equal(materialRecord?.appearance.texture?.sourcePath, 'textures/checker.png');
  assert.equal(materialRecord?.appearance.texture?.exportPath, 'checker.png');
  assert.equal(materialRecord?.appearance.opacity, 128 / 255);
  assert.equal(materialRecord?.appearance.color.getHexString(), '12ab34');
});
