import * as THREE from 'three';
import { isGizmoObject } from './raycast';

export type PickTargetMode = 'all' | 'visual' | 'collision';

function matchesMode(key: string, mode: PickTargetMode): boolean {
  if (mode === 'all') return true;
  return key.endsWith(`:${mode}`);
}

function isVisibleInHierarchy(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function hasPickableMaterial(material: THREE.Material | THREE.Material[] | undefined): boolean {
  if (!material) {
    return true;
  }

  const materials = Array.isArray(material) ? material : [material];
  return materials.some((entry) => entry.visible !== false);
}

export function isCollisionPickObject(object: THREE.Object3D | null): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData?.isCollisionMesh || (current as any).isURDFCollider) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function matchesIntersectionMode(hit: THREE.Intersection, mode: PickTargetMode): boolean {
  if (isGizmoObject(hit.object)) return false;
  if (mode === 'all') return true;

  const isCollision = isCollisionPickObject(hit.object);
  return mode === 'collision' ? isCollision : !isCollision;
}

export function collectPickTargets(
  linkMeshMap: Map<string, THREE.Mesh[]>,
  mode: PickTargetMode,
): THREE.Object3D[] {
  const targets: THREE.Object3D[] = [];
  const seen = new Set<number>();

  linkMeshMap.forEach((meshes, key) => {
    if (!matchesMode(key, mode)) return;

    meshes.forEach((mesh) => {
      if (seen.has(mesh.id)) return;
      if (!mesh.geometry) return;
      if (mesh.userData?.isGizmo) return;
      if (!isVisibleInHierarchy(mesh)) return;
      if (typeof (mesh as unknown as { raycast?: unknown }).raycast !== 'function') return;
      if (!hasPickableMaterial(mesh.material)) return;

      seen.add(mesh.id);
      targets.push(mesh);
    });
  });

  return targets;
}

export function findPickIntersections(
  robot: THREE.Object3D | null,
  raycaster: THREE.Raycaster,
  pickTargets: THREE.Object3D[],
  mode: PickTargetMode,
  fallbackOnMiss = true,
): THREE.Intersection[] {
  const directHits = pickTargets.length > 0
    ? raycaster.intersectObjects(pickTargets, false).filter((hit) => matchesIntersectionMode(hit, mode))
    : [];

  if (directHits.length > 0 || !fallbackOnMiss || !robot) {
    return directHits;
  }

  return raycaster
    .intersectObject(robot, true)
    .filter((hit) => matchesIntersectionMode(hit, mode));
}
