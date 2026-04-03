import * as THREE from 'three';
import { URDFJoint as RuntimeURDFJoint } from '@/core/parsers/urdf/loader';
import type { JointPatchCandidate } from './robotLoaderDiff';
import { applyOriginToJoint } from './robotLoaderPatchUtils';

function applyJointPatch(
  joint: RuntimeURDFJoint,
  patch: JointPatchCandidate,
): void {
  const currentValues = Array.isArray(joint.jointValue) ? [...joint.jointValue] : [];

  joint.jointType = patch.jointData.type as RuntimeURDFJoint['jointType'];
  applyOriginToJoint(joint, patch.jointData.origin);
  joint.origPosition = joint.position.clone();
  joint.origQuaternion = joint.quaternion.clone();

  const axis = patch.jointData.axis;
  const axisLengthSq = axis
    ? axis.x * axis.x + axis.y * axis.y + axis.z * axis.z
    : 0;
  if (axisLengthSq > 0) {
    joint.axis.set(axis.x, axis.y, axis.z).normalize();
  } else if (joint.jointType === 'planar') {
    joint.axis.set(0, 0, 1);
  } else {
    joint.axis.set(1, 0, 0);
  }

  const nextLimit = patch.jointData.limit;
  if (nextLimit) {
    joint.limit.lower = nextLimit.lower;
    joint.limit.upper = nextLimit.upper;
    joint.limit.effort = nextLimit.effort;
    joint.limit.velocity = nextLimit.velocity;
    joint.ignoreLimits = false;
  } else {
    joint.limit.lower = 0;
    joint.limit.upper = 0;
    delete joint.limit.effort;
    delete joint.limit.velocity;
    joint.ignoreLimits = joint.jointType === 'revolute' || joint.jointType === 'prismatic';
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
      joint.setJointValue(
        currentValues[0] ?? 0,
        currentValues[1] ?? 0,
        currentValues[2] ?? 0,
      );
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
