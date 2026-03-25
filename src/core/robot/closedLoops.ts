import * as THREE from 'three';

import type { JointQuaternion, RobotClosedLoopConstraint, RobotData, UrdfJoint } from '@/types';

import {
  computeLinkWorldMatrices,
  createOriginMatrix,
  getJointEffectiveAngle,
  getJointEffectiveQuaternion,
  getChildJointsByParentLink,
  getParentJointByChildLink,
  type JointAngleOverrideMap,
  type JointKinematicOverrideMap,
  type JointOriginOverrideMap,
  type JointQuaternionOverrideMap,
} from './kinematics';

const TEMP_POSITION = new THREE.Vector3();
const TEMP_ROTATION = new THREE.Quaternion();
const TEMP_SCALE = new THREE.Vector3();
const TEMP_ANCHOR_A = new THREE.Vector3();
const TEMP_ANCHOR_B = new THREE.Vector3();
const TEMP_DELTA = new THREE.Vector3();
const TEMP_DEPENDENT_POSITION = new THREE.Vector3();
const TEMP_NEXT_LOCAL_POSITION = new THREE.Vector3();
const TEMP_ERROR = new THREE.Vector3();
const TEMP_PERTURBED_ERROR = new THREE.Vector3();
const TEMP_BASE_POSITION = new THREE.Vector3();
const TEMP_BASE_ROTATION = new THREE.Quaternion();
const TEMP_BASE_SCALE = new THREE.Vector3();
const TEMP_TARGET_VECTOR = new THREE.Vector3();
const TEMP_TARGET_LOCAL_VECTOR = new THREE.Vector3();
const TEMP_ROTATION_FROM = new THREE.Vector3();
const TEMP_ROTATION_TO = new THREE.Vector3();
const TEMP_QUATERNION = new THREE.Quaternion();
const TEMP_BALL_DELTA = new THREE.Vector3();

const ANGLE_SOLVER_ITERATIONS = 24;
const ANGLE_SOLVER_PERTURBATION = 1e-4;
const ANGLE_SOLVER_TOLERANCE = 1e-5;
const ANGLE_SOLVER_DAMPING = 1e-6;
const CLOSED_LOOP_SOLVER_BALL_AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
] as const;

export interface ClosedLoopMotionCompensation {
  angles: JointAngleOverrideMap;
  quaternions: JointQuaternionOverrideMap;
}

export interface ClosedLoopMotionSolveOptions extends JointKinematicOverrideMap {
  lockedJointIds?: string[];
  maxIterations?: number;
  tolerance?: number;
  damping?: number;
}

export interface ClosedLoopMotionSolveResult extends ClosedLoopMotionCompensation {
  constraintErrors: Record<string, number>;
  residual: number;
  iterations: number;
  converged: boolean;
}

interface BallEndpointContext {
  endpoint: 'A' | 'B';
  joint: UrdfJoint;
  rootPosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
  anchorLocal: THREE.Vector3;
  radius: number;
}

interface ClosedLoopSolverVariable {
  joint: UrdfJoint;
  kind: 'angle' | 'ball';
  axis?: THREE.Vector3;
}

interface ClosedLoopErrorState {
  vector: number[];
  constraintErrors: Record<string, number>;
  residual: number;
}

function toVector3Value(vector: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function toEulerValue(quaternion: THREE.Quaternion): { r: number; p: number; y: number } {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'ZYX');
  return { r: euler.x, p: euler.y, y: euler.z };
}

function toQuaternionValue(quaternion: THREE.Quaternion): JointQuaternion {
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}

function collectDescendantLinks(
  childJointsByParent: Map<string, UrdfJoint[]>,
  rootLinkId: string,
): Set<string> {
  const visited = new Set<string>();
  const queue = [rootLinkId];

  while (queue.length > 0) {
    const linkId = queue.shift();
    if (!linkId || visited.has(linkId)) {
      continue;
    }

    visited.add(linkId);
    (childJointsByParent.get(linkId) ?? []).forEach((joint) => {
      queue.push(joint.childLinkId);
    });
  }

  return visited;
}

function computeConstraintAnchorWorld(
  linkMatrix: THREE.Matrix4 | undefined,
  anchorLocal: { x: number; y: number; z: number },
  target: THREE.Vector3,
): THREE.Vector3 {
  target.set(anchorLocal.x, anchorLocal.y, anchorLocal.z);
  if (linkMatrix) {
    target.applyMatrix4(linkMatrix);
  }
  return target;
}

