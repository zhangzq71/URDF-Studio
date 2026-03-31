import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createVisualizerHoverUserData,
  findNearestVisualizerHoverTarget,
  findNearestVisualizerTargetFromHits,
  getVisualizerHoverTarget,
  resolveVisualizerInteractionTargetFromHits,
  type VisualizerHoverTarget,
} from './hoverPicking.ts';
import {
  createGeometryHoverTargetSelection,
  resolveGeometryHoverTargetFromHits,
} from './geometryHover.ts';

const findNearestVisualizerHoverTargetWithOptions =
  findNearestVisualizerHoverTarget as unknown as (
    root: THREE.Object3D | null,
    raycaster: THREE.Raycaster,
    options?: unknown,
  ) => VisualizerHoverTarget | null;

const findNearestVisualizerTargetFromHitsWithOptions =
  findNearestVisualizerTargetFromHits as unknown as (
    hits: readonly THREE.Intersection<THREE.Object3D>[],
    options?: unknown,
  ) => VisualizerHoverTarget | null;

const resolveGeometryHoverTargetFromHitsWithOptions =
  resolveGeometryHoverTargetFromHits as unknown as (
    fallbackTarget: ReturnType<typeof createGeometryHoverTargetSelection>,
    hits: readonly THREE.Intersection<THREE.Object3D>[],
    options?: unknown,
  ) => ReturnType<typeof createGeometryHoverTargetSelection>;

const resolveVisualizerInteractionTargetFromHitsWithOptions =
  resolveVisualizerInteractionTargetFromHits as unknown as (
    object: THREE.Object3D | null,
    hits: readonly THREE.Intersection<THREE.Object3D>[],
    options?: unknown,
  ) => VisualizerHoverTarget | null;

function createTaggedMesh(
  target: VisualizerHoverTarget,
  z: number,
  options: {
    visible?: boolean;
    opacity?: number;
    colorWrite?: boolean;
    depthTest?: boolean;
    isHelper?: boolean;
    renderOrder?: number;
    interactionLayer?: 'visual' | 'collision' | 'origin-axes' | 'joint-axis' | 'center-of-mass' | 'inertia';
  } = {},
) {
  const wrapper = new THREE.Group();
  wrapper.userData = {
    ...wrapper.userData,
    ...createVisualizerHoverUserData(target, options.interactionLayer),
  };
  if (options.isHelper) {
    wrapper.userData.isHelper = true;
  }
  wrapper.visible = options.visible ?? true;
  wrapper.renderOrder = options.renderOrder ?? 0;

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1,
    colorWrite: options.colorWrite ?? true,
    depthTest: options.depthTest ?? true,
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

test('findNearestVisualizerHoverTarget keeps non-rendering pick proxies raycastable', () => {
  const root = new THREE.Group();

  const pickProxy = createTaggedMesh({
    type: 'link',
    id: 'helper_link',
  }, -1, { colorWrite: false });

  root.add(pickProxy.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  assert.deepEqual(findNearestVisualizerHoverTarget(root, raycaster), {
    type: 'link',
    id: 'helper_link',
  });
});

test('findNearestVisualizerHoverTarget prefers overlay helpers over nearer standard geometry', () => {
  const root = new THREE.Group();

  const geometry = createTaggedMesh({
    type: 'link',
    id: 'front_geometry',
    subType: 'collision',
    objectIndex: 0,
  }, -1);

  const overlayHelper = createTaggedMesh({
    type: 'link',
    id: 'overlay_helper',
  }, -2, {
    depthTest: false,
    isHelper: true,
  });

  root.add(geometry.wrapper);
  root.add(overlayHelper.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  assert.deepEqual(findNearestVisualizerHoverTarget(root, raycaster), {
    type: 'link',
    id: 'overlay_helper',
  });
});

test('findNearestVisualizerHoverTarget prefers collision targets over visual targets when layers overlap', () => {
  const root = new THREE.Group();

  const visual = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'visual',
    objectIndex: 0,
  }, -2);

  const collision = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'collision',
    objectIndex: 1,
  }, -2.01);

  root.add(visual.wrapper);
  root.add(collision.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  assert.deepEqual(findNearestVisualizerHoverTarget(root, raycaster), {
    type: 'link',
    id: 'shared_link',
    subType: 'collision',
    objectIndex: 1,
  });
});

