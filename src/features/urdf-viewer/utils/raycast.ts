import * as THREE from 'three';

export function isGizmoObject(object: THREE.Object3D | null): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData?.isGizmo) return true;
    current = current.parent;
  }
  return false;
}

export function collectGizmoRaycastTargets(scene: THREE.Object3D): THREE.Object3D[] {
  const targets: THREE.Object3D[] = [];

  scene.traverse((child) => {
    if (!child.visible) return;
    if (!child.userData?.isGizmo) return;
    if (typeof (child as unknown as { raycast?: unknown }).raycast !== 'function') return;
    targets.push(child);
  });

  return targets;
}

export function findFirstIntersection(
  intersections: THREE.Intersection[],
  predicate: (hit: THREE.Intersection) => boolean,
): THREE.Intersection | null {
  for (const hit of intersections) {
    if (predicate(hit)) {
      return hit;
    }
  }

  return null;
}