function buildCompensatedOrigin(
  currentJoint: UrdfJoint,
  parentMatrix: THREE.Matrix4 | undefined,
  dependentMatrix: THREE.Matrix4 | undefined,
  deltaWorld: THREE.Vector3,
): UrdfJoint['origin'] {
  if (!dependentMatrix) {
    return currentJoint.origin;
  }

  dependentMatrix.decompose(TEMP_POSITION, TEMP_ROTATION, TEMP_SCALE);
  TEMP_DEPENDENT_POSITION.copy(TEMP_POSITION).add(deltaWorld);
  TEMP_NEXT_LOCAL_POSITION.copy(TEMP_DEPENDENT_POSITION);

  if (parentMatrix) {
    const parentInverse = parentMatrix.clone().invert();
    TEMP_NEXT_LOCAL_POSITION.applyMatrix4(parentInverse);
  }

  return {
    xyz: toVector3Value(TEMP_NEXT_LOCAL_POSITION),
    rpy: currentJoint.origin.rpy ?? toEulerValue(TEMP_ROTATION),
  };
}

function computeJointBaseTransform(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  joint: UrdfJoint,
  overrides: JointKinematicOverrideMap,
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const parentMatrices = computeLinkWorldMatrices(robot, overrides);
  const parentMatrix = parentMatrices[joint.parentLinkId] ?? new THREE.Matrix4().identity();
  const baseMatrix = parentMatrix
    .clone()
    .multiply(createOriginMatrix(overrides.origins?.[joint.id] ?? joint.origin));

  baseMatrix.decompose(TEMP_BASE_POSITION, TEMP_BASE_ROTATION, TEMP_BASE_SCALE);

  return {
    position: TEMP_BASE_POSITION.clone(),
    quaternion: TEMP_BASE_ROTATION.clone(),
  };
}

function getConstraintBallEndpointContext(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  parentJointByChild: Map<string, UrdfJoint>,
  constraint: RobotClosedLoopConstraint,
  endpoint: 'A' | 'B',
  overrides: JointKinematicOverrideMap,
): BallEndpointContext | null {
  const linkId = endpoint === 'A' ? constraint.linkAId : constraint.linkBId;
  const joint = parentJointByChild.get(linkId);
  if (!joint || joint.type !== 'ball') {
    return null;
  }

  const anchorLocalValue = endpoint === 'A' ? constraint.anchorLocalA : constraint.anchorLocalB;
  const anchorLocal = new THREE.Vector3(anchorLocalValue.x, anchorLocalValue.y, anchorLocalValue.z);
  const radius = anchorLocal.length();
  if (radius <= 1e-9) {
    return null;
  }

  const baseTransform = computeJointBaseTransform(robot, joint, overrides);
  return {
    endpoint,
    joint,
    rootPosition: baseTransform.position,
    baseQuaternion: baseTransform.quaternion,
    anchorLocal,
    radius,
  };
}

function collectJointPathToRoot(
  parentJointByChild: Map<string, UrdfJoint>,
  linkId: string,
): UrdfJoint[] {
  const joints: UrdfJoint[] = [];
  let currentLinkId: string | null = linkId;

  while (currentLinkId) {
    const joint = parentJointByChild.get(currentLinkId);
    if (!joint) {
      break;
    }

    joints.push(joint);
    currentLinkId = joint.parentLinkId;
  }

  return joints;
}

function findLowestCommonAncestorLink(
  parentJointByChild: Map<string, UrdfJoint>,
  linkAId: string,
  linkBId: string,
): string | null {
  const ancestorsOfA = new Set<string>([linkAId]);
  let currentLinkId: string | null = linkAId;

  while (currentLinkId) {
    const joint = parentJointByChild.get(currentLinkId);
    if (!joint) {
      break;
    }

    currentLinkId = joint.parentLinkId;
    if (currentLinkId) {
      ancestorsOfA.add(currentLinkId);
    }
  }

  currentLinkId = linkBId;
  while (currentLinkId) {
    if (ancestorsOfA.has(currentLinkId)) {
      return currentLinkId;
    }

    const joint = parentJointByChild.get(currentLinkId);
    if (!joint) {
      break;
    }

    currentLinkId = joint.parentLinkId;
  }

  return null;
}

function collectBranchJointsFromAncestor(
  parentJointByChild: Map<string, UrdfJoint>,
  ancestorLinkId: string,
  targetLinkId: string,
): UrdfJoint[] {
  const joints: UrdfJoint[] = [];
  let currentLinkId: string | null = targetLinkId;

  while (currentLinkId && currentLinkId !== ancestorLinkId) {
    const joint = parentJointByChild.get(currentLinkId);
    if (!joint) {
      return [];
    }

    joints.unshift(joint);
    currentLinkId = joint.parentLinkId;
  }

  return currentLinkId === ancestorLinkId ? joints : [];
}

function isSolvableJointType(joint: UrdfJoint): boolean {
  return joint.type === 'revolute' || joint.type === 'continuous' || joint.type === 'prismatic';
}

function isMotionSolvableJointType(joint: UrdfJoint): boolean {
  return isSolvableJointType(joint) || joint.type === 'ball';
}

