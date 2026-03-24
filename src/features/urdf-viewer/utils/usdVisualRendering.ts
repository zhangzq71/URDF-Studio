import * as THREE from 'three';

export function prepareUsdVisualMesh(mesh: THREE.Mesh): void {
  // Let USD meshes participate in the same shadow pass as URDF/MJCF so the
  // in-app viewer lands on a closer visual baseline across import formats.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.__usdVisualMeshPrepared = true;
}
