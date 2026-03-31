import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { clearMaterialCache, getCachedMaterial } from './materialCache.ts';

test('getCachedMaterial preserves exact authored visual colors for non-skeleton scene geometry', () => {
  clearMaterialCache();

  const printed = getCachedMaterial({
    isSkeleton: false,
    finalColor: '#ffd11e',
    matOpacity: 1,
    matWireframe: false,
    isCollision: false,
    emissiveColor: '#000000',
    emissiveIntensity: 0,
  });
  const servo = getCachedMaterial({
    isSkeleton: false,
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

test('getCachedMaterial normalizes rgba hex colors for skeleton materials', () => {
  clearMaterialCache();

  const material = getCachedMaterial({
    isSkeleton: true,
    finalColor: '#89afcc66',
    matOpacity: 0.2,
    matWireframe: true,
    isCollision: false,
    emissiveColor: '#000000',
    emissiveIntensity: 0,
  });

  assert.equal(material instanceof THREE.MeshBasicMaterial, true);
  if (!(material instanceof THREE.MeshBasicMaterial)) {
    assert.fail('expected skeleton material to use MeshBasicMaterial');
  }

  assert.equal(material.color.getHexString(), '89afcc');
  assert.equal(material.transparent, true);
  assert.ok(Math.abs(material.opacity - 0.08) < 1e-6);
});

test('getCachedMaterial preserves authored alpha for detail materials', () => {
  clearMaterialCache();

  const material = getCachedMaterial({
    isSkeleton: false,
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
