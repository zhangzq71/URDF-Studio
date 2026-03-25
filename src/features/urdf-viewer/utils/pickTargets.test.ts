import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { collectPickTargets, findPickIntersections } from './pickTargets';

function createBoxMesh(material?: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    material ?? new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
}

test('collectPickTargets skips internal helper meshes and fully transparent meshes', () => {
  const pickableMesh = createBoxMesh();

  const helperGroup = new THREE.Group();
  helperGroup.name = '__origin_axes__';
  const helperMesh = createBoxMesh();
  helperGroup.add(helperMesh);

  const gizmoMesh = createBoxMesh();
  gizmoMesh.userData.isGizmo = true;

  const transparentMesh = createBoxMesh(
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
  );

  const linkMeshMap = new Map<string, THREE.Mesh[]>([
    ['base_link:visual', [pickableMesh, helperMesh, gizmoMesh, transparentMesh]],
  ]);

  const targets = collectPickTargets(linkMeshMap, 'visual');

  assert.deepEqual(targets, [pickableMesh]);
});

test('findPickIntersections keeps nearest hit first even when pick target order is unsorted', () => {
  const robot = new THREE.Group();

  const nearMesh = createBoxMesh();
  nearMesh.position.set(0, 0, -2);
  nearMesh.userData.parentLinkName = 'near_link';
  nearMesh.userData.isVisualMesh = true;
  robot.add(nearMesh);

  const farMesh = createBoxMesh();
  farMesh.position.set(0, 0, -5);
  farMesh.userData.parentLinkName = 'far_link';
  farMesh.userData.isVisualMesh = true;
  robot.add(farMesh);

  robot.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  const hits = findPickIntersections(robot, raycaster, [farMesh, nearMesh], 'visual', false);

  assert.equal(hits.length >= 2, true);
  assert.equal(hits[0]?.object, nearMesh);
  assert.ok((hits[0]?.distance ?? Infinity) <= (hits[1]?.distance ?? Infinity));
});
