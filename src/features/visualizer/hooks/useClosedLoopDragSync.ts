import { useCallback, useRef } from 'react';
import * as THREE from 'three';

import {
  getJointMotionPose,
  resolveClosedLoopJointMotionCompensation,
  resolveClosedLoopJointOriginCompensation,
  resolveJointKey,
} from '@/core/robot';
import type { RobotState, UrdfJoint } from '@/types';

interface UseClosedLoopDragSyncParams {
  robot: RobotState;
  jointPivots: Record<string, THREE.Group | null>;
  jointMotions: Record<string, THREE.Group | null>;
}

const TEMP_EULER = new THREE.Euler(0, 0, 0, 'ZYX');

function applyJointOriginToPivot(pivot: THREE.Group, origin: UrdfJoint['origin']): void {
  pivot.position.set(
    origin.xyz.x ?? 0,
    origin.xyz.y ?? 0,
    origin.xyz.z ?? 0,
  );
  pivot.quaternion.setFromEuler(
    new THREE.Euler(
      origin.rpy.r ?? 0,
      origin.rpy.p ?? 0,
      origin.rpy.y ?? 0,
      'ZYX',
    ),
  );
  pivot.updateMatrixWorld(true);
}

function applyJointMotionToGroup(
  motionGroup: THREE.Group,
  joint: UrdfJoint,
  overrides: Parameters<typeof getJointMotionPose>[1] = {},
): void {
  const pose = getJointMotionPose(joint, overrides);
  motionGroup.position.copy(pose.position);
  motionGroup.quaternion.copy(pose.quaternion);
  motionGroup.updateMatrixWorld(true);
}

export function useClosedLoopDragSync({
  robot,
  jointPivots,
  jointMotions,
}: UseClosedLoopDragSyncParams) {
  const previewedJointIdsRef = useRef<string[]>([]);
  const previewedMotionJointIdsRef = useRef<string[]>([]);

  const resetConstraintPreview = useCallback(() => {
    previewedJointIdsRef.current.forEach((jointId) => {
      const joint = robot.joints[jointId];
      const pivot = jointPivots[jointId];
      if (!joint || !pivot) {
        return;
      }

      applyJointOriginToPivot(pivot, joint.origin);
    });

    previewedMotionJointIdsRef.current.forEach((jointId) => {
      const joint = robot.joints[jointId];
      const motionGroup = jointMotions[jointId];
      if (!joint || !motionGroup) {
        return;
      }

      applyJointMotionToGroup(motionGroup, joint);
    });

    previewedJointIdsRef.current = [];
    previewedMotionJointIdsRef.current = [];
  }, [jointMotions, jointPivots, robot.joints]);

  const previewConstraintCompensation = useCallback((selectedObject: THREE.Group, selectionId: string | null | undefined) => {
    resetConstraintPreview();

    const selectedJointId = resolveJointKey(robot.joints, selectionId);
    if (!selectedJointId) {
      return;
    }

    TEMP_EULER.setFromQuaternion(selectedObject.quaternion, 'ZYX');
    const selectedOrigin: UrdfJoint['origin'] = {
      xyz: {
        x: selectedObject.position.x,
        y: selectedObject.position.y,
        z: selectedObject.position.z,
      },
      rpy: {
        r: TEMP_EULER.x,
        p: TEMP_EULER.y,
        y: TEMP_EULER.z,
      },
    };

    const compensation = resolveClosedLoopJointOriginCompensation(robot, selectedJointId, selectedOrigin);

    Object.entries(compensation).forEach(([jointId, origin]) => {
      const pivot = jointPivots[jointId];
      if (!pivot) {
        return;
      }

      applyJointOriginToPivot(pivot, origin);
      previewedJointIdsRef.current.push(jointId);
    });
  }, [jointPivots, resetConstraintPreview, robot]);

  const previewConstraintMotionCompensation = useCallback((selectionId: string | null | undefined, selectedAngle: number) => {
    resetConstraintPreview();

    const selectedJointId = resolveJointKey(robot.joints, selectionId);
    if (!selectedJointId) {
      return;
    }

    const compensation = resolveClosedLoopJointMotionCompensation(robot, selectedJointId, selectedAngle);

    Object.entries(compensation.angles).forEach(([jointId, angle]) => {
      const joint = robot.joints[jointId];
      const motionGroup = jointMotions[jointId];
      if (!joint || !motionGroup) {
        return;
      }

      applyJointMotionToGroup(motionGroup, joint, {
        angles: { [jointId]: angle },
      });

      if (!previewedMotionJointIdsRef.current.includes(jointId)) {
        previewedMotionJointIdsRef.current.push(jointId);
      }
    });

    Object.entries(compensation.quaternions).forEach(([jointId, quaternion]) => {
      const joint = robot.joints[jointId];
      const motionGroup = jointMotions[jointId];
      if (!joint || !motionGroup) {
        return;
      }

      applyJointMotionToGroup(motionGroup, joint, {
        quaternions: { [jointId]: quaternion },
      });

      if (!previewedMotionJointIdsRef.current.includes(jointId)) {
        previewedMotionJointIdsRef.current.push(jointId);
      }
    });
  }, [jointMotions, resetConstraintPreview, robot]);

  return {
    previewConstraintCompensation,
    previewConstraintMotionCompensation,
    resetConstraintPreview,
  };
}
