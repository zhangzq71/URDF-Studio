import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createMatteMaterial, MATERIAL_CONFIG } from './materialFactory.ts';

function assertColorClose(actual: THREE.Color, expected: THREE.Color, epsilon = 1e-6): void {
  assert.ok(Math.abs(actual.r - expected.r) <= epsilon, `expected r=${actual.r} to be close to ${expected.r}`);
  assert.ok(Math.abs(actual.g - expected.g) <= epsilon, `expected g=${actual.g} to be close to ${expected.g}`);
  assert.ok(Math.abs(actual.b - expected.b) <= epsilon, `expected b=${actual.b} to be close to ${expected.b}`);
}

test('createMatteMaterial applies the shared matte defaults', () => {
  const material = createMatteMaterial({
    color: 0x336699,
    opacity: 0.42,
    transparent: true,
    side: THREE.FrontSide,
  });

  assert.equal(material.roughness, MATERIAL_CONFIG.roughness);
  assert.equal(material.metalness, MATERIAL_CONFIG.metalness);
  assert.equal(material.envMapIntensity, MATERIAL_CONFIG.envMapIntensity);
  assert.equal(material.opacity, 0.42);
  assert.equal(material.transparent, true);
  assert.equal(material.side, THREE.FrontSide);
  assertColorClose(material.color, new THREE.Color(0x336699));
});

test('createMatteMaterial softens non-authored pure white by default', () => {
  const material = createMatteMaterial({ color: 0xffffff });

  assertColorClose(material.color, new THREE.Color(0.95, 0.95, 0.95));
});

test('createMatteMaterial can preserve exact authored white when requested', () => {
  const material = createMatteMaterial({
    color: 0xffffff,
    preserveExactColor: true,
  });

  assertColorClose(material.color, new THREE.Color(0xffffff));
  assert.equal(material.toneMapped, false);
});

test('createMatteMaterial derives opacity from 8-digit hex colors without changing the authored rgb channels', () => {
  const material = createMatteMaterial({
    color: '#12345680',
    preserveExactColor: true,
  });

  assertColorClose(material.color, new THREE.Color('#123456'));
  assert.ok(Math.abs(material.opacity - (128 / 255)) <= 1e-6);
  assert.equal(material.transparent, true);
  assert.equal(material.toneMapped, false);
});