function wrapAngleNearReference(angle: number, reference: number): number {
  const tau = Math.PI * 2;
  let wrapped = angle;

  while (wrapped - reference > Math.PI) {
    wrapped -= tau;
  }

  while (wrapped - reference < -Math.PI) {
    wrapped += tau;
  }

  return wrapped;
}

function clampSolvedAngle(joint: UrdfJoint, angle: number, referenceAngle: number): number {
  if (joint.type === 'continuous') {
    return wrapAngleNearReference(angle, referenceAngle);
  }

  const lower = joint.limit?.lower;
  const upper = joint.limit?.upper;
  if (Number.isFinite(lower) && Number.isFinite(upper)) {
    return Math.max(lower!, Math.min(upper!, angle));
  }

  return angle;
}

function computeConstraintError(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  parentJointByChild: Map<string, UrdfJoint>,
  constraint: RobotClosedLoopConstraint,
  overrides: JointKinematicOverrideMap,
  target: THREE.Vector3,
): THREE.Vector3 {
  const linkWorldMatrices = computeLinkWorldMatrices(robot, overrides);
  const linkAMatrix = linkWorldMatrices[constraint.linkAId];
  const linkBMatrix = linkWorldMatrices[constraint.linkBId];

  computeConstraintAnchorWorld(linkAMatrix, constraint.anchorLocalA, TEMP_ANCHOR_A);
  computeConstraintAnchorWorld(linkBMatrix, constraint.anchorLocalB, TEMP_ANCHOR_B);

  const ballEndpointA = getConstraintBallEndpointContext(robot, parentJointByChild, constraint, 'A', overrides);
  if (ballEndpointA) {
    TEMP_TARGET_VECTOR.copy(TEMP_ANCHOR_B).sub(ballEndpointA.rootPosition);
    const distance = TEMP_TARGET_VECTOR.length();
    if (distance <= 1e-9) {
      return target.set(ballEndpointA.radius, 0, 0);
    }

    return target.copy(TEMP_TARGET_VECTOR.normalize()).multiplyScalar(distance - ballEndpointA.radius);
  }

  const ballEndpointB = getConstraintBallEndpointContext(robot, parentJointByChild, constraint, 'B', overrides);
  if (ballEndpointB) {
    TEMP_TARGET_VECTOR.copy(TEMP_ANCHOR_A).sub(ballEndpointB.rootPosition);
    const distance = TEMP_TARGET_VECTOR.length();
    if (distance <= 1e-9) {
      return target.set(ballEndpointB.radius, 0, 0);
    }

    return target.copy(TEMP_TARGET_VECTOR.normalize()).multiplyScalar(distance - ballEndpointB.radius);
  }

  return target.copy(TEMP_ANCHOR_B).sub(TEMP_ANCHOR_A);
}

function getClosedLoopConnectConstraints(
  robot: Pick<RobotData, 'closedLoopConstraints'>,
): RobotClosedLoopConstraint[] {
  return (robot.closedLoopConstraints ?? []).filter((constraint) => constraint.type === 'connect');
}

function createLockedJointIdSet(options: ClosedLoopMotionSolveOptions): Set<string> {
  const lockedJointIds = new Set(options.lockedJointIds ?? []);
  Object.keys(options.angles ?? {}).forEach((jointId) => lockedJointIds.add(jointId));
  Object.keys(options.quaternions ?? {}).forEach((jointId) => lockedJointIds.add(jointId));
  return lockedJointIds;
}

function collectClosedLoopSolverJoints(
  robot: Pick<RobotData, 'joints'>,
  parentJointByChild: Map<string, UrdfJoint>,
  constraints: RobotClosedLoopConstraint[],
  lockedJointIds: Set<string>,
): UrdfJoint[] {
  const joints: UrdfJoint[] = [];
  const visitedJointIds = new Set<string>();

  constraints.forEach((constraint) => {
    const ancestorLinkId = findLowestCommonAncestorLink(
      parentJointByChild,
      constraint.linkAId,
      constraint.linkBId,
    );
    if (!ancestorLinkId) {
      return;
    }

    const branchJoints = [
      ...collectBranchJointsFromAncestor(parentJointByChild, ancestorLinkId, constraint.linkAId),
      ...collectBranchJointsFromAncestor(parentJointByChild, ancestorLinkId, constraint.linkBId),
    ];

    branchJoints.forEach((joint) => {
      if (
        visitedJointIds.has(joint.id)
        || lockedJointIds.has(joint.id)
        || !isSolvableJointType(joint)
        || !robot.joints[joint.id]
      ) {
        return;
      }

      visitedJointIds.add(joint.id);
      joints.push(joint);
    });
  });

  return joints;
}

function createClosedLoopSolverVariables(joints: UrdfJoint[]): ClosedLoopSolverVariable[] {
  const variables: ClosedLoopSolverVariable[] = [];

  joints.forEach((joint) => {
    if (joint.type === 'ball') {
      CLOSED_LOOP_SOLVER_BALL_AXES.forEach((axis) => {
        variables.push({ joint, kind: 'ball', axis });
      });
      return;
    }

    variables.push({ joint, kind: 'angle' });
  });

  return variables;
}

