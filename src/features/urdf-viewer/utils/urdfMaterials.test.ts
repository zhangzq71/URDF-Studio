import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

import { applyURDFMaterials, parseURDFMaterials } from './urdfMaterials';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser as typeof DOMParser;

test('applyURDFMaterials matches normalized Collada material names from URDF inline materials', () => {
    const materials = parseURDFMaterials(`<?xml version="1.0"?>
<robot name="b2w_description">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://b2w_description/meshes/base_link.dae" />
      </geometry>
      <material name="磨砂铝合金_008-effect">
        <color rgba="0.25 0.5 0.75 1" />
      </material>
      <material name="灰色硅胶_009-effect">
        <color rgba="0.1 0.2 0.3 0.5" />
      </material>
      <material name="黑色硅胶-effect">
        <color rgba="0.02 0.03 0.04 1" />
      </material>
    </visual>
  </link>
</robot>`);

    const texture = new THREE.Texture();
    const robot = new THREE.Group();
    const originalMetalMaterial = new THREE.MeshPhongMaterial({
        name: '磨砂铝合金.008',
        color: new THREE.Color(1, 0, 0),
        map: texture,
    });
    const originalRubberMaterial = new THREE.MeshPhongMaterial({
        name: '灰色硅胶.009',
        color: new THREE.Color(0, 1, 0),
    });
    const legMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        [originalMetalMaterial, originalRubberMaterial],
    );
    const originalFootMaterial = new THREE.MeshPhongMaterial({
        name: '黑色硅胶',
        color: new THREE.Color(0, 0, 1),
    });
    const footMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        originalFootMaterial,
    );
    robot.add(legMesh, footMesh);

    applyURDFMaterials(robot, materials);

    const [metalMaterial, rubberMaterial] = legMesh.material as THREE.MeshPhongMaterial[];
    const footMaterial = footMesh.material as THREE.MeshPhongMaterial;

    assert.notEqual(metalMaterial, originalMetalMaterial);
    assert.notEqual(rubberMaterial, originalRubberMaterial);
    assert.notEqual(footMaterial, originalFootMaterial);
    assert.equal(metalMaterial instanceof THREE.MeshPhongMaterial, true);
    assert.equal(rubberMaterial instanceof THREE.MeshPhongMaterial, true);
    assert.equal(footMaterial instanceof THREE.MeshPhongMaterial, true);
    assert.equal(metalMaterial.map, texture);

    assert.equal(metalMaterial.userData.urdfColorApplied, true);
    assert.deepEqual(
        metalMaterial.color.toArray().map((value) => Number(value.toFixed(4))),
        [0.25, 0.5, 0.75],
    );

    assert.equal(rubberMaterial.userData.urdfColorApplied, true);
    assert.deepEqual(
        rubberMaterial.color.toArray().map((value) => Number(value.toFixed(4))),
        [0.1, 0.2, 0.3],
    );
    assert.equal(Number(rubberMaterial.opacity.toFixed(4)), 0.5);
    assert.equal(rubberMaterial.transparent, true);

    assert.equal(footMaterial.userData.urdfColorApplied, true);
    assert.deepEqual(
        footMaterial.color.toArray().map((value) => Number(value.toFixed(4))),
        [0.02, 0.03, 0.04],
    );
});
