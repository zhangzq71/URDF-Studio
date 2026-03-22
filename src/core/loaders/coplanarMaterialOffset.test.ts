import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
    isCoplanarOffsetMaterial,
    mitigateCoplanarMaterialZFighting,
} from './coplanarMaterialOffset.ts';

test('mitigateCoplanarMaterialZFighting offsets the smaller overlapping material group', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
    ], 3));
    geometry.setIndex([0, 1, 2, 0, 1, 3, 0, 1, 2]);
    geometry.clearGroups();
    geometry.addGroup(0, 6, 0);
    geometry.addGroup(6, 3, 1);

    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
    const overlayMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const mesh = new THREE.Mesh(geometry, [baseMaterial, overlayMaterial]);

    const result = mitigateCoplanarMaterialZFighting(mesh);
    const materials = mesh.material as THREE.Material[];

    assert.equal(result.duplicateTriangleCount, 1);
    assert.deepEqual(result.adjustedMaterialIndices, [1]);
    assert.equal(result.adjustedMaterialCount, 1);
    assert.equal(isCoplanarOffsetMaterial(materials[0]), false);
    assert.equal(isCoplanarOffsetMaterial(materials[1]), true);
    assert.notEqual(materials[1], overlayMaterial);
    assert.equal(materials[1].polygonOffset, true);
    assert.equal(materials[1].polygonOffsetFactor, -2);
    assert.equal(materials[1].polygonOffsetUnits, -2);
});

test('mitigateCoplanarMaterialZFighting is a no-op when material groups do not overlap', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
        1, 0, 1,
        0, 1, 1,
    ], 3));
    geometry.clearGroups();
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);

    const materialA = new THREE.MeshStandardMaterial({ color: 0x999999 });
    const materialB = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const mesh = new THREE.Mesh(geometry, [materialA, materialB]);

    const result = mitigateCoplanarMaterialZFighting(mesh);
    const materials = mesh.material as THREE.Material[];

    assert.equal(result.duplicateTriangleCount, 0);
    assert.equal(result.adjustedMaterialCount, 0);
    assert.equal(materials[0], materialA);
    assert.equal(materials[1], materialB);
});
