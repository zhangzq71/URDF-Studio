import test from 'node:test';
import assert from 'node:assert/strict';
import type { RefObject } from 'react';
import * as THREE from 'three';

import { URDFLink, URDFVisual } from '@/core/parsers/urdf/loader/URDFClasses';

import { rebuildLinkMeshMapFromRobot } from './robotLoaderPatchUtils';

test('rebuildLinkMeshMapFromRobot restores collision meshes from collider ancestors when collisions become visible', () => {
  const robot = new THREE.Group();
  const link = new URDFLink();
  link.name = 'base_link';

  const visualGroup = new URDFVisual();
  const visualMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x999999 }),
  );
  visualMesh.userData.parentLinkName = 'base_link';
  visualGroup.add(visualMesh);

  const collisionGroup = new THREE.Group();
  collisionGroup.userData.isCollisionGroup = true;
  collisionGroup.userData.parentLinkName = 'base_link';
  collisionGroup.visible = false;

  const collisionMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1),
    new THREE.MeshBasicMaterial({ color: 0xff0000 }),
  );
  collisionGroup.add(collisionMesh);

  link.add(visualGroup);
  link.add(collisionGroup);
  robot.add(link);

  const linkMeshMapRef = {
    current: new Map<string, THREE.Mesh[]>(),
  } as RefObject<Map<string, THREE.Mesh[]>>;

  rebuildLinkMeshMapFromRobot(linkMeshMapRef, robot);

  assert.deepEqual(linkMeshMapRef.current.get('base_link:visual'), [visualMesh]);
  assert.equal(linkMeshMapRef.current.has('base_link:collision'), false);

  collisionGroup.visible = true;
  rebuildLinkMeshMapFromRobot(linkMeshMapRef, robot);

  assert.deepEqual(linkMeshMapRef.current.get('base_link:visual'), [visualMesh]);
  assert.deepEqual(linkMeshMapRef.current.get('base_link:collision'), [collisionMesh]);
  assert.equal(collisionMesh.userData.parentLinkName, 'base_link');
  assert.equal(collisionMesh.userData.isCollisionMesh, true);
  assert.equal(collisionMesh.userData.isVisualMesh, false);
});
