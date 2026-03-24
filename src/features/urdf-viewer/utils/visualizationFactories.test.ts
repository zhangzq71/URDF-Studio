import assert from 'node:assert/strict';
import test from 'node:test';

import type { Material, Mesh } from 'three';

import { createOriginAxes } from './visualizationFactories.ts';

function collectMeshMaterials(originAxes: ReturnType<typeof createOriginAxes>) {
  const materials: Material[] = [];

  originAxes.traverse((child) => {
    if (!(child as Mesh).isMesh) {
      return;
    }

    const material = (child as Mesh).material;
    if (Array.isArray(material)) {
      materials.push(...material);
      return;
    }

    materials.push(material);
  });

  return materials;
}

test('createOriginAxes defaults to participating in depth occlusion', () => {
  const originAxes = createOriginAxes(0.1);
  const materials = collectMeshMaterials(originAxes);

  assert.ok(materials.length > 0, 'origin axes should create mesh materials');
  materials.forEach((material) => {
    assert.equal(material.depthTest, true);
    assert.equal(material.depthWrite, true);
    assert.equal(material.transparent, false);
  });
});
