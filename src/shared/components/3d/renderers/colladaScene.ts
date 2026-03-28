import * as THREE from 'three';
import { bakeColladaRootTransformInPlace, postProcessColladaScene } from '@/core/loaders';

export interface ColladaSceneCloneResult {
  clone: THREE.Object3D;
  overrideMeshes: THREE.Mesh[];
}

export function cloneColladaScenePreservingRootTransform(
  scene: THREE.Object3D,
  preserveRootTransform = false,
  preserveOriginalMaterial = false,
): ColladaSceneCloneResult {
  const clone = scene.clone();
  const overrideMeshes: THREE.Mesh[] = [];

  postProcessColladaScene(clone);

  if (preserveRootTransform) {
    // Visualizer-style URDF rendering applies link origins outside the imported
    // mesh. Only bake the imported Collada root when we explicitly normalized
    // the up-axis metadata and need to retain authored root transforms.
    bakeColladaRootTransformInPlace(clone);
  } else {
    // Keep the legacy Visualizer behavior for raw Collada files: discard the
    // loader-injected root rotation so URDF origins remain the only transform
    // applied around the imported mesh.
    clone.rotation.set(0, 0, 0);
    clone.updateMatrix();
  }

  if (!preserveOriginalMaterial) {
    clone.traverse((child: THREE.Object3D) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const mesh = child as THREE.Mesh;
      const originalMaterial = mesh.material;
      const hasTexture = Array.isArray(originalMaterial)
        ? originalMaterial.some((mat) => Boolean((mat as THREE.MeshStandardMaterial).map || (mat as THREE.MeshStandardMaterial).emissiveMap))
        : Boolean(
            (originalMaterial as THREE.MeshStandardMaterial | undefined)?.map ||
            (originalMaterial as THREE.MeshStandardMaterial | undefined)?.emissiveMap
          );

      if (!hasTexture) {
        overrideMeshes.push(mesh);
      }
    });
  }

  return { clone, overrideMeshes };
}
