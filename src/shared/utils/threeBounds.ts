import * as THREE from 'three';

interface LowestMeshZOptions {
  includeInvisible?: boolean;
}

/**
 * Compute the lowest world-space Z from mesh bounding boxes.
 * Invalid/NaN bounding boxes are skipped to avoid poisoning the result.
 */
export function getLowestMeshZ(root: THREE.Object3D, options?: LowestMeshZOptions): number | null {
  const includeInvisible = options?.includeInvisible ?? true;
  const worldBox = new THREE.Box3();
  let lowestZ = Number.POSITIVE_INFINITY;

  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (obj.userData?.isHelper || obj.userData?.isGizmo || obj.name?.startsWith('__')) return;
    if (!(obj as THREE.Mesh).isMesh) return;
    if (!includeInvisible && !obj.visible) return;

    const mesh = obj as THREE.Mesh;
    if (!mesh.geometry) return;

    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }

    const localBox = mesh.geometry.boundingBox;
    if (!localBox) return;

    worldBox.copy(localBox).applyMatrix4(mesh.matrixWorld);

    if (!Number.isFinite(worldBox.min.z) || !Number.isFinite(worldBox.max.z)) {
      return;
    }

    lowestZ = Math.min(lowestZ, worldBox.min.z);
  });

  return Number.isFinite(lowestZ) ? lowestZ : null;
}
