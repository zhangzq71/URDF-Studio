import assert from 'node:assert/strict';
import test from 'node:test';

import { GeometryType, type AssemblyState, type RobotData, type UrdfLink } from '@/types';

import {
  collectAssemblyCollisionMeshLoadKeysByComponent,
  resolveAssemblyCollisionRevealState,
} from './assemblyCollisionReveal.ts';

function createCollisionMeshLink(linkId: string, meshPath: string): UrdfLink {
  return {
    id: linkId,
    name: linkId,
    visible: true,
    visual: {
      type: GeometryType.BOX,
      dimensions: { x: 1, y: 1, z: 1 },
      color: '#6b7280',
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
    },
    collision: {
      type: GeometryType.MESH,
      dimensions: { x: 1, y: 1, z: 1 },
      color: '#a855f7',
      meshPath,
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
    },
    collisionBodies: [],
    inertial: {
      mass: 1,
      origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
    },
  };
}

function createComponentRobot(componentId: string, meshPath: string): RobotData {
  const rootLinkId = `${componentId}_base_link`;
  return {
    name: componentId,
    rootLinkId,
    links: {
      [rootLinkId]: createCollisionMeshLink(rootLinkId, meshPath),
    },
    joints: {},
  };
}

test('collectAssemblyCollisionMeshLoadKeysByComponent keeps namespaced collision mesh keys per component', () => {
  const assemblyState: AssemblyState = {
    name: 'workspace',
    components: {
      comp_alpha: {
        id: 'comp_alpha',
        name: 'alpha',
        sourceFile: 'robots/alpha.urdf',
        robot: createComponentRobot('comp_alpha', 'meshes/shared_collision.dae'),
        visible: true,
      },
      comp_beta: {
        id: 'comp_beta',
        name: 'beta',
        sourceFile: 'robots/beta.urdf',
        robot: createComponentRobot('comp_beta', 'meshes/beta_collision.stl'),
        visible: true,
      },
    },
    bridges: {},
  };

  const { componentMeshLoadKeys } = collectAssemblyCollisionMeshLoadKeysByComponent({
    assemblyState,
    assets: {
      'meshes/shared_collision.dae': 'blob:shared',
      'meshes/beta_collision.stl': 'blob:beta',
    },
  });

  assert.deepEqual(componentMeshLoadKeys, {
    comp_alpha: ['comp_alpha_base_link|collision|primary|0|meshes/shared_collision.dae'],
    comp_beta: ['comp_beta_base_link|collision|primary|0|meshes/beta_collision.stl'],
  });
});

test('resolveAssemblyCollisionRevealState only reveals visible components whose collision meshes are fully ready', () => {
  const assemblyState: AssemblyState = {
    name: 'workspace',
    components: {
      comp_alpha: {
        id: 'comp_alpha',
        name: 'alpha',
        sourceFile: 'robots/alpha.urdf',
        robot: createComponentRobot('comp_alpha', 'meshes/shared_collision.dae'),
        visible: true,
      },
      comp_beta: {
        id: 'comp_beta',
        name: 'beta',
        sourceFile: 'robots/beta.urdf',
        robot: createComponentRobot('comp_beta', 'meshes/beta_collision.stl'),
        visible: true,
      },
      comp_hidden: {
        id: 'comp_hidden',
        name: 'hidden',
        sourceFile: 'robots/hidden.urdf',
        robot: createComponentRobot('comp_hidden', 'meshes/hidden_collision.obj'),
        visible: false,
      },
    },
    bridges: {},
  };

  const componentMeshLoadKeys = {
    comp_alpha: ['comp_alpha_base_link|collision|primary|0|meshes/shared_collision.dae'],
    comp_beta: ['comp_beta_base_link|collision|primary|0|meshes/beta_collision.stl'],
    comp_hidden: ['comp_hidden_base_link|collision|primary|0|meshes/hidden_collision.obj'],
  };

  const revealState = resolveAssemblyCollisionRevealState({
    assemblyState,
    componentMeshLoadKeys,
    resolvedMeshLoadKeys: new Set<string>([
      'comp_alpha_base_link|collision|primary|0|meshes/shared_collision.dae',
      'comp_hidden_base_link|collision|primary|0|meshes/hidden_collision.obj',
    ]),
  });

  assert.deepEqual([...revealState.readyComponentIds], ['comp_alpha']);
  assert.deepEqual(
    [...revealState.readyMeshLoadKeys],
    ['comp_alpha_base_link|collision|primary|0|meshes/shared_collision.dae'],
  );
  assert.equal(revealState.totalTrackedComponentCount, 2);
});
