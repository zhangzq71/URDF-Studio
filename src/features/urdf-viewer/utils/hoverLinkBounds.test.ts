import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  choosePreferredHoverMatch,
  findNearestExpandedBoundsHit,
  type HoverMatch,
} from './hoverLinkBounds.ts';

interface TestHoverMeta {
  linkKey: string;
  role: 'visual' | 'collision';
}

function createMesh(position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.updateMatrixWorld(true);
  return mesh;
}

test('findNearestExpandedBoundsHit finds a small front link even when the ray only grazes its expanded bounds', () => {
  const frontSmallMesh = createMesh([0.045, 0, -2], [0.08, 0.08, 0.08]);
  const backLargeMesh = createMesh([0, 0, -4], [1.5, 1.5, 1.5]);

  const ray = new THREE.Ray(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  const hit = findNearestExpandedBoundsHit<TestHoverMeta>(
    ray,
    [
      { mesh: frontSmallMesh, meta: { linkKey: 'front', role: 'visual' } },
      { mesh: backLargeMesh, meta: { linkKey: 'back', role: 'visual' } },
    ],
    (meta) => meta.linkKey,
  );

  assert.ok(hit);
  assert.equal(hit?.meta.linkKey, 'front');
  assert.ok((hit?.padding ?? 0) > 0);
});

test('choosePreferredHoverMatch prefers the exact hit when both candidates resolve to the same link', () => {
  const exact: HoverMatch<TestHoverMeta> = {
    meta: { linkKey: 'arm_link', role: 'visual' },
    distance: 1.8,
  };
  const bounds: HoverMatch<TestHoverMeta> = {
    meta: { linkKey: 'arm_link', role: 'visual' },
    distance: 1.7,
    padding: 0.15,
  };

  const resolved = choosePreferredHoverMatch(exact, bounds, (meta) => meta.linkKey);
  assert.equal(resolved, exact);
});

test('choosePreferredHoverMatch prefers a nearer bounds hit when the exact hit belongs to a farther link', () => {
  const exact: HoverMatch<TestHoverMeta> = {
    meta: { linkKey: 'rear_link', role: 'visual' },
    distance: 2.8,
  };
  const bounds: HoverMatch<TestHoverMeta> = {
    meta: { linkKey: 'front_link', role: 'visual' },
    distance: 2.45,
    padding: 0.1,
  };

  const resolved = choosePreferredHoverMatch(exact, bounds, (meta) => meta.linkKey);
  assert.equal(resolved, bounds);
});

test('choosePreferredHoverMatch keeps the exact hit when bounds is only closer because of padding inflation', () => {
  const exact: HoverMatch<TestHoverMeta> = {
    meta: { linkKey: 'target_link', role: 'visual' },
    distance: 2.52,
  };
  const bounds: HoverMatch<TestHoverMeta> = {
    meta: { linkKey: 'neighbor_link', role: 'visual' },
    distance: 2.45,
    padding: 0.1,
  };

  const resolved = choosePreferredHoverMatch(exact, bounds, (meta) => meta.linkKey);
  assert.equal(resolved, exact);
});
