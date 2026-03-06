import * as THREE from 'three';

interface LowestMeshZOptions {
  includeInvisible?: boolean;
  includeVisual?: boolean;
  includeCollision?: boolean;
}

type MeshRole = 'visual' | 'collision' | 'unknown';

function getMeshRole(mesh: THREE.Mesh): MeshRole {
  let current: THREE.Object3D | null = mesh;

  while (current) {
    if (
      (current as any).isURDFCollider ||
      current.userData?.isCollisionMesh === true ||
      current.userData?.geometryRole === 'collision'
    ) {
      return 'collision';
    }

    if (
      current.userData?.isVisualMesh === true ||
      current.userData?.geometryRole === 'visual'
    ) {
      return 'visual';
    }

    current = current.parent;
  }

  return 'unknown';
}

/**
 * Compute the lowest world-space Z from mesh bounding boxes.
 * Invalid/NaN bounding boxes are skipped to avoid poisoning the result.
 */
export function getLowestMeshZ(root: THREE.Object3D, options?: LowestMeshZOptions): number | null {
  const includeInvisible = options?.includeInvisible ?? true;
  const includeVisual = options?.includeVisual ?? true;
  const includeCollision = options?.includeCollision ?? true;
  const worldBox = new THREE.Box3();
  let lowestZ = Number.POSITIVE_INFINITY;

  root.updateMatrixWorld(true);

  const visitNode = (obj: THREE.Object3D) => {
    if (obj.userData?.isHelper || obj.userData?.isGizmo || obj.name?.startsWith('__')) return;
    if (!(obj as THREE.Mesh).isMesh) return;

    const mesh = obj as THREE.Mesh;
    if (!mesh.geometry) return;

    const meshRole = getMeshRole(mesh);
    if (meshRole === 'collision' && !includeCollision) return;
    if ((meshRole === 'visual' || meshRole === 'unknown') && !includeVisual) return;

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
