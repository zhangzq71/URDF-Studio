import * as THREE from 'three';

import type { Euler, JointQuaternion, RobotData, UrdfJoint } from '@/types';

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

export type JointOriginOverrideMap = Record<string, UrdfJoint['origin']>;
export type JointAngleOverrideMap = Record<string, number>;
export type JointQuaternionOverrideMap = Record<string, JointQuaternion>;

export interface JointKinematicOverrideMap {
  origins?: JointOriginOverrideMap;
  angles?: JointAngleOverrideMap;
  quaternions?: JointQuaternionOverrideMap;
}

export function createOriginMatrix(origin?: { xyz?: { x?: number; y?: number; z?: number }; rpy?: Euler }): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(
    origin?.xyz?.x ?? 0,
    origin?.xyz?.y ?? 0,
    origin?.xyz?.z ?? 0,
  );
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      origin?.rpy?.r ?? 0,
      origin?.rpy?.p ?? 0,
      origin?.rpy?.y ?? 0,
      'ZYX',
    ),
  );

  matrix.compose(position, quaternion, UNIT_SCALE);
  return matrix;
}

function getNormalizedJointAxis(joint: UrdfJoint): THREE.Vector3 {
  const axisVector = new THREE.Vector3(
    joint.axis?.x ?? 0,
    joint.axis?.y ?? 0,
    joint.axis?.z ?? 1,
  );
  if (axisVector.lengthSq() <= 1e-12) {
    return new THREE.Vector3(0, 0, 1);
  }

  return axisVector.normalize();
}

export function getJointEffectiveAngle(
  joint: UrdfJoint,
  angleOverrides: JointAngleOverrideMap = {},
): number {
  const override = angleOverrides[joint.id];
  const referencePosition = Number.isFinite(joint.referencePosition)
    ? joint.referencePosition!
    : 0;

  if (Number.isFinite(override)) {
    return override - referencePosition;
  }

  return (Number.isFinite(joint.angle) ? joint.angle! : 0) - referencePosition;
}

function toThreeQuaternion(quaternion?: JointQuaternion): THREE.Quaternion {
  return new THREE.Quaternion(
    quaternion?.x ?? 0,
    quaternion?.y ?? 0,
    quaternion?.z ?? 0,
    quaternion?.w ?? 1,
  ).normalize();
}

export function getJointEffectiveQuaternion(
  joint: UrdfJoint,
  quaternionOverrides: JointQuaternionOverrideMap = {},
): THREE.Quaternion {
  const override = quaternionOverrides[joint.id];
  if (override) {
    return toThreeQuaternion(override);
  }

  if (joint.quaternion) {
    return toThreeQuaternion(joint.quaternion);
  }

  return new THREE.Quaternion();
}

export function getJointMotionPose(
  joint: UrdfJoint,
  overrides: JointKinematicOverrideMap = {},
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const angle = getJointEffectiveAngle(joint, overrides.angles ?? {});
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();

  if ((joint.type === 'revolute' || joint.type === 'continuous') && Math.abs(angle) > 1e-12) {
    quaternion.setFromAxisAngle(getNormalizedJointAxis(joint), angle);
    return { position, quaternion };
  }

  if (joint.type === 'ball') {
    quaternion.copy(getJointEffectiveQuaternion(joint, overrides.quaternions ?? {}));
    return { position, quaternion };
  }

  if (joint.type === 'prismatic' && Math.abs(angle) > 1e-12) {
    position.copy(getNormalizedJointAxis(joint)).multiplyScalar(angle);
  }

  return { position, quaternion };
}

export function createJointMotionMatrix(
  joint: UrdfJoint,
  overrides: JointKinematicOverrideMap = {},
): THREE.Matrix4 {
  const matrix = new THREE.Matrix4().identity();
  const angle = getJointEffectiveAngle(joint, overrides.angles ?? {});

  if (joint.type === 'revolute' || joint.type === 'continuous') {
    if (Math.abs(angle) > 1e-12) {
      matrix.makeRotationAxis(getNormalizedJointAxis(joint), angle);
    }
    return matrix;
  }

  if (joint.type === 'ball') {
    matrix.makeRotationFromQuaternion(getJointEffectiveQuaternion(joint, overrides.quaternions ?? {}));
    return matrix;
  }

  if (joint.type === 'prismatic') {
    if (Math.abs(angle) > 1e-12) {
      const axisVector = getNormalizedJointAxis(joint).multiplyScalar(angle);
      matrix.makeTranslation(axisVector.x, axisVector.y, axisVector.z);
    }
  }

  return matrix;
}

export function getParentJointByChildLink(robot: Pick<RobotData, 'joints'>): Map<string, UrdfJoint> {
  const parentJointByChild = new Map<string, UrdfJoint>();
  Object.values(robot.joints).forEach((joint) => {
    parentJointByChild.set(joint.childLinkId, joint);
  });
  return parentJointByChild;
}

export function getChildJointsByParentLink(robot: Pick<RobotData, 'joints'>): Map<string, UrdfJoint[]> {
  const childJointsByParent = new Map<string, UrdfJoint[]>();

  Object.values(robot.joints).forEach((joint) => {
    const siblings = childJointsByParent.get(joint.parentLinkId) ?? [];
    siblings.push(joint);
    childJointsByParent.set(joint.parentLinkId, siblings);
  });

  return childJointsByParent;
}

export function computeLinkWorldMatrices(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  overrides: JointKinematicOverrideMap = {},
): Record<string, THREE.Matrix4> {
  const linkMatrices: Record<string, THREE.Matrix4> = {};
  const childJointsByParent = getChildJointsByParentLink(robot);
  const childLinkIds = new Set<string>();
  const originOverrides = overrides.origins ?? {};

  Object.values(robot.joints).forEach((joint) => {
    childLinkIds.add(joint.childLinkId);
  });

  const visit = (linkId: string, parentMatrix: THREE.Matrix4) => {
    if (linkMatrices[linkId]) {
      return;
    }

    linkMatrices[linkId] = parentMatrix.clone();
    const childJoints = childJointsByParent.get(linkId) ?? [];

    childJoints.forEach((joint) => {
      const nextOrigin = originOverrides[joint.id] ?? joint.origin;
      const childMatrix = parentMatrix.clone()
        .multiply(createOriginMatrix(nextOrigin))
        .multiply(createJointMotionMatrix(joint, overrides));
      visit(joint.childLinkId, childMatrix);
    });
  };

  const rootCandidates = [
    robot.rootLinkId,
    ...Object.keys(robot.links).filter((linkId) => !childLinkIds.has(linkId)),
    ...Object.keys(robot.links),
  ].filter((linkId, index, values): linkId is string => Boolean(linkId) && values.indexOf(linkId) === index);

  rootCandidates.forEach((rootLinkId) => {
    visit(rootLinkId, new THREE.Matrix4().identity());
  });

  return linkMatrices;
}
