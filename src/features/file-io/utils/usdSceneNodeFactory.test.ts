import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { GeometryType, type UrdfVisual } from '@/types';

import { createUsdAssetRegistry } from './usdAssetRegistry.ts';
import { buildUsdVisualSceneNode } from './usdSceneNodeFactory.ts';

if (typeof globalThis.ProgressEvent === 'undefined') {
  class ProgressEventPolyfill extends Event {
    loaded: number;
    total: number;
    lengthComputable: boolean;

    constructor(type: string, init: { loaded?: number; total?: number; lengthComputable?: boolean } = {}) {
      super(type);
      this.loaded = init.loaded ?? 0;
      this.total = init.total ?? 0;
      this.lengthComputable = init.lengthComputable ?? false;
    }
  }

  globalThis.ProgressEvent = ProgressEventPolyfill as typeof ProgressEvent;
}

const createUvObjBlob = () => {
  return new Blob([[
    'o textured_triangle',
    'v 0 0 0',
    'v 1 0 0',
    'v 0 1 0',
    'vt 0 0',
    'vt 1 0',
    'vt 0 1',
    'f 1/1 2/2 3/3',
  ].join('\n')], { type: 'text/plain;charset=utf-8' });
};

const createMeshVisual = (meshPath: string): UrdfVisual => {
  return {
    type: GeometryType.MESH,
    meshPath,
    dimensions: { x: 2, y: 3, z: 4 },
    color: '#6699ff',
    origin: {
      xyz: { x: 1, y: 2, z: 3 },
      rpy: { r: 0, p: Math.PI / 2, y: 0 },
    },
  };
};

test('buildUsdVisualSceneNode creates primitive anchors with serialized USD geometry metadata', async () => {
  const visual: UrdfVisual = {
    type: GeometryType.BOX,
    dimensions: { x: 0.4, y: 0.2, z: 0.1 },
    color: '#4f46e5',
    origin: {
      xyz: { x: 0.25, y: 0.5, z: 0.75 },
      rpy: { r: 0, p: 0, y: 0 },
    },
  };

  const node = await buildUsdVisualSceneNode({
    visual,
    role: 'visual',
    registry: createUsdAssetRegistry({}).registry,
    materialState: { color: '#12ab34' },
  });

  assert.ok(node instanceof THREE.Group);
  assert.equal(node.name, 'visual');
  assert.deepEqual(node.position.toArray(), [0.25, 0.5, 0.75]);
  assert.deepEqual(node.scale.toArray(), [0.4, 0.2, 0.1]);
  assert.equal(node.children.length, 1);

  const primitive = node.children[0];
  assert.equal(primitive.name, 'box');
  assert.equal(primitive.userData.usdGeomType, 'Cube');
  assert.equal(primitive.userData.usdDisplayColor, '#12ab34');
});

test('buildUsdVisualSceneNode loads mesh visuals with anchor transforms and explicit display colors', async () => {
  const meshPath = 'meshes/textured_triangle.obj';
  const { registry, tempObjectUrls } = createUsdAssetRegistry({}, new Map([[meshPath, createUvObjBlob()]]));

  try {
    const node = await buildUsdVisualSceneNode({
      visual: createMeshVisual(meshPath),
      role: 'visual',
      registry,
      materialState: { color: '#12ab34' },
    });

    assert.ok(node instanceof THREE.Group);
    assert.equal(node.name, 'visual');
    assert.deepEqual(node.position.toArray(), [1, 2, 3]);
    assert.deepEqual(node.scale.toArray(), [2, 3, 4]);

    const mesh = node.getObjectByProperty('isMesh', true);
    assert.ok(mesh instanceof THREE.Mesh);
    assert.equal(mesh.userData.usdDisplayColor, '#12ab34');
    assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
    assert.equal(mesh.material.side, THREE.FrontSide);
  } finally {
    tempObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
});

test('buildUsdVisualSceneNode marks collision mesh anchors and descendants for USD collision serialization', async () => {
  const meshPath = 'meshes/collision_triangle.obj';
  const { registry, tempObjectUrls } = createUsdAssetRegistry({}, new Map([[meshPath, createUvObjBlob()]]));

  try {
    const node = await buildUsdVisualSceneNode({
      visual: createMeshVisual(meshPath),
      role: 'collision',
      registry,
    });

    assert.ok(node instanceof THREE.Group);
    assert.equal(node.userData.usdPurpose, 'guide');
    assert.equal(node.userData.usdCollision, true);
    assert.equal(node.userData.usdMeshCollision, true);

    const mesh = node.getObjectByProperty('isMesh', true);
    assert.ok(mesh instanceof THREE.Mesh);
    assert.equal(mesh.userData.usdPurpose, 'guide');
    assert.equal(mesh.userData.usdCollision, true);
    assert.equal(mesh.userData.usdMeshCollision, true);
  } finally {
    tempObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
});
