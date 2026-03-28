import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { URDFLink } from '@/core/parsers/urdf/loader/URDFClasses';

import { COLLISION_OVERLAY_RENDER_ORDER, collisionBaseMaterial } from './materials';
import { syncCollisionGroupVisibility } from './collisionVisibilitySync';

test('syncCollisionGroupVisibility skips collider subtree traversal while collisions are hidden', () => {
  const link = new URDFLink();
  link.name = 'base_link';

  const collider = new THREE.Group();
  (collider as any).isURDFCollider = true;
  const meshMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), meshMaterial);
  collider.add(mesh);
  link.add(collider);

  const originalTraverse = collider.traverse.bind(collider);
  let traverseCalls = 0;
  collider.traverse = ((callback: (object: THREE.Object3D) => void) => {
    traverseCalls += 1;
    return originalTraverse(callback);
  }) as typeof collider.traverse;

  const changed = syncCollisionGroupVisibility({
    collider,
    showCollision: false,
  });

  assert.equal(changed, true);
  assert.equal(collider.visible, false);
  assert.equal(traverseCalls, 0);
  assert.equal(mesh.material, meshMaterial);
  assert.equal(mesh.userData.isCollisionMesh, undefined);
});

test('syncCollisionGroupVisibility restores collision overlay state when collisions are visible', () => {
  const link = new URDFLink();
  link.name = 'base_link';

  const collider = new THREE.Group();
  (collider as any).isURDFCollider = true;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  collider.add(mesh);
  link.add(collider);

  const changed = syncCollisionGroupVisibility({
    collider,
    showCollision: true,
  });

  assert.equal(changed, true);
  assert.equal(collider.visible, true);
  assert.equal(mesh.visible, true);
  assert.equal(mesh.userData.isCollisionMesh, true);
  assert.equal(mesh.material, collisionBaseMaterial);
  assert.equal(mesh.renderOrder, COLLISION_OVERLAY_RENDER_ORDER);
  assert.equal(mesh.raycast, THREE.Mesh.prototype.raycast);
});

test('syncCollisionGroupVisibility preserves highlighted collision materials', () => {
  const link = new URDFLink();
  link.name = 'base_link';

  const collider = new THREE.Group();
  (collider as any).isURDFCollider = true;
  const meshMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), meshMaterial);
  collider.add(mesh);
  link.add(collider);

  const highlightedMeshes = new Map<THREE.Mesh, unknown>([[mesh, { highlighted: true }]]);

  const changed = syncCollisionGroupVisibility({
    collider,
    showCollision: true,
    highlightedMeshes,
  });

  assert.equal(changed, true);
  assert.equal(mesh.material, meshMaterial);
  assert.equal(mesh.userData.isCollisionMesh, true);
  assert.equal(mesh.visible, true);
});

test('syncCollisionGroupVisibility reuses cached collider mesh lists across visible sync passes', () => {
  const link = new URDFLink();
  link.name = 'base_link';

  const collider = new THREE.Group();
  (collider as any).isURDFCollider = true;

  const nestedGroup = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  nestedGroup.add(mesh);
  collider.add(nestedGroup);
  link.add(collider);

  const originalTraverse = collider.traverse.bind(collider);
  let traverseCalls = 0;
  collider.traverse = ((callback: (object: THREE.Object3D) => void) => {
    traverseCalls += 1;
    return originalTraverse(callback);
  }) as typeof collider.traverse;

  const changedFirstPass = syncCollisionGroupVisibility({
    collider,
    showCollision: true,
  });
  const changedSecondPass = syncCollisionGroupVisibility({
    collider,
    showCollision: true,
  });

  assert.equal(changedFirstPass, true);
  assert.equal(changedSecondPass, false);
  assert.equal(traverseCalls, 1);
  assert.equal(mesh.material, collisionBaseMaterial);
});