function setBallJointQuaternionOverride(
  jointId: string,
  baseQuaternion: THREE.Quaternion,
  axis: THREE.Vector3,
  deltaAngle: number,
  overrides: JointKinematicOverrideMap,
): void {
  const nextQuaternion = baseQuaternion.clone();
  if (Math.abs(deltaAngle) > 1e-12) {
    TEMP_QUATERNION.setFromAxisAngle(axis, deltaAngle);
    nextQuaternion.multiply(TEMP_QUATERNION).normalize();
  }

  (overrides.quaternions ??= {})[jointId] = toQuaternionValue(nextQuaternion);
}

function computeClosedLoopErrorState(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  parentJointByChild: Map<string, UrdfJoint>,
  constraints: RobotClosedLoopConstraint[],
  overrides: JointKinematicOverrideMap,
): ClosedLoopErrorState {
  const vector: number[] = [];
  const constraintErrors: Record<string, number> = {};
  let residualSquared = 0;

  constraints.forEach((constraint) => {
    computeConstraintError(robot, parentJointByChild, constraint, overrides, TEMP_ERROR);
    vector.push(TEMP_ERROR.x, TEMP_ERROR.y, TEMP_ERROR.z);
    const errorMagnitude = TEMP_ERROR.length();
    constraintErrors[constraint.id] = errorMagnitude;
    residualSquared += errorMagnitude * errorMagnitude;
  });

  return {
    vector,
    constraintErrors,
    residual: Math.sqrt(residualSquared),
  };
}

function stripLockedJointOverrides(
  overrides: JointKinematicOverrideMap,
  lockedJointIds: Set<string>,
): ClosedLoopMotionCompensation {
  const angles = { ...(overrides.angles ?? {}) };
  const quaternions = { ...(overrides.quaternions ?? {}) };

  lockedJointIds.forEach((jointId) => {
    delete angles[jointId];
    delete quaternions[jointId];
  });

  return { angles, quaternions };
}

function applyClosedLoopBallJointCompensation(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  parentJointByChild: Map<string, UrdfJoint>,
  constraints: RobotClosedLoopConstraint[],
  overrides: JointKinematicOverrideMap,
  lockedJointIds: Set<string>,
): void {
  constraints.forEach((constraint) => {
    const ballJointA = parentJointByChild.get(constraint.linkAId);
    if (ballJointA && ballJointA.type === 'ball' && !lockedJointIds.has(ballJointA.id)) {
      const quaternion = solveBallEndpointQuaternion(robot, parentJointByChild, constraint, 'A', overrides);
      if (quaternion) {
        overrides.quaternions ??= {};
        overrides.quaternions[ballJointA.id] = quaternion;
      }
    }

    const ballJointB = parentJointByChild.get(constraint.linkBId);
    if (ballJointB && ballJointB.type === 'ball' && !lockedJointIds.has(ballJointB.id)) {
      const quaternion = solveBallEndpointQuaternion(robot, parentJointByChild, constraint, 'B', overrides);
      if (quaternion) {
        overrides.quaternions ??= {};
        overrides.quaternions[ballJointB.id] = quaternion;
      }
    }
  });
}

function solveSingleDriverClosedLoopCompensation(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  constraints: RobotClosedLoopConstraint[],
  selectedJointId: string,
  selectedAngle: number,
): ClosedLoopMotionCompensation {
  const parentJointByChild = getParentJointByChildLink(robot);
  const overrides: JointKinematicOverrideMap = {
    angles: { [selectedJointId]: selectedAngle },
    quaternions: {},
  };

  for (let passIndex = 0; passIndex < 3; passIndex += 1) {
    constraints.forEach((constraint) => {
      const ancestorLinkId = findLowestCommonAncestorLink(
        parentJointByChild,
        constraint.linkAId,
        constraint.linkBId,
      );
      if (!ancestorLinkId) {
        return;
      }

      const branchAJoints = collectBranchJointsFromAncestor(
        parentJointByChild,
        ancestorLinkId,
        constraint.linkAId,
      );
      const branchBJoints = collectBranchJointsFromAncestor(
        parentJointByChild,
        ancestorLinkId,
        constraint.linkBId,
      );

      const candidateJoints = [...branchAJoints, ...branchBJoints].filter((joint, index, joints) => {
        if (joint.id === selectedJointId || !isSolvableJointType(joint)) {
          return false;
        }

        return joints.findIndex((entry) => entry.id === joint.id) === index;
      });

      solveConstraintAngles(robot, parentJointByChild, constraint, candidateJoints, overrides);
      applyClosedLoopBallJointCompensation(robot, parentJointByChild, [constraint], overrides, new Set([selectedJointId]));
    });
  }

  delete overrides.angles?.[selectedJointId];
  return filterNoOpMotionCompensation(robot, {
    angles: overrides.angles ?? {},
    quaternions: overrides.quaternions ?? {},
  });
}

