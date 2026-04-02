import * as THREE from 'three';

import { isAssemblyComponentIndividuallyTransformable } from '@/core/robot/assemblyTransforms';
import type { AssemblyState, RobotData, UrdfOrigin } from '@/types';

export type AssemblyComponentTransformTarget =
  | {
      kind: 'component';
      componentId: string;
      object: THREE.Group | null;
    }
  | {
      kind: 'bridge';
      bridgeId: string;
      object: THREE.Group | null;
    }
  | null;

interface ResolveAssemblyComponentTransformTargetOptions {
  robot: Pick<RobotData, 'joints'>;
  assemblyState: AssemblyState | null | undefined;
  componentId: string | null;
  jointPivots: Record<string, THREE.Group | null>;
}

export function resolveAssemblyComponentTransformTarget({
  robot,
  assemblyState,
  componentId,
  jointPivots,
}: ResolveAssemblyComponentTransformTargetOptions): AssemblyComponentTransformTarget {
  if (!assemblyState || !componentId) {
    return null;
  }

  const component = assemblyState.components[componentId];
  if (!component) {
    return null;
  }

  if (!isAssemblyComponentIndividuallyTransformable(assemblyState, componentId)) {
    const incomingRootBridges = Object.values(assemblyState.bridges).filter((bridge) => (
      bridge.childComponentId === componentId
      && bridge.childLinkId === component.robot.rootLinkId
    ));

    if (incomingRootBridges.length !== 1) {
      return null;
    }

    const bridge = incomingRootBridges[0]!;
    return {
      kind: 'bridge',
      bridgeId: bridge.id,
      object: jointPivots[bridge.id] ?? null,
    };
  }

  const rootJoint = Object.values(robot.joints).find((joint) => (
    joint.childLinkId === component.robot.rootLinkId
  ));
  if (!rootJoint) {
    return null;
  }

  return {
    kind: 'component',
    componentId,
    object: jointPivots[rootJoint.id] ?? null,
  };
}

export function decomposeJointPivotMatrixToOrigin(matrix: THREE.Matrix4): UrdfOrigin {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'ZYX');

  matrix.decompose(position, quaternion, scale);
  euler.setFromQuaternion(quaternion, 'ZYX');

  return {
    xyz: {
      x: position.x,
      y: position.y,
      z: position.z,
    },
    rpy: {
      r: euler.x,
      p: euler.y,
      y: euler.z,
    },
    quatXyzw: {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w,
    },
  };
}
