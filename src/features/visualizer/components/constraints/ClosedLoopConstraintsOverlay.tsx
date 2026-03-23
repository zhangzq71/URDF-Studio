import React from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

import { computeLinkWorldMatrices } from '@/core/robot';
import type { RobotState } from '@/types';

interface ClosedLoopConstraintsOverlayProps {
  robot: RobotState;
}

const TEMP_ANCHOR_A = new THREE.Vector3();
const TEMP_ANCHOR_B = new THREE.Vector3();

export const ClosedLoopConstraintsOverlay = React.memo(function ClosedLoopConstraintsOverlay({
  robot,
}: ClosedLoopConstraintsOverlayProps) {
  const segments = React.useMemo(() => {
    if (!robot.closedLoopConstraints || robot.closedLoopConstraints.length === 0) {
      return [];
    }

    const linkWorldMatrices = computeLinkWorldMatrices(robot);
    return robot.closedLoopConstraints.flatMap((constraint) => {
      const linkAMatrix = linkWorldMatrices[constraint.linkAId];
      const linkBMatrix = linkWorldMatrices[constraint.linkBId];
      if (!linkAMatrix || !linkBMatrix) {
        return [];
      }

      TEMP_ANCHOR_A.set(
        constraint.anchorLocalA.x,
        constraint.anchorLocalA.y,
        constraint.anchorLocalA.z,
      ).applyMatrix4(linkAMatrix);
      TEMP_ANCHOR_B.set(
        constraint.anchorLocalB.x,
        constraint.anchorLocalB.y,
        constraint.anchorLocalB.z,
      ).applyMatrix4(linkBMatrix);

      return [{
        id: constraint.id,
        points: [
          [TEMP_ANCHOR_A.x, TEMP_ANCHOR_A.y, TEMP_ANCHOR_A.z],
          [TEMP_ANCHOR_B.x, TEMP_ANCHOR_B.y, TEMP_ANCHOR_B.z],
        ] as [number, number, number][],
      }];
    });
  }, [robot]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <group userData={{ isHelper: true }}>
      {segments.map((segment) => (
        <Line
          key={segment.id}
          points={segment.points}
          color="#22d3ee"
          lineWidth={1.25}
          dashed
          dashSize={0.03}
          gapSize={0.02}
        />
      ))}
    </group>
  );
});
