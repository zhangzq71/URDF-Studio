import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { DEFAULT_LINK, JointType, type AssemblyState, type RobotState } from '@/types';
import {
  createInitialAssemblyAutoGroundTrackingState,
  resolveAssemblyAutoGrounding,
  resolveReadyAssemblyAutoGroundComponentIds,
  resolveNextAssemblyAutoGroundTrackingState,
} from './assemblyAutoGrounding.ts';

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
      grounded_root: {
        ...DEFAULT_LINK,
        id: 'grounded_root',
        name: 'grounded_root',
      },
      floating_root: {
        ...DEFAULT_LINK,
        id: 'floating_root',
        name: 'floating_root',
      },
      bridged_root: {
        ...DEFAULT_LINK,
        id: 'bridged_root',
        name: 'bridged_root',
      },
      parent_root: {
        ...DEFAULT_LINK,
        id: 'parent_root',
        name: 'parent_root',
      },
    },
    joints: {
      '__workspace_world__::component::comp_grounded': {
        id: '__workspace_world__::component::comp_grounded',
        name: '__workspace_world__::component::comp_grounded',
        type: JointType.FIXED,
        parentLinkId: '__workspace_world__',
        childLinkId: 'grounded_root',
        origin: { xyz: { x: 0, y: 0, z: 0.2 }, rpy: { r: 0, p: 0, y: 0 } },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
      '__workspace_world__::component::comp_floating': {
        id: '__workspace_world__::component::comp_floating',
        name: '__workspace_world__::component::comp_floating',
        type: JointType.FIXED,
        parentLinkId: '__workspace_world__',
        childLinkId: 'floating_root',
        origin: { xyz: { x: 0.4, y: 0, z: 0.35 }, rpy: { r: 0, p: 0, y: 0 } },
        dynamics: { damping: 0, friction: 0 },
        hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
      },
      bridge_root: {
        id: 'bridge_root',
        name: 'bridge_root',
        type: JointType.FIXED,
        parentLinkId: 'parent_root',
        childLinkId: 'bridged_root',
        origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
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
      comp_grounded: {
        id: 'comp_grounded',
        name: 'grounded',
        sourceFile: 'robots/grounded.urdf',
        robot: {
          name: 'grounded',
          rootLinkId: 'grounded_root',
          links: {
            grounded_root: {
              ...DEFAULT_LINK,
              id: 'grounded_root',
              name: 'grounded_root',
            },
          },
          joints: {},
        },
        transform: {
          position: { x: 0, y: 0, z: 0.2 },
          rotation: { r: 0, p: 0, y: 0 },
        },
        visible: true,
      },
      comp_floating: {
        id: 'comp_floating',
        name: 'floating',
        sourceFile: 'robots/floating.urdf',
        robot: {
          name: 'floating',
          rootLinkId: 'floating_root',
          links: {
            floating_root: {
              ...DEFAULT_LINK,
              id: 'floating_root',
              name: 'floating_root',
            },
          },
          joints: {},
        },
        transform: {
          position: { x: 0.4, y: 0, z: 0.35 },
          rotation: { r: 0, p: 0, y: 0 },
        },
        visible: true,
      },
      comp_bridged: {
        id: 'comp_bridged',
        name: 'bridged',
        sourceFile: 'robots/bridged.urdf',
        robot: {
          name: 'bridged',
          rootLinkId: 'bridged_root',
          links: {
            bridged_root: {
              ...DEFAULT_LINK,
              id: 'bridged_root',
              name: 'bridged_root',
            },
          },
          joints: {},
        },
        transform: {
          position: { x: 1.1, y: 0, z: 0.15 },
          rotation: { r: 0, p: 0, y: 0 },
        },
        visible: true,
      },
      comp_hidden: {
        id: 'comp_hidden',
        name: 'hidden',
        sourceFile: 'robots/hidden.urdf',
        robot: {
          name: 'hidden',
          rootLinkId: 'hidden_root',
          links: {
            hidden_root: {
              ...DEFAULT_LINK,
              id: 'hidden_root',
              name: 'hidden_root',
            },
          },
          joints: {},
        },
        transform: {
          position: { x: 1.6, y: 0, z: 0.15 },
          rotation: { r: 0, p: 0, y: 0 },
        },
        visible: false,
      },
      comp_missing: {
        id: 'comp_missing',
        name: 'missing',
        sourceFile: 'robots/missing.urdf',
        robot: {
          name: 'missing',
          rootLinkId: 'missing_root',
          links: {
            missing_root: {
              ...DEFAULT_LINK,
              id: 'missing_root',
              name: 'missing_root',
            },
          },
          joints: {},
        },
        transform: {
          position: { x: 2.2, y: 0, z: 0.15 },
          rotation: { r: 0, p: 0, y: 0 },
        },
        visible: true,
      },
    },
    bridges: {
      bridge_root: {
        id: 'bridge_root',
        name: 'bridge_root',
        parentComponentId: 'comp_grounded',
        parentLinkId: 'parent_root',
        childComponentId: 'comp_bridged',
        childLinkId: 'bridged_root',
        joint: {
          id: 'bridge_root',
          name: 'bridge_root',
          type: JointType.FIXED,
          parentLinkId: 'parent_root',
          childLinkId: 'bridged_root',
          origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
          dynamics: { damping: 0, friction: 0 },
          hardware: { armature: 0, motorType: 'None', motorId: '', motorDirection: 1 },
        },
      },
    },
  };
}

