import { solveClosedLoopMotionCompensation } from '@/core/robot';
import type { ClosedLoopMotionCompensation } from '@/core/robot/closedLoops';
import type { JointQuaternion, RobotState } from '@/types';

export interface ClosedLoopMotionPreviewState {
  angles: Record<string, number>;
  quaternions: Record<string, JointQuaternion>;
}

export interface ClosedLoopMotionPreviewSession {
  setBaseRobot: (
    robot: Pick<RobotState, 'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'> | null,
  ) => void;
  solve: (jointId: string, angle: number) => ClosedLoopMotionCompensation;
  reset: () => void;
}

function isSameAngle(left: number | undefined, right: number | undefined): boolean {
  if (typeof left !== 'number' || typeof right !== 'number') {
    return left === right;
  }

  return Math.abs(left - right) <= 1e-6;
}

function isSameQuaternion(
  left: JointQuaternion | undefined,
  right: JointQuaternion | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    isSameAngle(left.x, right.x) &&
    isSameAngle(left.y, right.y) &&
    isSameAngle(left.z, right.z) &&
    isSameAngle(left.w, right.w)
  );
}

export function buildClosedLoopMotionPreviewRobot(
  robot: Pick<RobotState, 'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'>,
  previewState: ClosedLoopMotionPreviewState,
): Pick<RobotState, 'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'> {
  const seededRobot = structuredClone(robot);

  Object.entries(previewState.angles).forEach(([jointId, angle]) => {
    if (seededRobot.joints[jointId]) {
      seededRobot.joints[jointId].angle = angle;
    }
  });

  Object.entries(previewState.quaternions).forEach(([jointId, quaternion]) => {
    if (seededRobot.joints[jointId]) {
      seededRobot.joints[jointId].quaternion = quaternion;
    }
  });

  return seededRobot;
}

export function resolveClosedLoopJointMotionPreview(
  robot: Pick<RobotState, 'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'>,
  jointId: string,
  angle: number,
  previewState: ClosedLoopMotionPreviewState,
): ClosedLoopMotionCompensation {
  const seededRobot = buildClosedLoopMotionPreviewRobot(robot, previewState);

  return solveClosedLoopMotionCompensation(seededRobot, {
    angles: { [jointId]: angle },
    lockedJointIds: [jointId],
    maxIterations: 4,
    tolerance: 1e-4,
  });
}

function collectClosedLoopMotionPreviewState(
  baseRobot: Pick<RobotState, 'joints'>,
  workingRobot: Pick<RobotState, 'joints'>,
): ClosedLoopMotionPreviewState {
  const angles: Record<string, number> = {};
  const quaternions: Record<string, JointQuaternion> = {};

  Object.entries(workingRobot.joints).forEach(([jointId, joint]) => {
    const baseJoint = baseRobot.joints[jointId];
    if (!baseJoint) {
      return;
    }

    if (typeof joint.angle === 'number' && !isSameAngle(joint.angle, baseJoint.angle)) {
      angles[jointId] = joint.angle;
    }

    if (joint.quaternion && !isSameQuaternion(joint.quaternion, baseJoint.quaternion)) {
      quaternions[jointId] = joint.quaternion;
    }
  });

  return { angles, quaternions };
}

export function createClosedLoopMotionPreviewSession(): ClosedLoopMotionPreviewSession {
  let baseRobot: Pick<
    RobotState,
    'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'
  > | null = null;
  let workingRobot: Pick<
    RobotState,
    'links' | 'joints' | 'rootLinkId' | 'closedLoopConstraints'
  > | null = null;

  const resetWorkingRobot = () => {
    workingRobot = baseRobot ? structuredClone(baseRobot) : null;
  };

  return {
    setBaseRobot(robot) {
      if (baseRobot === robot) {
        return;
      }

      baseRobot = robot;
      resetWorkingRobot();
    },

    solve(jointId, angle) {
      if (!baseRobot) {
        return { angles: {}, quaternions: {} };
      }

      if (!workingRobot) {
        resetWorkingRobot();
      }

      if (!workingRobot || !workingRobot.joints[jointId]) {
        return { angles: {}, quaternions: {} };
      }

      workingRobot.joints[jointId].angle = angle;

      const compensation = solveClosedLoopMotionCompensation(workingRobot, {
        angles: { [jointId]: angle },
        lockedJointIds: [jointId],
        maxIterations: 4,
        tolerance: 1e-4,
      });

      Object.entries(compensation.angles).forEach(([compensatedJointId, compensatedAngle]) => {
        if (workingRobot?.joints[compensatedJointId]) {
          workingRobot.joints[compensatedJointId].angle = compensatedAngle;
        }
      });

      Object.entries(compensation.quaternions).forEach(
        ([compensatedJointId, compensatedQuaternion]) => {
          if (workingRobot?.joints[compensatedJointId]) {
            workingRobot.joints[compensatedJointId].quaternion = compensatedQuaternion;
          }
        },
      );

      return collectClosedLoopMotionPreviewState(baseRobot, workingRobot);
    },

    reset() {
      resetWorkingRobot();
    },
  };
}
