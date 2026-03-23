import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
    applyUnifiedHydraMaterialDefaults,
    createUnifiedHydraPhysicalMaterial,
    HYDRA_DEFAULT_GRAY_HEX,
    HYDRA_UNIFIED_MATERIAL_DEFAULTS,
} from './material-defaults.js';

function assertColorClose(actual, expectedHex, epsilon = 1e-6) {
    const expected = new THREE.Color(expectedHex);
    assert.ok(Math.abs(actual.r - expected.r) <= epsilon, `expected r=${actual.r} to be close to ${expected.r}`);
    assert.ok(Math.abs(actual.g - expected.g) <= epsilon, `expected g=${actual.g} to be close to ${expected.g}`);
    assert.ok(Math.abs(actual.b - expected.b) <= epsilon, `expected b=${actual.b} to be close to ${expected.b}`);
}

test('createUnifiedHydraPhysicalMaterial uses shared viewer defaults', () => {
    const material = createUnifiedHydraPhysicalMaterial();

    assert.equal(material.roughness, HYDRA_UNIFIED_MATERIAL_DEFAULTS.roughness);
    assert.equal(material.metalness, HYDRA_UNIFIED_MATERIAL_DEFAULTS.metalness);
    assert.equal(material.envMapIntensity, HYDRA_UNIFIED_MATERIAL_DEFAULTS.envMapIntensity);
    assertColorClose(material.color, HYDRA_DEFAULT_GRAY_HEX);
});

test('applyUnifiedHydraMaterialDefaults normalizes existing material settings', () => {
    const material = new THREE.MeshPhysicalMaterial({
        roughness: 1,
        metalness: 1,
        envMapIntensity: 1,
    });

    applyUnifiedHydraMaterialDefaults(material);

    assert.equal(material.roughness, HYDRA_UNIFIED_MATERIAL_DEFAULTS.roughness);
    assert.equal(material.metalness, HYDRA_UNIFIED_MATERIAL_DEFAULTS.metalness);
    assert.equal(material.envMapIntensity, HYDRA_UNIFIED_MATERIAL_DEFAULTS.envMapIntensity);
});
