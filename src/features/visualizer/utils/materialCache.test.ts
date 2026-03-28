import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { clearMaterialCache, getCachedMaterial } from './materialCache.ts';

test('getCachedMaterial preserves exact authored visual colors in detail mode', () => {
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
