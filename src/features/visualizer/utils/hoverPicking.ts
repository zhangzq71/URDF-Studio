import * as THREE from 'three';

export interface VisualizerHoverTarget {
  type: 'link';
  id: string;
  subType: 'visual' | 'collision';
  objectIndex: number;
}

export const VISUALIZER_HOVER_TARGET_KEY = '__visualizerHoverTarget';

type VisualizerObjectHit = Pick<THREE.Intersection<THREE.Object3D>, 'object'>;

function hasPickableMaterial(material: THREE.Material | THREE.Material[] | undefined): boolean {
  if (!material) {
    return true;
  }

  const materials = Array.isArray(material) ? material : [material];
  return materials.some((entry) => {
    if (!entry || entry.visible === false) {
      return false;
    }

    const opacity = typeof entry.opacity === 'number' ? entry.opacity : 1;
    return opacity > 1e-3;
  });
}

function isVisibleInHierarchy(object: THREE.Object3D | null): boolean {
  let current = object;

  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }

  return true;
}

export function getVisualizerHoverTarget(object: THREE.Object3D | null): VisualizerHoverTarget | null {
  let current = object;

  while (current) {
    const target = current.userData?.[VISUALIZER_HOVER_TARGET_KEY] as VisualizerHoverTarget | undefined;
    if (target) {
      return target;
    }
    current = current.parent;
  }

  return null;
}

export function createVisualizerHoverUserData(target: VisualizerHoverTarget) {
  return {
    [VISUALIZER_HOVER_TARGET_KEY]: target,
  };
}

export function findNearestVisualizerTargetFromHits(
  hits: readonly VisualizerObjectHit[],
): VisualizerHoverTarget | null {
  for (const hit of hits) {
    const hitObject = hit.object;
    if (!isVisibleInHierarchy(hitObject)) {
      continue;
    }

    if ((hitObject as THREE.Mesh).isMesh && !hasPickableMaterial((hitObject as THREE.Mesh).material)) {
      continue;
    }

    const target = getVisualizerHoverTarget(hitObject);
    if (target) {
      return target;
    }
  }

  return null;
}

export function findNearestVisualizerHoverTarget(
  root: THREE.Object3D | null,
  raycaster: THREE.Raycaster,
): VisualizerHoverTarget | null {
  if (!root) {
    return null;
  }

  const hits = raycaster.intersectObject(root, true);
  return findNearestVisualizerTargetFromHits(hits);
}
