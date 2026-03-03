import * as THREE from 'three';
import { useUIStore } from '@/store';
import { getLowestMeshZ } from '@/shared/utils';

/**
 * Auto-fit ground plane to the robot's lowest Z point.
 * Sets groundPlaneOffset in uiStore instead of moving the model.
 */
export function offsetRobotToGround(robot: THREE.Object3D): void {
    // Prefer visible geometry so hidden collision meshes don't pull the horizon down.
    let minZ = getLowestMeshZ(robot, { includeInvisible: false });
    if (minZ === null) {
        // Fallback for edge cases where visibility is temporarily not initialized.
        minZ = getLowestMeshZ(robot, { includeInvisible: true });
    }
    if (minZ !== null) {
        useUIStore.getState().setGroundPlaneOffset(minZ);
    }
}
