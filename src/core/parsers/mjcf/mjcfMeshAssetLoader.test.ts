import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { loadMJCFMeshObject, type MJCFMeshCache } from './mjcfMeshAssetLoader';
import { disposeObjParseWorkerPoolClient } from '@/core/loaders/objParseWorkerBridge';

const createObjBlob = () => new Blob([[
  'o triangle',
  'v 0 0 0',
  'v 1 0 0',
  'v 0 1 0',
  'f 1 2 3',
].join('\n')], { type: 'text/plain;charset=utf-8' });

test('loadMJCFMeshObject reuses cached OBJ assets within the same mesh cache', async () => {
  const assetUrl = URL.createObjectURL(createObjBlob());
  const meshCache: MJCFMeshCache = new Map();
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  disposeObjParseWorkerPoolClient();
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const request = args[0];
    const requestUrl = typeof request === 'string'
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
    const first = await loadMJCFMeshObject(assetUrl, 'meshes/reused.obj', meshCache);
    const second = await loadMJCFMeshObject(assetUrl, 'meshes/reused.obj', meshCache);

    assert.ok(first instanceof THREE.Object3D);
    assert.ok(second instanceof THREE.Object3D);
    assert.notEqual(first, second);
    assert.equal(fetchCount, 1);

    const firstMesh = first.getObjectByProperty('isMesh', true);
    const secondMesh = second.getObjectByProperty('isMesh', true);
    assert.ok(firstMesh instanceof THREE.Mesh);
    assert.ok(secondMesh instanceof THREE.Mesh);
  } finally {
    disposeObjParseWorkerPoolClient();
    globalThis.fetch = originalFetch;
    URL.revokeObjectURL(assetUrl);
  }
});
