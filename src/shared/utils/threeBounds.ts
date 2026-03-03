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

  const visitNode = (obj: THREE.Object3D) => {
    if (obj.userData?.isHelper || obj.userData?.isGizmo || obj.name?.startsWith('__')) return;
    if (!(obj as THREE.Mesh).isMesh) return;

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
  };

  // NOTE:
  // `obj.visible` only reflects local visibility. Using `traverseVisible` ensures
  // meshes under hidden parents (e.g. hidden collision groups) are excluded.
  if (includeInvisible) {
    root.traverse(visitNode);
  } else {
    root.traverseVisible(visitNode);
  }

  return Number.isFinite(lowestZ) ? lowestZ : null;
}
