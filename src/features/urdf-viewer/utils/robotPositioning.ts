import * as THREE from 'three';
import { getLowestMeshZ } from '@/shared/utils';

/**
 * Align the rendered robot so its lowest visible visual geometry rests on Z=0.
 * This keeps the grid/canvas stable while switching assets with different
 * authoring origins, reducing visible scene "jumps" during preview updates.
 */
export function offsetRobotToGround(robot: THREE.Object3D): void {
    // Prefer visible visual geometry so collision meshes never affect grounding.
    let minZ = getLowestMeshZ(robot, {
        includeInvisible: false,
        includeVisual: true,
        includeCollision: false,
    });
    if (minZ === null) {
        // Fallback for edge cases where visibility is temporarily not initialized.
        minZ = getLowestMeshZ(robot, {
            includeInvisible: true,
            includeVisual: true,
            includeCollision: false,
        });
    }
    if (minZ !== null) {
        robot.position.z -= minZ;
        robot.updateMatrixWorld(true);
    }
}
