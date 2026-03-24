import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { collectCameraFitSelection } from './camera.js';

test('collectCameraFitSelection prefers visible meshes over hidden collision helpers', () => {
    const root = new THREE.Group();
    const visibleVisual = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const hiddenCollision = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
    visibleVisual.visible = true;
    hiddenCollision.visible = false;

    root.add(visibleVisual);
    root.add(hiddenCollision);

    const selection = collectCameraFitSelection(root);
    assert.deepEqual(selection, [visibleVisual]);
});

test('collectCameraFitSelection falls back to the root object when no visible mesh is available', () => {
    const root = new THREE.Group();
    const hiddenCollision = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    hiddenCollision.visible = false;
    root.add(hiddenCollision);

    const selection = collectCameraFitSelection(root);
    assert.deepEqual(selection, [root]);
});
