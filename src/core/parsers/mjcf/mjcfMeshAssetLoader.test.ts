import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  finalizeLoadedMJCFColladaScene,
  loadMJCFMeshObject,
  type MJCFMeshCache,
} from './mjcfMeshAssetLoader';

const createGltfBlob = () => {
  const positionBuffer = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer).toString(
    'base64',
  );

  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
            },
          },
        ],
      },
    ],
    buffers: [
      {
        uri: `data:application/octet-stream;base64,${positionBuffer}`,
        byteLength: 36,
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: 36,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
  };

  return new Blob([JSON.stringify(document)], { type: 'model/gltf+json' });
};

test('loadMJCFMeshObject reuses cached GLTF assets within the same mesh cache', async () => {
  const assetUrl = URL.createObjectURL(createGltfBlob());
  const meshCache: MJCFMeshCache = new Map();
  const originalFetch = globalThis.fetch;
  const originalProgressEvent = globalThis.ProgressEvent;
  let fetchCount = 0;

  if (typeof globalThis.ProgressEvent === 'undefined') {
    class TestProgressEvent extends Event {
      loaded: number;
      total: number;

      constructor(type: string, init: { loaded?: number; total?: number } = {}) {
        super(type);
        this.loaded = init.loaded ?? 0;
        this.total = init.total ?? 0;
      }
    }

    globalThis.ProgressEvent = TestProgressEvent as unknown as typeof ProgressEvent;
  }

  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const request = args[0];
    const requestUrl =
      typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url;

    if (requestUrl === assetUrl) {
      fetchCount += 1;
    }

    return await originalFetch(...args);
  }) as typeof fetch;

  try {
    const first = await loadMJCFMeshObject(assetUrl, 'meshes/reused.gltf', meshCache);
    const second = await loadMJCFMeshObject(assetUrl, 'meshes/reused.gltf', meshCache);

    assert.ok(first instanceof THREE.Object3D);
    assert.ok(second instanceof THREE.Object3D);
    assert.notEqual(first, second);
    assert.equal(fetchCount, 1);

    const firstMesh = first.getObjectByProperty('isMesh', true);
    const secondMesh = second.getObjectByProperty('isMesh', true);
    assert.ok(firstMesh instanceof THREE.Mesh);
    assert.ok(secondMesh instanceof THREE.Mesh);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.ProgressEvent = originalProgressEvent;
    URL.revokeObjectURL(assetUrl);
  }
});

test('finalizeLoadedMJCFColladaScene strips embedded Collada lights so MJCF DAE assets match URDF scene lighting', () => {
  const root = new THREE.Group();
  root.add(new THREE.PointLight(0xffffff, 1));
  root.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x999999 }),
    ),
  );

  const finalized = finalizeLoadedMJCFColladaScene(root);

  const lights: THREE.Light[] = [];
  const meshes: THREE.Mesh[] = [];
  finalized.traverse((child) => {
    if ((child as THREE.Light).isLight) {
      lights.push(child as THREE.Light);
    }
    if ((child as THREE.Mesh).isMesh) {
      meshes.push(child as THREE.Mesh);
    }
  });

  assert.equal(lights.length, 0);
  assert.ok(meshes.length > 0);
});

test('loadMJCFMeshObject rejects unsupported mesh formats instead of returning null placeholders', async () => {
  await assert.rejects(
    loadMJCFMeshObject('https://example.com/robot.ply', 'meshes/robot.ply', new Map()),
    /Unsupported mesh format "ply"/,
  );
});
