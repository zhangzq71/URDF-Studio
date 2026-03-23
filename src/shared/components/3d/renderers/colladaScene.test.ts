import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

import { createMeshLoader } from '@/core/loaders';

import { cloneColladaScenePreservingRootTransform } from './colladaScene';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer as typeof XMLSerializer;
globalThis.ProgressEvent = dom.window.ProgressEvent as typeof ProgressEvent;

function getWorldBox(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function expectBoxEquals(actual: THREE.Box3, expected: THREE.Box3, epsilon = 1e-6) {
  const actualMin = actual.min.toArray();
  const expectedMin = expected.min.toArray();
  const actualMax = actual.max.toArray();
  const expectedMax = expected.max.toArray();

  actualMin.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedMin[index]) < epsilon);
  });
  actualMax.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedMax[index]) < epsilon);
  });
}

test('cloneColladaScenePreservingRootTransform bakes b2w base_link root transforms into the preview clone', async () => {
  const meshPath = 'test/unitree_ros/robots/b2w_description/meshes/base_link.dae';
  const meshDataUrl = `data:text/xml;base64,${Buffer.from(fs.readFileSync(meshPath, 'utf8')).toString('base64')}`;
  const manager = new THREE.LoadingManager();
  const loadMesh = createMeshLoader(
    {
      [meshPath]: meshDataUrl,
      base_link: meshDataUrl,
      'base_link.dae': meshDataUrl,
    },
    manager,
  );

  const loadedObject = await new Promise<THREE.Object3D>((resolve, reject) => {
    loadMesh('base_link.dae', manager, (result, err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(result);
    });
  });

  const { clone } = cloneColladaScenePreservingRootTransform(loadedObject);
  const referenceBox = getWorldBox(loadedObject);
  const loadedMeshRoot = loadedObject.children[0] as THREE.Object3D | undefined;
  assert.ok(loadedMeshRoot);
  assert.ok(Math.abs(loadedMeshRoot.position.y - 0.008) < 1e-6);
  assert.ok(Math.abs(loadedMeshRoot.quaternion.x - 0.5) < 1e-6);
  assert.ok(Math.abs(clone.rotation.x) < 1e-6);
  assert.ok(Math.abs(clone.rotation.y) < 1e-6);
  assert.ok(Math.abs(clone.rotation.z) < 1e-6);
  assert.ok(Math.abs(clone.quaternion.x) < 1e-6);
  assert.ok(Math.abs(clone.quaternion.y) < 1e-6);
  assert.ok(Math.abs(clone.quaternion.z) < 1e-6);
  assert.ok(Math.abs(clone.quaternion.w - 1) < 1e-6);
  expectBoxEquals(getWorldBox(clone), referenceBox);
});