function canMergeJointQuaternion(
  existing: JointQuaternion | undefined,
  next: JointQuaternion,
): boolean {
  if (!existing) {
    return true;
  }

  return (
    Math.abs(existing.x - next.x) <= 1e-6
    && Math.abs(existing.y - next.y) <= 1e-6
    && Math.abs(existing.z - next.z) <= 1e-6
    && Math.abs(existing.w - next.w) <= 1e-6
  );
}

function filterNoOpMotionCompensation(
  robot: Pick<RobotData, 'joints'>,
  compensation: ClosedLoopMotionCompensation,
): ClosedLoopMotionCompensation {
  const angles = { ...compensation.angles };
  const quaternions = { ...compensation.quaternions };

  Object.entries(angles).forEach(([jointId, angle]) => {
    const joint = robot.joints[jointId];
    if (!joint) {
      return;
    }

    const currentAngle = Number.isFinite(joint.angle) ? joint.angle! : 0;
    if (Math.abs(currentAngle - angle) <= 1e-9) {
      delete angles[jointId];
    }
  });

  Object.entries(quaternions).forEach(([jointId, quaternion]) => {
    const joint = robot.joints[jointId];
    const currentQuaternion = joint?.quaternion ?? { x: 0, y: 0, z: 0, w: 1 };
    if (
      Math.abs(currentQuaternion.x - quaternion.x) <= 1e-9
      && Math.abs(currentQuaternion.y - quaternion.y) <= 1e-9
      && Math.abs(currentQuaternion.z - quaternion.z) <= 1e-9
      && Math.abs(currentQuaternion.w - quaternion.w) <= 1e-9
    ) {
      delete quaternions[jointId];
    }
  });

  return { angles, quaternions };
}

function collectConstraintCandidateJoints(
  parentJointByChild: Map<string, UrdfJoint>,
  constraint: RobotClosedLoopConstraint,
  lockedJointIds: Set<string>,
): UrdfJoint[] {
  const ancestorLinkId = findLowestCommonAncestorLink(
    parentJointByChild,
    constraint.linkAId,
    constraint.linkBId,
  );
  if (!ancestorLinkId) {
    return [];
  }

  return [
    ...collectBranchJointsFromAncestor(parentJointByChild, ancestorLinkId, constraint.linkAId),
    ...collectBranchJointsFromAncestor(parentJointByChild, ancestorLinkId, constraint.linkBId),
  ].filter((joint, index, joints) => {
    if (lockedJointIds.has(joint.id) || !isSolvableJointType(joint)) {
      return false;
    }

    return joints.findIndex((entry) => entry.id === joint.id) === index;
  });
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = matrix.length;
  if (size === 0) {
    return [];
  }

  const augmented = matrix.map((row, rowIndex) => [...row, vector[rowIndex] ?? 0]);

  for (let pivotIndex = 0; pivotIndex < size; pivotIndex += 1) {
    let bestRow = pivotIndex;
    for (let rowIndex = pivotIndex + 1; rowIndex < size; rowIndex += 1) {
      if (Math.abs(augmented[rowIndex][pivotIndex]) > Math.abs(augmented[bestRow][pivotIndex])) {
        bestRow = rowIndex;
      }
    }

    if (Math.abs(augmented[bestRow][pivotIndex]) <= 1e-12) {
      return null;
    }

    if (bestRow !== pivotIndex) {
      [augmented[pivotIndex], augmented[bestRow]] = [augmented[bestRow], augmented[pivotIndex]];
    }

    const pivot = augmented[pivotIndex][pivotIndex];
    for (let columnIndex = pivotIndex; columnIndex <= size; columnIndex += 1) {
      augmented[pivotIndex][columnIndex] /= pivot;
    }

    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      if (rowIndex === pivotIndex) {
        continue;
      }

      const factor = augmented[rowIndex][pivotIndex];
      if (Math.abs(factor) <= 1e-12) {
        continue;
      }

      for (let columnIndex = pivotIndex; columnIndex <= size; columnIndex += 1) {
        augmented[rowIndex][columnIndex] -= factor * augmented[pivotIndex][columnIndex];
      }
    }
  }

  return augmented.map((row) => row[size] ?? 0);
}

