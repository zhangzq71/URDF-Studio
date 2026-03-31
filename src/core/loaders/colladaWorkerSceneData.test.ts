import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

import {
  createSceneFromSerializedColladaData,
  parseColladaSceneData,
} from './colladaWorkerSceneData.ts';

type WorkerImageGlobalSnapshot = {
  DOMParser: typeof globalThis.DOMParser;
  Image: typeof globalThis.Image;
  HTMLImageElement: typeof globalThis.HTMLImageElement;
  XMLSerializer: typeof globalThis.XMLSerializer;
  document: typeof globalThis.document;
};

function captureWorkerImageGlobals(): WorkerImageGlobalSnapshot {
  return {
    DOMParser: globalThis.DOMParser,
    Image: globalThis.Image,
    HTMLImageElement: globalThis.HTMLImageElement,
    XMLSerializer: globalThis.XMLSerializer,
    document: globalThis.document,
  };
}

function restoreWorkerImageGlobals(snapshot: WorkerImageGlobalSnapshot): void {
  if (snapshot.DOMParser) {
    globalThis.DOMParser = snapshot.DOMParser;
  } else {
    delete (globalThis as typeof globalThis & { DOMParser?: typeof DOMParser }).DOMParser;
  }

  if (snapshot.document) {
    globalThis.document = snapshot.document;
  } else {
    delete (globalThis as typeof globalThis & { document?: Document }).document;
  }

  if (snapshot.HTMLImageElement) {
    globalThis.HTMLImageElement = snapshot.HTMLImageElement;
  } else {
    delete (globalThis as typeof globalThis & { HTMLImageElement?: typeof HTMLImageElement }).HTMLImageElement;
  }

  if (snapshot.Image) {
    globalThis.Image = snapshot.Image;
  } else {
    delete (globalThis as typeof globalThis & { Image?: typeof Image }).Image;
  }

  if (snapshot.XMLSerializer) {
    globalThis.XMLSerializer = snapshot.XMLSerializer;
  } else {
    delete (globalThis as typeof globalThis & { XMLSerializer?: typeof XMLSerializer }).XMLSerializer;
  }
}

function getFirstMesh(root: THREE.Object3D): THREE.Mesh {
  let foundMesh: THREE.Mesh | null = null;

  root.traverse((child) => {
    if (!foundMesh && (child as THREE.Mesh).isMesh) {
      foundMesh = child as THREE.Mesh;
    }
  });

  assert.ok(foundMesh, 'expected Collada scene to contain a mesh');
  return foundMesh;
}

test('textured Collada worker scene data restores image-backed textures without DOM globals', () => {
  const meshPath = 'test/gazebo_models/checkerboard_plane/meshes/checkerboard_plane.dae';
  const colladaText = fs.readFileSync(meshPath, 'utf8');
  const snapshot = captureWorkerImageGlobals();

  delete (globalThis as typeof globalThis & { DOMParser?: typeof DOMParser }).DOMParser;
  delete (globalThis as typeof globalThis & { document?: Document }).document;
  delete (globalThis as typeof globalThis & { HTMLImageElement?: typeof HTMLImageElement }).HTMLImageElement;
  delete (globalThis as typeof globalThis & { Image?: typeof Image }).Image;
  delete (globalThis as typeof globalThis & { XMLSerializer?: typeof XMLSerializer }).XMLSerializer;

  try {
    const serializedScene = parseColladaSceneData(colladaText, meshPath);
    const restoredScene = createSceneFromSerializedColladaData(serializedScene);
    const restoredMesh = getFirstMesh(restoredScene);
    const restoredMaterial = restoredMesh.material as THREE.MeshPhongMaterial;

    assert.ok(restoredMaterial.map, 'expected textured Collada scene to restore material.map');
    assert.equal(typeof globalThis.HTMLImageElement, 'function');
    assert.ok(
      restoredMaterial.map.source.data instanceof globalThis.HTMLImageElement,
      'expected textured Collada scene to restore an image-backed source in worker mode',
    );
    assert.match(String(restoredMaterial.map.source.data.src), /checker\.png$/);
  } finally {
    restoreWorkerImageGlobals(snapshot);
  }
});
