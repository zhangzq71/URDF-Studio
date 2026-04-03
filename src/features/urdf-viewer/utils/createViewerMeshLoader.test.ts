import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createViewerMeshLoader } from './createViewerMeshLoader';

test('createViewerMeshLoader exposes unresolved visual meshes as errors instead of placeholders', async () => {
  const manager = new THREE.LoadingManager();
  const loadMesh = createViewerMeshLoader({}, manager, 'urdf/');

  const result = await new Promise<{ object: THREE.Object3D | null; error?: Error }>((resolve) => {
    loadMesh('package://aliengo_description/meshes/hip.dae', manager, (object, error) => {
      resolve({ object, error });
    });
  });

  assert.ok(result.error);
  assert.equal(result.object, null);
});
