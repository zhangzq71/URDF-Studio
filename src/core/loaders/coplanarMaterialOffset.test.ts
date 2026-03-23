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

test('mitigateCoplanarMaterialZFighting offsets every non-anchor material in an overlapping chain', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
        1, 0, 1,
        0, 1, 1,
        0, 0, 2,
        1, 0, 2,
        0, 1, 2,
        0, 0, 3,
        1, 0, 3,
        0, 1, 3,
        0, 0, 4,
        1, 0, 4,
        0, 1, 4,
        0, 0, 5,
        1, 0, 5,
        0, 1, 5,
        0, 0, 6,
        1, 0, 6,
        0, 1, 6,
    ], 3));
    geometry.setIndex([
        0, 1, 2,
        3, 4, 5,
        6, 7, 8,
        18, 19, 20,
        0, 1, 2,
        12, 13, 14,
        12, 13, 14,
        9, 10, 11,
        15, 16, 17,
    ]);
    geometry.clearGroups();
    geometry.addGroup(0, 12, 0);
    geometry.addGroup(12, 6, 1);
    geometry.addGroup(18, 9, 2);

    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
    const bridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const overlayMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const mesh = new THREE.Mesh(geometry, [baseMaterial, bridgeMaterial, overlayMaterial]);

    const result = mitigateCoplanarMaterialZFighting(mesh);
    const materials = mesh.material as THREE.Material[];

    assert.equal(result.duplicateTriangleCount, 2);
    assert.deepEqual(result.adjustedMaterialIndices, [1, 2]);
    assert.equal(result.adjustedMaterialCount, 2);
    assert.equal(isCoplanarOffsetMaterial(materials[0]), false);
    assert.equal(isCoplanarOffsetMaterial(materials[1]), true);
    assert.equal(isCoplanarOffsetMaterial(materials[2]), true);
});
