import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DEFAULT_LINK, JointType, type AssemblyState, type RobotState } from '@/types';

import {
  decomposeJointPivotMatrixToOrigin,
  resolveAssemblyComponentTransformTarget,
} from './assemblyTransformControlsShared.ts';

function createRobotState(): RobotState {
  return {
    name: 'workspace',
    rootLinkId: '__workspace_world__',
    selection: { type: null, id: null },
    links: {
      __workspace_world__: {
        ...DEFAULT_LINK,
        id: '__workspace_world__',
        name: '__workspace_world__',
      },
      parent_root: {
        ...DEFAULT_LINK,
        id: 'parent_root',
        name: 'parent_root',
      },
      child_root: {
        ...DEFAULT_LINK,
        id: 'child_root',
        name: 'child_root',
      },
      isolated_root: {
        ...DEFAULT_LINK,
        id: 'isolated_root',
        name: 'isolated_root',
      },
    },
    joints: {
      bridge_child: {
        id: 'bridge_child',
        name: 'bridge_child',
        type: JointType.FIXED,
        parentLinkId: 'parent_root',
        childLinkId: 'child_root',
        origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
      '__workspace_world__::component::comp_isolated': {
        id: '__workspace_world__::component::comp_isolated',
        name: '__workspace_world__::component::comp_isolated',
        type: JointType.FIXED,
        parentLinkId: '__workspace_world__',
        childLinkId: 'isolated_root',
        origin: { xyz: { x: 0.5, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
    },
  };
}

function createAssemblyState(): AssemblyState {
  return {
    name: 'workspace',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { r: 0, p: 0, y: 0 },
    },
    components: {
      comp_parent: {
        id: 'comp_parent',
        name: 'parent',
        sourceFile: 'robots/parent.urdf',
        robot: {
          name: 'parent',
          rootLinkId: 'parent_root',
          links: {
            parent_root: {
              ...DEFAULT_LINK,
              id: 'parent_root',
              name: 'parent_root',
            },
          },
          joints: {},
        },
      },
      comp_child: {
        id: 'comp_child',
        name: 'child',
        sourceFile: 'robots/child.urdf',
        robot: {
          name: 'child',
          rootLinkId: 'child_root',
          links: {
            child_root: {
              ...DEFAULT_LINK,
              id: 'child_root',
              name: 'child_root',
            },
          },
          joints: {},
        },
      },
      comp_isolated: {
        id: 'comp_isolated',
        name: 'isolated',
        sourceFile: 'robots/isolated.urdf',
        robot: {
          name: 'isolated',
          rootLinkId: 'isolated_root',
          links: {
            isolated_root: {
              ...DEFAULT_LINK,
              id: 'isolated_root',
              name: 'isolated_root',
            },
          },
          joints: {},
        },
        transform: {
          position: { x: 0.5, y: 0, z: 0 },
          rotation: { r: 0, p: 0, y: 0 },
        },
      },
    },
    bridges: {
      bridge_child: {
        id: 'bridge_child',
        name: 'bridge_child',
        parentComponentId: 'comp_parent',
        parentLinkId: 'parent_root',
        childComponentId: 'comp_child',
        childLinkId: 'child_root',
        joint: {
          id: 'bridge_child',
          name: 'bridge_child',
          type: JointType.FIXED,
          parentLinkId: 'parent_root',
          childLinkId: 'child_root',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          dynamics: { damping: 0, friction: 0 },
          hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
        },
      },
    },
  };
}

test('resolveAssemblyComponentTransformTarget uses the incoming bridge joint for bridged child roots', () => {
  const bridgePivot = new THREE.Group();
  const isolatedPivot = new THREE.Group();
  const target = resolveAssemblyComponentTransformTarget({
    robot: createRobotState(),
    assemblyState: createAssemblyState(),
    componentId: 'comp_child',
    jointPivots: {
      bridge_child: bridgePivot,
      '__workspace_world__::component::comp_isolated': isolatedPivot,
    },
  });

  assert.deepEqual(target, {
    kind: 'bridge',
    bridgeId: 'bridge_child',
    object: bridgePivot,
  });
});

test('resolveAssemblyComponentTransformTarget keeps isolated components on their synthetic root pivot', () => {
  const isolatedPivot = new THREE.Group();
  const target = resolveAssemblyComponentTransformTarget({
    robot: createRobotState(),
    assemblyState: createAssemblyState(),
    componentId: 'comp_isolated',
    jointPivots: {
      '__workspace_world__::component::comp_isolated': isolatedPivot,
    },
  });

  assert.deepEqual(target, {
    kind: 'component',
    componentId: 'comp_isolated',
    object: isolatedPivot,
  });
});

test('decomposeJointPivotMatrixToOrigin preserves xyz and zyx rotation ordering', () => {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(0.2, -0.4, 0.8),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.25, 0.6, 'ZYX')),
    new THREE.Vector3(1, 1, 1),
  );

  const origin = decomposeJointPivotMatrixToOrigin(matrix);

  assert.ok(Math.abs(origin.xyz.x - 0.2) < 1e-9);
  assert.ok(Math.abs(origin.xyz.y + 0.4) < 1e-9);
  assert.ok(Math.abs(origin.xyz.z - 0.8) < 1e-9);
  assert.ok(Math.abs(origin.rpy.r - 0.3) < 1e-9);
  assert.ok(Math.abs(origin.rpy.p + 0.25) < 1e-9);
  assert.ok(Math.abs(origin.rpy.y - 0.6) < 1e-9);
  assert.ok(origin.quatXyzw);
});
