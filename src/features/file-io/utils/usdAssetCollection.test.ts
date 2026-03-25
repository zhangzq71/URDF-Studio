import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createUsdBaseMaterial } from './usdMaterialNormalization.ts';
import { collectUsdSerializationContext } from './usdSerializationContext.ts';
import { applyUsdMaterialMetadata } from './usdSceneSerialization.ts';
import { collectUsdExportAssetFiles } from './usdAssetCollection.ts';
import { createUsdAssetRegistry } from './usdAssetRegistry.ts';

const TEXTURE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==';

const createTexturedTriangleGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0, 1,
  ], 2));
  return geometry;
};

test('collectUsdExportAssetFiles deduplicates texture assets and reports assets-phase progress', async () => {
  const root = new THREE.Group();
  root.name = 'demo_robot';

  const mesh = new THREE.Mesh(
    createTexturedTriangleGeometry(),
    createUsdBaseMaterial('#ffffff'),
  );
  mesh.name = 'mesh';
  mesh.userData.usdDisplayColor = '#ffffff';
  applyUsdMaterialMetadata(mesh, { texture: 'textures/checker.png' });

  const primitive = new THREE.Object3D();
  primitive.name = 'box';
  primitive.userData.usdGeomType = 'Cube';
  applyUsdMaterialMetadata(primitive, { texture: 'textures/checker.png' });

  root.add(mesh, primitive);

  const context = await collectUsdSerializationContext(root, {
    rootPrimName: 'demo_robot',
  });
  const { registry } = createUsdAssetRegistry({
    'textures/checker.png': TEXTURE_DATA_URL,
  });

  const progressEvents: Array<{ phase: string; completed: number; total: number; label?: string }> = [];
  const assets = await collectUsdExportAssetFiles({
    sceneRoot: root,
    context,
    registry,
    onProgress: (progress) => {
      progressEvents.push(progress);
    },
  });

  assert.deepEqual(Array.from(assets.keys()), ['assets/checker.png']);
  assert.equal(assets.get('assets/checker.png')?.type, 'image/png');
  assert.deepEqual(
    progressEvents.map((event) => [event.phase, event.completed, event.total, event.label ?? null]),
    [
      ['assets', 0, 1, null],
      ['assets', 1, 1, 'checker.png'],
    ],
  );
});
