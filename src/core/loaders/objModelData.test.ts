import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createObjectFromSerializedObjData,
  type SerializedObjModelData,
} from './objModelData.ts';

function floatBuffer(values: number[]): ArrayBuffer {
  return new Float32Array(values).buffer;
}

test('createObjectFromSerializedObjData forces vertex colors when OBJ geometry carries color attributes', () => {
  const serialized: SerializedObjModelData = {
    materialLibraries: [],
    children: [
      {
        kind: 'mesh',
        name: 'colored-mesh',
        materials: [
          {
            kind: 'mesh-phong',
            name: 'default',
            color: 0xffffff,
            vertexColors: false,
          },
        ],
        geometry: {
          position: {
            array: floatBuffer([
              0, 0, 0,
              1, 0, 0,
              0, 1, 0,
            ]),
            itemSize: 3,
          },
          color: {
            array: floatBuffer([
              1, 0, 0,
              0, 1, 0,
              0, 0, 1,
            ]),
            itemSize: 3,
          },
          groups: [],
        },
      },
    ],
  };

  const object = createObjectFromSerializedObjData(serialized);
  const mesh = object.children[0] as THREE.Mesh;

  assert.ok(mesh.isMesh);
  assert.ok(mesh.geometry.getAttribute('color'));
  assert.ok(mesh.material instanceof THREE.MeshPhongMaterial);

  if (!(mesh.material instanceof THREE.MeshPhongMaterial)) {
    assert.fail('expected a MeshPhongMaterial');
  }

  assert.equal(mesh.material.vertexColors, true);
});
