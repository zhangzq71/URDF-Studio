import type * as THREE from 'three';

const GROUND_ALIGNMENT_EPSILON = 1e-9;

export function resetSyntheticRootGroundOffset(
  root: THREE.Object3D | null,
  epsilon = GROUND_ALIGNMENT_EPSILON,
): boolean {
  if (!root || Math.abs(root.position.z) <= epsilon) {
    return false;
  }

  root.position.z = 0;
  root.updateMatrixWorld(true);
  return true;
}