function solveConstraintAngles(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  parentJointByChild: Map<string, UrdfJoint>,
  constraint: RobotClosedLoopConstraint,
  candidateJoints: UrdfJoint[],
  overrides: JointKinematicOverrideMap,
): void {
  if (candidateJoints.length === 0) {
    return;
  }

  for (let iteration = 0; iteration < ANGLE_SOLVER_ITERATIONS; iteration += 1) {
    computeConstraintError(robot, parentJointByChild, constraint, overrides, TEMP_ERROR);
    if (TEMP_ERROR.lengthSq() <= ANGLE_SOLVER_TOLERANCE * ANGLE_SOLVER_TOLERANCE) {
      return;
    }

    const jointCount = candidateJoints.length;
    const jacobian = [
      new Array<number>(jointCount).fill(0),
      new Array<number>(jointCount).fill(0),
      new Array<number>(jointCount).fill(0),
    ];

    candidateJoints.forEach((joint, jointIndex) => {
      const baseAngle = getJointEffectiveAngle(joint, overrides.angles ?? {});
      (overrides.angles ??= {})[joint.id] = baseAngle + ANGLE_SOLVER_PERTURBATION;
      computeConstraintError(robot, parentJointByChild, constraint, overrides, TEMP_PERTURBED_ERROR);
      (overrides.angles ??= {})[joint.id] = baseAngle;

      jacobian[0][jointIndex] = (TEMP_PERTURBED_ERROR.x - TEMP_ERROR.x) / ANGLE_SOLVER_PERTURBATION;
      jacobian[1][jointIndex] = (TEMP_PERTURBED_ERROR.y - TEMP_ERROR.y) / ANGLE_SOLVER_PERTURBATION;
      jacobian[2][jointIndex] = (TEMP_PERTURBED_ERROR.z - TEMP_ERROR.z) / ANGLE_SOLVER_PERTURBATION;
    });

    const normalMatrix = Array.from({ length: jointCount }, () => new Array<number>(jointCount).fill(0));
    const rhs = new Array<number>(jointCount).fill(0);

    for (let rowIndex = 0; rowIndex < jointCount; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < jointCount; columnIndex += 1) {
        normalMatrix[rowIndex][columnIndex] =
          jacobian[0][rowIndex] * jacobian[0][columnIndex]
          + jacobian[1][rowIndex] * jacobian[1][columnIndex]
          + jacobian[2][rowIndex] * jacobian[2][columnIndex];
      }

      normalMatrix[rowIndex][rowIndex] += ANGLE_SOLVER_DAMPING;
      rhs[rowIndex] =
        jacobian[0][rowIndex] * TEMP_ERROR.x
        + jacobian[1][rowIndex] * TEMP_ERROR.y
        + jacobian[2][rowIndex] * TEMP_ERROR.z;
    }

    const delta = solveLinearSystem(normalMatrix, rhs);
    if (!delta) {
      return;
    }

    let hasMeaningfulStep = false;

    candidateJoints.forEach((joint, jointIndex) => {
      const currentAngle = getJointEffectiveAngle(joint, overrides.angles ?? {});
      const nextAngle = clampSolvedAngle(joint, currentAngle - delta[jointIndex], currentAngle);
      if (Math.abs(nextAngle - currentAngle) > 1e-9) {
        hasMeaningfulStep = true;
      }
      (overrides.angles ??= {})[joint.id] = nextAngle;
    });

    if (!hasMeaningfulStep) {
      return;
    }
  }
}

function solveBallEndpointQuaternion(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>,
  parentJointByChild: Map<string, UrdfJoint>,
  constraint: RobotClosedLoopConstraint,
  endpoint: 'A' | 'B',
  overrides: JointKinematicOverrideMap,
): JointQuaternion | null {
  const context = getConstraintBallEndpointContext(robot, parentJointByChild, constraint, endpoint, overrides);
  if (!context) {
    return null;
  }

  const linkWorldMatrices = computeLinkWorldMatrices(robot, overrides);
  const targetAnchorMatrix = endpoint === 'A'
    ? linkWorldMatrices[constraint.linkBId]
    : linkWorldMatrices[constraint.linkAId];
  const targetAnchorLocal = endpoint === 'A' ? constraint.anchorLocalB : constraint.anchorLocalA;

  computeConstraintAnchorWorld(targetAnchorMatrix, targetAnchorLocal, TEMP_ANCHOR_B);
  TEMP_TARGET_VECTOR.copy(TEMP_ANCHOR_B).sub(context.rootPosition);
  if (TEMP_TARGET_VECTOR.lengthSq() <= 1e-12) {
    return null;
  }

  TEMP_TARGET_LOCAL_VECTOR
    .copy(TEMP_TARGET_VECTOR)
    .applyQuaternion(context.baseQuaternion.clone().invert());

  if (TEMP_TARGET_LOCAL_VECTOR.lengthSq() <= 1e-12) {
    return null;
  }

  TEMP_ROTATION_FROM.copy(context.anchorLocal).normalize();
  TEMP_ROTATION_TO.copy(TEMP_TARGET_LOCAL_VECTOR).normalize();
  TEMP_QUATERNION.setFromUnitVectors(TEMP_ROTATION_FROM, TEMP_ROTATION_TO).normalize();

  return toQuaternionValue(TEMP_QUATERNION);
}

