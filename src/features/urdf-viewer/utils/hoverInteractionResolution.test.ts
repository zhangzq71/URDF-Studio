import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  resolveHoverInteractionResolution,
  type ResolvedHoverInteractionCandidate,
} from './hoverInteractionResolution.ts';

function createLinkCandidate(
  id: string,
  distance: number,
  subType: 'visual' | 'collision' = 'visual',
  object: THREE.Object3D | null = null,
): ResolvedHoverInteractionCandidate {
  return {
    type: 'link',
    id,
    linkId: id,
    subType,
    targetKind: 'geometry',
    distance,
    highlightTarget: object ?? undefined,
  };
}

function createHelperCandidate(
  id: string,
  distance: number,
  helperKind: 'origin-axes' | 'joint-axis' | 'center-of-mass' | 'inertia',
  object: THREE.Object3D | null = null,
): ResolvedHoverInteractionCandidate {
  return {
    type: helperKind === 'joint-axis' ? 'joint' : 'link',
    id,
    targetKind: 'helper',
    helperKind,
    distance,
    highlightTarget: object ?? undefined,
  };
}

function createMesh(
  options: {
    renderOrder?: number;
    depthTest?: boolean;
  } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  mesh.renderOrder = options.renderOrder ?? 0;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    material.depthTest = options.depthTest ?? true;
  }

  return mesh;
}

function createSupportPlane(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({ color: 0x666666 }),
  );
  mesh.name = 'floor';
  return mesh;
}

test('resolveHoverInteractionResolution uses nearest hit when candidates share the same layer score', () => {
  const candidates = [
    createLinkCandidate('right_wrist_roll_link', 0.58, 'visual', createMesh()),
    createLinkCandidate('right_wrist_pitch_link', 0.6, 'visual', createMesh()),
  ];

  const result = resolveHoverInteractionResolution(candidates);

  assert.equal(result.primaryInteraction?.id, 'right_wrist_roll_link');
});

test('resolveHoverInteractionResolution keeps the nearer geometry hit ahead of a farther preferred layer', () => {
  const candidates = [
    createLinkCandidate('visual_link', 0.58, 'visual', createMesh()),
    createLinkCandidate('collision_link', 0.6, 'collision', createMesh()),
  ];

  const result = resolveHoverInteractionResolution(candidates, ['collision', 'visual']);

  assert.equal(result.primaryInteraction?.id, 'visual_link');
  assert.equal(result.primaryInteraction?.subType, 'visual');
});

test('resolveHoverInteractionResolution deprioritizes floor-like support planes beneath foreground geometry', () => {
  const candidates = [
    createLinkCandidate('floor_link', 0.6, 'collision', createSupportPlane()),
    createLinkCandidate('visual_link', 0.58, 'visual', createMesh()),
  ];

  const result = resolveHoverInteractionResolution(candidates, ['collision', 'visual']);

  assert.equal(result.primaryInteraction?.id, 'visual_link');
  assert.equal(result.primaryInteraction?.subType, 'visual');
});

test('resolveHoverInteractionResolution keeps floor-like support planes hoverable when no foreground target overlaps', () => {
  const candidates = [createLinkCandidate('floor_link', 0.6, 'collision', createSupportPlane())];

  const result = resolveHoverInteractionResolution(candidates, ['collision', 'visual']);

  assert.equal(result.primaryInteraction?.id, 'floor_link');
  assert.equal(result.primaryInteraction?.subType, 'collision');
});

test('resolveHoverInteractionResolution follows latest activation order when no layer is pinned', () => {
  const candidates = [
    createLinkCandidate('visual_link', 0.58, 'visual', createMesh()),
    createHelperCandidate('base_link', 0.62, 'center-of-mass', createMesh()),
  ];

  const result = resolveHoverInteractionResolution(candidates, ['center-of-mass', 'visual']);

  assert.equal(result.primaryInteraction?.id, 'base_link');
  assert.equal(result.primaryInteraction?.helperKind, 'center-of-mass');
});

test('resolveHoverInteractionResolution treats overlay presentation as stronger than plain geometry when pinned', () => {
  const candidates = [
    createLinkCandidate('visual_link', 0.4, 'visual', createMesh()),
    createHelperCandidate(
      'hip_joint',
      0.8,
      'joint-axis',
      createMesh({ renderOrder: 10001, depthTest: false }),
    ),
  ];

  const result = resolveHoverInteractionResolution(candidates, ['joint-axis', 'visual']);

  assert.equal(result.primaryInteraction?.id, 'hip_joint');
  assert.equal(result.primaryInteraction?.helperKind, 'joint-axis');
});

test('resolveHoverInteractionResolution lets a screen-space helper beat higher-priority collision geometry', () => {
  const candidates = [
    createLinkCandidate('collision_link', 0.2, 'collision', createMesh()),
    {
      ...createHelperCandidate('hip_joint', 0, 'joint-axis', createMesh()),
      screenSpaceProjected: true,
    },
  ];

  const result = resolveHoverInteractionResolution(candidates, [
    'collision',
    'joint-axis',
    'visual',
  ]);

  assert.equal(result.primaryInteraction?.id, 'hip_joint');
  assert.equal(result.primaryInteraction?.helperKind, 'joint-axis');
  assert.equal(result.primaryInteraction?.screenSpaceProjected, true);
});

test('resolveHoverInteractionResolution returns null when there are no candidates', () => {
  const result = resolveHoverInteractionResolution([]);

  assert.equal(result.primaryInteraction, null);
});
