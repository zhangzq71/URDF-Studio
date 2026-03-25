import * as THREE from 'three';

const MIN_PICKABLE_OPACITY = 1e-3;

export function isInternalHelperObject(object: THREE.Object3D | null): boolean {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (current.userData?.isGizmo === true || current.userData?.isHelper === true) {
      return true;
    }

    if (String(current.name || '').startsWith('__')) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

export function isVisibleInHierarchy(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }

  return true;
}

export function hasPickableMaterial(material: THREE.Material | THREE.Material[] | undefined): boolean {
  if (!material) {
    return true;
  }

  const materials = Array.isArray(material) ? material : [material];
  return materials.some((entry) => {
    if (!entry || entry.visible === false) {
      return false;
    }

    const opacity = typeof entry.opacity === 'number' ? entry.opacity : 1;
    return opacity > MIN_PICKABLE_OPACITY;
  });
}

export function isPickableMeshObject(object: THREE.Object3D): object is THREE.Mesh {
  if (!(object as THREE.Mesh).isMesh) {
    return false;
  }

  const mesh = object as THREE.Mesh;
  if (isInternalHelperObject(mesh)) {
    return false;
  }

  if (!isVisibleInHierarchy(mesh)) {
    return false;
  }

  if (typeof (mesh as unknown as { raycast?: unknown }).raycast !== 'function') {
    return false;
  }

  return hasPickableMaterial(mesh.material);
}
