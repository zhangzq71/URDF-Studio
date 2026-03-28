import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createVisualizerHoverUserData,
  findNearestVisualizerHoverTarget,
  findNearestVisualizerTargetFromHits,
  getVisualizerHoverTarget,
  type VisualizerHoverTarget,
} from './hoverPicking.ts';

function createTaggedMesh(
  target: VisualizerHoverTarget,
  z: number,
  options: {
    visible?: boolean;
    opacity?: number;
  } = {},
) {
  const wrapper = new THREE.Group();
  wrapper.userData = {
    ...wrapper.userData,
    ...createVisualizerHoverUserData(target),
  };
  wrapper.visible = options.visible ?? true;

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1,
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(0, 0, z);
  wrapper.add(mesh);

  return { wrapper, mesh };
}

test('getVisualizerHoverTarget resolves metadata through geometry ancestors', () => {
  const target: VisualizerHoverTarget = {
    type: 'link',
    id: 'forearm',
    subType: 'visual',
    objectIndex: 2,
  };

  const { wrapper, mesh } = createTaggedMesh(target, -2);
  wrapper.updateMatrixWorld(true);

  assert.deepEqual(getVisualizerHoverTarget(mesh), target);
});

test('findNearestVisualizerHoverTarget prefers the closest tagged link when hits overlap', () => {
  const root = new THREE.Group();

  const far = createTaggedMesh({
    type: 'link',
    id: 'far_link',
    subType: 'visual',
    objectIndex: 0,
  }, -5);

  const near = createTaggedMesh({
    type: 'link',
    id: 'near_link',
    subType: 'visual',
    objectIndex: 1,
  }, -2);

  root.add(far.wrapper);
  root.add(near.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  assert.deepEqual(findNearestVisualizerHoverTarget(root, raycaster), {
    type: 'link',
    id: 'near_link',
    subType: 'visual',
    objectIndex: 1,
  });
});

test('findNearestVisualizerHoverTarget ignores closer helper meshes without visualizer hover metadata', () => {
  const root = new THREE.Group();

  const helperMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff0000 }),
  );
  helperMesh.position.set(0, 0, -1);

  const tagged = createTaggedMesh({
    type: 'link',
    id: 'reachable_link',
    subType: 'collision',
    objectIndex: 0,
  }, -3);

  root.add(helperMesh);
  root.add(tagged.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  assert.deepEqual(findNearestVisualizerHoverTarget(root, raycaster), {
    type: 'link',
    id: 'reachable_link',
    subType: 'collision',
    objectIndex: 0,
  });
});

test('findNearestVisualizerHoverTarget skips hidden or fully transparent tagged geometry', () => {
  const root = new THREE.Group();

  const hidden = createTaggedMesh({
    type: 'link',
    id: 'hidden_link',
    subType: 'visual',
    objectIndex: 0,
  }, -1, { visible: false });

  const transparent = createTaggedMesh({
    type: 'link',
    id: 'transparent_link',
    subType: 'visual',
    objectIndex: 0,
  }, -2, { opacity: 0 });

  const fallback = createTaggedMesh({
    type: 'link',
    id: 'fallback_link',
    subType: 'visual',
    objectIndex: 4,
  }, -4);

  root.add(hidden.wrapper);
  root.add(transparent.wrapper);
  root.add(fallback.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  assert.deepEqual(findNearestVisualizerHoverTarget(root, raycaster), {
    type: 'link',
    id: 'fallback_link',
    subType: 'visual',
    objectIndex: 4,
  });
});

test('findNearestVisualizerTargetFromHits reuses the same nearest-visible filtering for click intersections', () => {
  const root = new THREE.Group();

  const helperMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff0000 }),
  );
  helperMesh.position.set(0, 0, -1);

  const transparent = createTaggedMesh({
    type: 'link',
    id: 'transparent_link',
    subType: 'visual',
    objectIndex: 0,
  }, -2, { opacity: 0 });

  const near = createTaggedMesh({
    type: 'link',
    id: 'near_link',
    subType: 'collision',
    objectIndex: 3,
  }, -3);

  const far = createTaggedMesh({
    type: 'link',
    id: 'far_link',
    subType: 'visual',
    objectIndex: 1,
  }, -5);

  root.add(helperMesh);
  root.add(transparent.wrapper);
  root.add(near.wrapper);
  root.add(far.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );
  const hits = raycaster.intersectObject(root, true);

  assert.deepEqual(findNearestVisualizerTargetFromHits(hits), {
    type: 'link',
    id: 'near_link',
    subType: 'collision',
    objectIndex: 3,
  });
});