export function resolveClosedLoopJointOriginCompensation(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'>,
  selectedJointId: string,
  selectedOrigin: UrdfJoint['origin'],
): JointOriginOverrideMap {
  if (!robot.closedLoopConstraints || robot.closedLoopConstraints.length === 0) {
    return {};
  }

  const selectedJoint = robot.joints[selectedJointId];
  if (!selectedJoint) {
    return {};
  }

  const childJointsByParent = getChildJointsByParentLink(robot);
  const parentJointByChild = getParentJointByChildLink(robot);
  const selectedSubtreeLinks = collectDescendantLinks(childJointsByParent, selectedJoint.childLinkId);
  const originOverrides: JointOriginOverrideMap = {
    [selectedJointId]: selectedOrigin,
  };

  robot.closedLoopConstraints.forEach((constraint) => {
    if (constraint.type !== 'connect') {
      return;
    }

    const linkAInSelectedSubtree = selectedSubtreeLinks.has(constraint.linkAId);
    const linkBInSelectedSubtree = selectedSubtreeLinks.has(constraint.linkBId);

    if (linkAInSelectedSubtree === linkBInSelectedSubtree) {
      return;
    }

    const stationaryLinkId = linkAInSelectedSubtree ? constraint.linkAId : constraint.linkBId;
    const dependentLinkId = linkAInSelectedSubtree ? constraint.linkBId : constraint.linkAId;
    const stationaryAnchorLocal = linkAInSelectedSubtree ? constraint.anchorLocalA : constraint.anchorLocalB;
    const dependentAnchorLocal = linkAInSelectedSubtree ? constraint.anchorLocalB : constraint.anchorLocalA;
    const dependentParentJoint = parentJointByChild.get(dependentLinkId);

    if (!dependentParentJoint) {
      return;
    }

    const linkWorldMatrices = computeLinkWorldMatrices(robot, { origins: originOverrides });
    const stationaryMatrix = linkWorldMatrices[stationaryLinkId];
    const dependentMatrix = linkWorldMatrices[dependentLinkId];

    computeConstraintAnchorWorld(stationaryMatrix, stationaryAnchorLocal, TEMP_ANCHOR_A);
    computeConstraintAnchorWorld(dependentMatrix, dependentAnchorLocal, TEMP_ANCHOR_B);

    TEMP_DELTA.copy(TEMP_ANCHOR_A).sub(TEMP_ANCHOR_B);
    if (TEMP_DELTA.lengthSq() <= 1e-12) {
      return;
    }

    originOverrides[dependentParentJoint.id] = buildCompensatedOrigin(
      dependentParentJoint,
      linkWorldMatrices[dependentParentJoint.parentLinkId],
      dependentMatrix,
      TEMP_DELTA,
    );
  });

  delete originOverrides[selectedJointId];
  return originOverrides;
}

