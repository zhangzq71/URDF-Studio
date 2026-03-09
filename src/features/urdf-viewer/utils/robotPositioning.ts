import * as THREE from 'three';
import { getLowestMeshZ } from '@/shared/utils';

export function getRobotGroundOffset(robot: THREE.Object3D): number | null {
    let minZ = getLowestMeshZ(robot, {
        includeInvisible: false,
        includeVisual: true,
        includeCollision: false,
    });

    if (minZ === null) {
        minZ = getLowestMeshZ(robot, {
            includeInvisible: true,
            includeVisual: true,
            includeCollision: false,
        });
    }

    return minZ;
}

/**
 * Align the rendered robot so its lowest visible visual geometry rests on the target plane.
 * This keeps the grid/canvas stable while switching assets with different authoring origins.
 */
export function offsetRobotToGround(robot: THREE.Object3D, targetZ = 0): void {
    const minZ = getRobotGroundOffset(robot);
    if (minZ === null) {
        return;
    }

    robot.position.z += targetZ - minZ;
    robot.updateMatrixWorld(true);
}
