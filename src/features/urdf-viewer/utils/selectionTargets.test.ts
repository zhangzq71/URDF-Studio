import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { resolveHitLinkTarget, resolveSelectionHit } from './selectionTargets';

function createRobotWithLinks(...links: THREE.Object3D[]): THREE.Object3D {
  const robot = new THREE.Group() as THREE.Group & { links?: Record<string, THREE.Object3D> };
  robot.links = Object.fromEntries(links.map((link) => [link.name, link]));
  return robot;
}

function createUrdfLink(name: string): THREE.Group {
  const link = new THREE.Group() as THREE.Group & { isURDFLink?: boolean; type?: string };
  link.name = name;
  link.isURDFLink = true;
  link.type = 'URDFLink';
  return link;
}

function createUrdfVisual(name: string): THREE.Group {
  const visual = new THREE.Group() as THREE.Group & { isURDFVisual?: boolean };
  visual.name = name;
  visual.isURDFVisual = true;
  return visual;
}

test('resolveHitLinkTarget prefers parentLinkName metadata for logical link ownership', () => {
  const outerLink = createUrdfLink('outer_link');
  const innerLink = createUrdfLink('inner_link');
  const robot = createRobotWithLinks(outerLink, innerLink);

  robot.add(outerLink);
  outerLink.add(innerLink);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.userData.parentLinkName = 'outer_link';
  innerLink.add(mesh);

  const resolved = resolveHitLinkTarget(robot, mesh);

  assert.ok(resolved);
  assert.equal(resolved?.linkId, 'outer_link');
  assert.equal(resolved?.linkObject, outerLink);
});

test('resolveHitLinkTarget falls back to hierarchy when metadata is unavailable', () => {
  const link = createUrdfLink('base_link');
  const robot = createRobotWithLinks(link);
  robot.add(link);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  link.add(mesh);

  const resolved = resolveHitLinkTarget(robot, mesh);

  assert.ok(resolved);
  assert.equal(resolved?.linkId, 'base_link');
  assert.equal(resolved?.linkObject, link);
});

test('resolveSelectionHit keeps URDF visual indexing when metadata resolves the owning link', () => {
  const link = createUrdfLink('base_link');
  const robot = createRobotWithLinks(link);
  robot.add(link);

  const firstVisual = createUrdfVisual('visual_0');
  const firstMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  firstMesh.userData.parentLinkName = 'base_link';
  firstVisual.add(firstMesh);
  link.add(firstVisual);

  const secondVisual = createUrdfVisual('visual_1');
  const secondMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  secondMesh.userData.parentLinkName = 'base_link';
  secondVisual.add(secondMesh);
  link.add(secondVisual);

  const resolved = resolveSelectionHit(robot, secondMesh);

  assert.ok(resolved);
  assert.equal(resolved?.linkId, 'base_link');
  assert.equal(resolved?.objectIndex, 1);
  assert.equal(resolved?.highlightTarget, secondMesh);
});