function createPivot(lowestZ: number, x = 0): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, 0);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshBasicMaterial(),
  );
  mesh.userData.isVisualMesh = true;
  mesh.position.z = lowestZ + 0.1;
  pivot.add(mesh);
  pivot.updateMatrixWorld(true);
  return pivot;
}

test('resolveAssemblyAutoGrounding returns one-shot z corrections for individually transformable components only', () => {
  const result = resolveAssemblyAutoGrounding({
    robot: createRobotState(),
    assemblyState: createAssemblyState(),
    jointPivots: {
      '__workspace_world__::component::comp_grounded': createPivot(0),
      '__workspace_world__::component::comp_floating': createPivot(0.3, 0.4),
      bridge_root: createPivot(0.05, 1.1),
    },
    groundPlaneOffset: 0,
  });

  assert.deepEqual(result.measuredComponentIds, ['comp_floating']);
  assert.equal(result.adjustments.length, 1);
  assert.equal(result.adjustments[0]?.componentId, 'comp_floating');
  assert.ok(result.adjustments[0]);
  assert.ok(Math.abs(result.adjustments[0]!.transform.position.z - 0.05) < 1e-6);
});

test('resolveAssemblyAutoGrounding honors component filters and non-zero ground offsets', () => {
  const result = resolveAssemblyAutoGrounding({
    robot: createRobotState(),
    assemblyState: createAssemblyState(),
    jointPivots: {
      '__workspace_world__::component::comp_grounded': createPivot(0),
      '__workspace_world__::component::comp_floating': createPivot(0.3, 0.4),
    },
    groundPlaneOffset: 0.12,
    componentIds: ['comp_floating'],
  });

  assert.deepEqual(result.measuredComponentIds, ['comp_floating']);
  assert.equal(result.adjustments.length, 1);
  assert.ok(Math.abs(result.adjustments[0]!.transform.position.z - 0.17) < 1e-6);
});

test('resolveNextAssemblyAutoGroundTrackingState only marks newly added components as pending', () => {
  const initialAssemblyState = createAssemblyState();
  const initializedState = resolveNextAssemblyAutoGroundTrackingState({
    previousState: createInitialAssemblyAutoGroundTrackingState(),
    assemblyState: initialAssemblyState,
  });

  assert.equal(initializedState.initialized, true);
  assert.deepEqual([...initializedState.knownComponentIds].sort(), [
    'comp_bridged',
    'comp_floating',
    'comp_grounded',
    'comp_hidden',
    'comp_missing',
  ]);
  assert.deepEqual([...initializedState.pendingComponentIds], []);

  const nextAssemblyState: AssemblyState = {
    ...initialAssemblyState,
    components: {
      ...initialAssemblyState.components,
      comp_new: {
        id: 'comp_new',
        name: 'new',
        sourceFile: 'robots/new.urdf',
        robot: {
          name: 'new',
          rootLinkId: 'new_root',
          links: {
            new_root: {
              ...DEFAULT_LINK,
              id: 'new_root',
              name: 'new_root',
            },
          },
          joints: {},
        },
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { r: 0, p: 0, y: 0 },
        },
        visible: true,
      },
    },
  };

  const nextState = resolveNextAssemblyAutoGroundTrackingState({
    previousState: initializedState,
    assemblyState: nextAssemblyState,
  });

  assert.deepEqual([...nextState.pendingComponentIds], ['comp_new']);
});

test('resolveReadyAssemblyAutoGroundComponentIds waits for only the pending component mesh keys', () => {
  const assemblyState = createAssemblyState();

  const readyComponentIds = resolveReadyAssemblyAutoGroundComponentIds({
    assemblyState,
    pendingComponentIds: ['comp_floating', 'comp_grounded'],
    expectedMeshLoadKeys: [
      'floating_root|visual|primary|0|meshes/floating.dae',
      'grounded_root|visual|primary|0|meshes/grounded.dae',
      'parent_root|visual|primary|0|meshes/parent.dae',
    ],
    resolvedMeshLoadKeys: new Set([
      'floating_root|visual|primary|0|meshes/floating.dae',
    ]),
  });

  assert.deepEqual(readyComponentIds, ['comp_floating']);
});