export function solveClosedLoopMotionCompensation(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'>,
  options: ClosedLoopMotionSolveOptions = {},
): ClosedLoopMotionSolveResult {
  const constraints = getClosedLoopConnectConstraints(robot);
  const lockedJointIds = createLockedJointIdSet(options);
  const overrides: JointKinematicOverrideMap = {
    angles: { ...(options.angles ?? {}) },
    quaternions: { ...(options.quaternions ?? {}) },
  };
  const tolerance = options.tolerance ?? ANGLE_SOLVER_TOLERANCE;
  const maxIterations = options.maxIterations ?? ANGLE_SOLVER_ITERATIONS * 2;

  if (constraints.length === 0) {
    const compensation = stripLockedJointOverrides(overrides, lockedJointIds);
    return {
      ...compensation,
      constraintErrors: {},
      residual: 0,
      iterations: 0,
      converged: true,
    };
  }

  const lockedAngleEntries = Object.entries(options.angles ?? {});
  if (lockedAngleEntries.length > 0 && Object.keys(options.quaternions ?? {}).length === 0) {
    const mergedCompensation: ClosedLoopMotionCompensation = {
      angles: {},
      quaternions: {},
    };
    let canMergeIndependentSolutions = true;

    lockedAngleEntries.forEach(([jointId, angle]) => {
      if (!canMergeIndependentSolutions) {
        return;
      }

      const selectedJoint = robot.joints[jointId];
      if (!selectedJoint || !isSolvableJointType(selectedJoint)) {
        canMergeIndependentSolutions = false;
        return;
      }

      const singleDriverCompensation = solveSingleDriverClosedLoopCompensation(robot, constraints, jointId, angle);

      Object.entries(singleDriverCompensation.angles).forEach(([compensatedJointId, compensatedAngle]) => {
        if (!canMergeIndependentSolutions) {
          return;
        }

        const existingAngle = mergedCompensation.angles[compensatedJointId];
        if (
          existingAngle != null
          && Math.abs(existingAngle - compensatedAngle) > 1e-6
        ) {
          canMergeIndependentSolutions = false;
          return;
        }

        mergedCompensation.angles[compensatedJointId] = compensatedAngle;
      });

      Object.entries(singleDriverCompensation.quaternions).forEach(([compensatedJointId, compensatedQuaternion]) => {
        if (!canMergeIndependentSolutions) {
          return;
        }

        if (!canMergeJointQuaternion(mergedCompensation.quaternions[compensatedJointId], compensatedQuaternion)) {
          canMergeIndependentSolutions = false;
          return;
        }

        mergedCompensation.quaternions[compensatedJointId] = compensatedQuaternion;
      });
    });

    if (canMergeIndependentSolutions) {
      const filteredCompensation = filterNoOpMotionCompensation(robot, mergedCompensation);
      const evaluation = computeClosedLoopErrorState(
        robot,
        getParentJointByChildLink(robot),
        constraints,
        {
          angles: {
            ...(options.angles ?? {}),
            ...filteredCompensation.angles,
          },
          quaternions: filteredCompensation.quaternions,
        },
      );

      return {
        ...filteredCompensation,
        constraintErrors: evaluation.constraintErrors,
        residual: evaluation.residual,
        iterations: lockedAngleEntries.length,
        converged: evaluation.residual <= tolerance,
      };
    }
  }

  const parentJointByChild = getParentJointByChildLink(robot);
  let iterations = 0;
  applyClosedLoopBallJointCompensation(robot, parentJointByChild, constraints, overrides, lockedJointIds);
  let evaluation = computeClosedLoopErrorState(robot, parentJointByChild, constraints, overrides);

  while (iterations < maxIterations && evaluation.residual > tolerance) {
    let improvedThisPass = false;

    constraints.forEach((constraint) => {
      const candidateJoints = collectConstraintCandidateJoints(parentJointByChild, constraint, lockedJointIds);
      if (candidateJoints.length === 0) {
        return;
      }

      computeConstraintError(robot, parentJointByChild, constraint, overrides, TEMP_ERROR);
      const beforeError = TEMP_ERROR.lengthSq();

      solveConstraintAngles(robot, parentJointByChild, constraint, candidateJoints, overrides);
      applyClosedLoopBallJointCompensation(robot, parentJointByChild, [constraint], overrides, lockedJointIds);

      computeConstraintError(robot, parentJointByChild, constraint, overrides, TEMP_ERROR);
      const afterError = TEMP_ERROR.lengthSq();
      if (afterError + 1e-12 < beforeError) {
        improvedThisPass = true;
      }
    });

    applyClosedLoopBallJointCompensation(robot, parentJointByChild, constraints, overrides, lockedJointIds);
    const nextEvaluation = computeClosedLoopErrorState(robot, parentJointByChild, constraints, overrides);
    if (nextEvaluation.residual + 1e-12 < evaluation.residual) {
      improvedThisPass = true;
    }
    evaluation = nextEvaluation;
    iterations += 1;

    if (!improvedThisPass) {
      break;
    }
  }

  applyClosedLoopBallJointCompensation(robot, parentJointByChild, constraints, overrides, lockedJointIds);
  evaluation = computeClosedLoopErrorState(robot, parentJointByChild, constraints, overrides);
  const compensation = filterNoOpMotionCompensation(
    robot,
    stripLockedJointOverrides(overrides, lockedJointIds),
  );
  return {
    ...compensation,
    constraintErrors: evaluation.constraintErrors,
    residual: evaluation.residual,
    iterations,
    converged: evaluation.residual <= tolerance,
  };
}

export function resolveClosedLoopJointMotionCompensation(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'>,
  selectedJointId: string,
  selectedAngle: number,
): ClosedLoopMotionCompensation {
  if (!robot.closedLoopConstraints || robot.closedLoopConstraints.length === 0) {
    return { angles: {}, quaternions: {} };
  }

  const selectedJoint = robot.joints[selectedJointId];
  if (!selectedJoint || !isSolvableJointType(selectedJoint)) {
    return { angles: {}, quaternions: {} };
  }
  return solveSingleDriverClosedLoopCompensation(
    robot,
    getClosedLoopConnectConstraints(robot),
    selectedJointId,
    selectedAngle,
  );
}

export function resolveClosedLoopJointAngleCompensation(
  robot: Pick<RobotData, 'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'>,
  selectedJointId: string,
  selectedAngle: number,
): JointAngleOverrideMap {
  return resolveClosedLoopJointMotionCompensation(robot, selectedJointId, selectedAngle).angles;
}

export function createRobotClosedLoopConstraint(
  id: string,
  linkAId: string,
  linkBId: string,
  anchorLocalA: { x: number; y: number; z: number },
  anchorLocalB: { x: number; y: number; z: number },
  anchorWorld: { x: number; y: number; z: number },
  source?: RobotClosedLoopConstraint['source'],
): RobotClosedLoopConstraint {
  return {
    id,
    type: 'connect',
    linkAId,
    linkBId,
    anchorLocalA,
    anchorLocalB,
    anchorWorld,
    source,
  };
}