test('findNearestVisualizerHoverTarget honors explicit layer priority over legacy collision bias', () => {
  const root = new THREE.Group();

  const visual = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'visual',
    objectIndex: 0,
  }, -2);

  const collision = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'collision',
    objectIndex: 1,
  }, -2.01);

  root.add(visual.wrapper);
  root.add(collision.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  assert.deepEqual(
    findNearestVisualizerHoverTargetWithOptions(root, raycaster, {
      interactionLayerPriority: ['visual', 'collision'],
    }),
    {
      type: 'link',
      id: 'shared_link',
      subType: 'visual',
      objectIndex: 0,
    },
  );
});

test('resolveVisualizerInteractionTargetFromHits prefers the directly hit helper target over overlapping link layers', () => {
  const root = new THREE.Group();

  const helper = createTaggedMesh({
    type: 'joint',
    id: 'joint_1',
  }, -2, {
    isHelper: true,
    interactionLayer: 'origin-axes',
  });

  const visual = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'visual',
    objectIndex: 0,
  }, -1.5, {
    interactionLayer: 'visual',
  });

  root.add(helper.wrapper);
  root.add(visual.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );
  const hits = raycaster.intersectObject(root, true);

  assert.deepEqual(
    findNearestVisualizerTargetFromHitsWithOptions(hits, {
      interactionLayerPriority: ['visual', 'origin-axes'],
    }),
    {
      type: 'link',
      id: 'shared_link',
      subType: 'visual',
      objectIndex: 0,
    },
  );

  assert.deepEqual(
    resolveVisualizerInteractionTargetFromHitsWithOptions(helper.mesh, hits, {
      interactionLayerPriority: ['visual', 'origin-axes'],
    }),
    {
      type: 'joint',
      id: 'joint_1',
    },
  );
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

test('findNearestVisualizerHoverTarget returns joint targets when the joint helper is visually on top', () => {
  const root = new THREE.Group();

  const jointHelper = createTaggedMesh({
    type: 'joint',
    id: 'joint_1',
  }, -1, {
    depthTest: false,
    isHelper: true,
    renderOrder: 10000,
  });

  const collision = createTaggedMesh({
    type: 'link',
    id: 'forearm_link',
    subType: 'collision',
    objectIndex: 0,
  }, -3);

  root.add(jointHelper.wrapper);
  root.add(collision.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );

  assert.deepEqual(findNearestVisualizerHoverTarget(root, raycaster), {
    type: 'joint',
    id: 'joint_1',
  });
});

test('resolveGeometryHoverTargetFromHits promotes collision hover above overlapping visual geometry', () => {
  const root = new THREE.Group();

  const visual = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'visual',
    objectIndex: 0,
  }, -2);

  const collision = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'collision',
    objectIndex: 1,
  }, -2.01);

  root.add(visual.wrapper);
  root.add(collision.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );
  const hits = raycaster.intersectObject(root, true);

  assert.deepEqual(
    resolveGeometryHoverTargetFromHits(
      createGeometryHoverTargetSelection('shared_link', 'visual', 0),
      hits,
    ),
    createGeometryHoverTargetSelection('shared_link', 'collision', 1),
  );
});

test('resolveGeometryHoverTargetFromHits honors explicit visual-first layer priority', () => {
  const root = new THREE.Group();

  const visual = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'visual',
    objectIndex: 0,
  }, -2);

  const collision = createTaggedMesh({
    type: 'link',
    id: 'shared_link',
    subType: 'collision',
    objectIndex: 1,
  }, -2.01);

  root.add(visual.wrapper);
  root.add(collision.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );
  const hits = raycaster.intersectObject(root, true);

  assert.deepEqual(
    resolveGeometryHoverTargetFromHitsWithOptions(
      createGeometryHoverTargetSelection('shared_link', 'collision', 1),
      hits,
      { interactionLayerPriority: ['visual', 'collision'] },
    ),
    createGeometryHoverTargetSelection('shared_link', 'visual', 0),
  );
});

test('resolveGeometryHoverTargetFromHits keeps the local geometry target when no prioritized link hit exists', () => {
  const root = new THREE.Group();

  const jointHelper = createTaggedMesh({
    type: 'joint',
    id: 'joint_1',
  }, -1, {
    depthTest: false,
    isHelper: true,
    renderOrder: 10000,
  });

  root.add(jointHelper.wrapper);
  root.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );
  const hits = raycaster.intersectObject(root, true);
  const fallbackTarget = createGeometryHoverTargetSelection('shared_link', 'visual', 0);

  assert.deepEqual(
    resolveGeometryHoverTargetFromHits(fallbackTarget, hits),
    fallbackTarget,
  );
});
