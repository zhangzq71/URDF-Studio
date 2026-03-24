import assert from 'node:assert/strict';
import test from 'node:test';
import { GeometryType } from '../../../types/geometry.ts';
import type { RobotState, UrdfLink } from '../../../types/robot.ts';
import { collectVisualizerMeshLoadKeys } from './visualizerMeshLoading.ts';

function createMeshGeometry(meshPath: string) {
  return {
    type: GeometryType.MESH,
    dimensions: { x: 1, y: 1, z: 1 },
    color: '#ffffff',
    meshPath,
    origin: {
      xyz: { x: 0, y: 0, z: 0 },
      rpy: { r: 0, p: 0, y: 0 },
    },
  };
}

function createPrimitiveGeometry() {
  return {
    type: GeometryType.BOX,
    dimensions: { x: 1, y: 1, z: 1 },
    color: '#ffffff',
    origin: {
      xyz: { x: 0, y: 0, z: 0 },
      rpy: { r: 0, p: 0, y: 0 },
    },
  };
}

function createRobotState(link: Partial<UrdfLink>): RobotState {
  return {
    name: 'test-robot',
    rootLinkId: 'base',
    links: {
      base: {
        id: 'base',
        name: 'base',
        visual: createPrimitiveGeometry(),
        collision: createPrimitiveGeometry(),
        ...link,
      },
    },
    joints: {},
    selection: { type: null, id: null },
  };
}

test('collectVisualizerMeshLoadKeys keeps skeleton mesh loads even when geometry is hidden', () => {
  const robot = createRobotState({
    visual: createMeshGeometry('meshes/base.stl'),
  });

  const keys = collectVisualizerMeshLoadKeys({
    robot,
    mode: 'skeleton',
    showGeometry: false,
    showCollision: false,
    assets: {
      'meshes/base.stl': 'blob:base',
    },
  });

  assert.deepEqual(keys, ['base|visual|primary|0|meshes/base.stl']);
});

test('collectVisualizerMeshLoadKeys skips hidden detail collisions until collision display is enabled', () => {
  const robot = createRobotState({
    collision: createMeshGeometry('meshes/collision.obj'),
  });

  const hiddenKeys = collectVisualizerMeshLoadKeys({
    robot,
    mode: 'detail',
    showGeometry: true,
    showCollision: false,
    assets: {
      'meshes/collision.obj': 'blob:collision',
    },
  });
  assert.deepEqual(hiddenKeys, []);

  const visibleKeys = collectVisualizerMeshLoadKeys({
    robot,
    mode: 'detail',
    showGeometry: true,
    showCollision: true,
    assets: {
      'meshes/collision.obj': 'blob:collision',
    },
  });
  assert.deepEqual(visibleKeys, ['base|collision|primary|0|meshes/collision.obj']);
});

test('collectVisualizerMeshLoadKeys ignores missing or unsupported mesh assets', () => {
  const robot = createRobotState({
    visual: createMeshGeometry('meshes/base.glb'),
    collisionBodies: [createMeshGeometry('meshes/extra.dae')],
  });

  const keys = collectVisualizerMeshLoadKeys({
    robot,
    mode: 'detail',
    showGeometry: true,
    showCollision: true,
    assets: {
      'meshes/base.stl': 'blob:other',
    },
  });

  assert.deepEqual(keys, []);
});
