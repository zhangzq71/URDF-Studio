import * as THREE from 'three';
import { useUIStore } from '@/store';

/**
 * Auto-fit ground plane to the robot's lowest Z point.
 * Sets groundPlaneOffset in uiStore instead of moving the model.
 */
export function offsetRobotToGround(robot: THREE.Object3D): void {
    robot.updateMatrixWorld(true);
    const box = new THREE.Box3();

    robot.traverse((child) => {
        if (child.userData?.isGizmo) return;
        if (child.name?.startsWith('__')) return;
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) {
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                const geomBox = mesh.geometry.boundingBox!.clone();
                geomBox.applyMatrix4(mesh.matrixWorld);
                box.union(geomBox);
            }
        }
    });

    if (!box.isEmpty() && isFinite(box.min.z)) {
        useUIStore.getState().setGroundPlaneOffset(box.min.z);
    }
}
