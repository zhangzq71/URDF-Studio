import * as THREE from 'three';
import { URDFJoint as RuntimeURDFJoint } from '@/core/parsers/urdf/loader';
import type { JointPatchCandidate } from './robotLoaderDiff';
import { applyOriginToJoint } from './robotLoaderPatchUtils';

function getCurrentJointValues(joint: RuntimeURDFJoint): number[] {
  const jointValue = (
    joint as RuntimeURDFJoint & {
      jointValue?: unknown;
      angle?: number;
    }
  ).jointValue;

  if (Array.isArray(jointValue)) {
    return jointValue.filter((value): value is number => typeof value === 'number');
  }

  if (typeof jointValue === 'number') {
    return [jointValue];
  }

  if (typeof (joint as RuntimeURDFJoint & { angle?: number }).angle === 'number') {
    return [(joint as RuntimeURDFJoint & { angle?: number }).angle as number];
  }

  return [];
}

function applyJointPatch(joint: RuntimeURDFJoint, patch: JointPatchCandidate): void {
  const currentValues = getCurrentJointValues(joint);
  const jointWithMutableState = joint as RuntimeURDFJoint & {
    axis?: THREE.Vector3;
    angle?: number;
    ignoreLimits?: boolean;
    limit?: {
      lower: number;
      upper: number;
      effort?: number;
      velocity?: number;
    };
  };
  const jointAxis = jointWithMutableState.axis ?? new THREE.Vector3(1, 0, 0);
  jointWithMutableState.axis = jointAxis;
  const jointLimit =
    jointWithMutableState.limit ?? (jointWithMutableState.limit = { lower: 0, upper: 0 });

  joint.jointType = patch.jointData.type as RuntimeURDFJoint['jointType'];
  applyOriginToJoint(joint, patch.jointData.origin);
  joint.origPosition = joint.position.clone();
  joint.origQuaternion = joint.quaternion.clone();

  if (joint.jointType !== 'fixed') {
    joint.jointValue = null;
  }

  const axis = patch.jointData.axis;
  const axisLengthSq = axis ? axis.x * axis.x + axis.y * axis.y + axis.z * axis.z : 0;
  if (axisLengthSq > 0) {
    jointAxis.set(axis.x, axis.y, axis.z).normalize();
  } else if (joint.jointType === 'planar') {
    jointAxis.set(0, 0, 1);
  } else {
    jointAxis.set(1, 0, 0);
  }

  const nextLimit = patch.jointData.limit;
  if (nextLimit) {
    jointLimit.lower = nextLimit.lower;
    jointLimit.upper = nextLimit.upper;
    jointLimit.effort = nextLimit.effort;
    jointLimit.velocity = nextLimit.velocity;
    jointWithMutableState.ignoreLimits = false;
  } else {
    jointLimit.lower = 0;
    jointLimit.upper = 0;
    delete jointLimit.effort;
    delete jointLimit.velocity;
    jointWithMutableState.ignoreLimits =
      joint.jointType === 'revolute' || joint.jointType === 'prismatic';
  }

  switch (joint.jointType) {
    case 'fixed':
      joint.position.copy(joint.origPosition);
      joint.quaternion.copy(joint.origQuaternion);
      joint.jointValue = [];
      joint.matrixWorldNeedsUpdate = true;
      break;
    case 'continuous':
    case 'revolute':
    case 'prismatic':
      joint.setJointValue(currentValues[0] ?? 0);
      break;
    case 'planar':
      joint.setJointValue(currentValues[0] ?? 0, currentValues[1] ?? 0, currentValues[2] ?? 0);
      break;
    case 'floating':
      joint.setJointValue(
        currentValues[0] ?? 0,
        currentValues[1] ?? 0,
        currentValues[2] ?? 0,
        currentValues[3] ?? 0,
        currentValues[4] ?? 0,
        currentValues[5] ?? 0,
      );
      break;
    default:
      break;
  }
}

export function patchJointsInPlace(
  robotModel: THREE.Object3D,
  patches: JointPatchCandidate[],
  invalidate: () => void,
): boolean {
  if (patches.length === 0) {
    return false;
  }

  const joints = (robotModel as any).joints as Record<string, RuntimeURDFJoint> | undefined;
  if (!joints) {
    return false;
  }

  const runtimeJoints = patches.map((patch) => joints[patch.jointName]);
  if (runtimeJoints.some((joint) => !joint)) {
    return false;
  }

  patches.forEach((patch, index) => {
    applyJointPatch(runtimeJoints[index]!, patch);
  });

  robotModel.updateMatrixWorld(true);
  invalidate();
  return true;
}

export function patchJointInPlace(
  robotModel: THREE.Object3D,
  patch: JointPatchCandidate,
  invalidate: () => void,
): boolean {
  return patchJointsInPlace(robotModel, [patch], invalidate);
}
