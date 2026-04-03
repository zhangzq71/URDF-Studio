import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { GENERATED_OBJ_MATERIAL_USER_DATA_KEY } from '@/core/loaders/objModelData';
import {
  disposeObjPreviewClone,
  replaceObjPreviewMeshMaterials,
} from './OBJRendererImpl.tsx';

function trackDisposeCalls<T extends THREE.Material | THREE.BufferGeometry>(resource: T) {
  let disposeCalls = 0;
  const originalDispose = resource.dispose.bind(resource);
  resource.dispose = (() => {
    disposeCalls += 1;
    return originalDispose();
  }) as T['dispose'];
  return () => disposeCalls;
}

test('replaceObjPreviewMeshMaterials disposes generated OBJ materials when swapping to a shared override', () => {
  const generatedMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
  generatedMaterial.userData = {
    ...(generatedMaterial.userData ?? {}),
    [GENERATED_OBJ_MATERIAL_USER_DATA_KEY]: true,
  };
  const sharedMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), generatedMaterial);
  const getDisposeCalls = trackDisposeCalls(generatedMaterial);

  try {
    replaceObjPreviewMeshMaterials([mesh], sharedMaterial);

    assert.equal(mesh.material, sharedMaterial);
    assert.equal(getDisposeCalls(), 1);
  } finally {
    mesh.geometry.dispose();
    sharedMaterial.dispose();
  }
});

test('disposeObjPreviewClone releases clone-owned OBJ resources without disposing the shared override material', () => {
  const sharedMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, sharedMaterial);
  const clone = new THREE.Group();
  clone.add(mesh);

  const getGeometryDisposeCalls = trackDisposeCalls(geometry);
  const getSharedMaterialDisposeCalls = trackDisposeCalls(sharedMaterial);

  disposeObjPreviewClone(clone, sharedMaterial);

  assert.equal(getGeometryDisposeCalls(), 1);
  assert.equal(getSharedMaterialDisposeCalls(), 0);

  sharedMaterial.dispose();
});
