import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { clearMaterialCache, getCachedMaterial } from './materialCache.ts';

test('getCachedMaterial preserves exact authored visual colors for Visualizer geometry', () => {
  clearMaterialCache();

  const printed = getCachedMaterial({
    finalColor: '#ffd11e',
    matOpacity: 1,
    matWireframe: false,
    isCollision: false,
    emissiveColor: '#000000',
    emissiveIntensity: 0,
  });
  const servo = getCachedMaterial({
    finalColor: '#191919',
    matOpacity: 1,
    matWireframe: false,
    isCollision: false,
    emissiveColor: '#000000',
    emissiveIntensity: 0,
  });

  assert.equal(printed instanceof THREE.MeshStandardMaterial, true);
  assert.equal(servo instanceof THREE.MeshStandardMaterial, true);
  if (!(printed instanceof THREE.MeshStandardMaterial) || !(servo instanceof THREE.MeshStandardMaterial)) {
    assert.fail('expected visualizer materials to use shared matte MeshStandardMaterial');
  }

  assert.equal(printed.toneMapped, false);
  assert.equal(servo.toneMapped, false);
  assert.equal(printed.color.getHexString(), 'ffd11e');
  assert.equal(servo.color.getHexString(), '191919');
});

test('getCachedMaterial preserves authored alpha for detail materials', () => {
  clearMaterialCache();

  const material = getCachedMaterial({
    finalColor: '#89afcc66',
    matOpacity: 1,
    matWireframe: false,
    isCollision: false,
    emissiveColor: '#000000',
    emissiveIntensity: 0,
  });

  assert.equal(material instanceof THREE.MeshStandardMaterial, true);
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    assert.fail('expected detail material to use MeshStandardMaterial');
  }

  assert.equal(material.color.getHexString(), '89afcc');
  assert.equal(material.transparent, true);
  assert.ok(Math.abs(material.opacity - 0.4) < 1e-6);
});

test('getCachedMaterial makes collision materials double-sided for stable mesh picking', () => {
  clearMaterialCache();

  const material = getCachedMaterial({
    finalColor: '#a855f7',
    matOpacity: 0.3,
    matWireframe: true,
    isCollision: true,
    emissiveColor: '#000000',
    emissiveIntensity: 0,
  });

  assert.equal(material instanceof THREE.MeshStandardMaterial, true);
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    assert.fail('expected collision material to use MeshStandardMaterial');
  }

  assert.equal(material.side, THREE.DoubleSide);
  assert.equal(material.transparent, true);
  assert.equal(material.wireframe, true);
});
