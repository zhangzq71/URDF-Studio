import * as THREE from 'three';

import { cloneMaterialWithCoplanarOffset } from './coplanarMaterialOffset';

const POSITION_TOLERANCE = 1e-4;
const QUATERNION_TOLERANCE = 1e-4;

export interface CoincidentVisualRootEntry {
  root: THREE.Object3D;
  stableId: string | number;
}

function transformsMatchWithinTolerance(left: THREE.Object3D, right: THREE.Object3D): boolean {
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs((left.position[axis] ?? 0) - (right.position[axis] ?? 0)) > POSITION_TOLERANCE) {
      return false;
    }
  }

  let directDelta = 0;
  let negatedDelta = 0;
  for (const axis of ['x', 'y', 'z', 'w'] as const) {
    directDelta = Math.max(directDelta, Math.abs((left.quaternion[axis] ?? 0) - (right.quaternion[axis] ?? 0)));
    negatedDelta = Math.max(negatedDelta, Math.abs((left.quaternion[axis] ?? 0) + (right.quaternion[axis] ?? 0)));
  }

  return Math.min(directDelta, negatedDelta) <= QUATERNION_TOLERANCE;
}

function applyVisualStackIndex(root: THREE.Object3D, stackIndex: number): void {
  root.userData = {
    ...(root.userData ?? {}),
    visualStackIndex: stackIndex,
  };

  if (stackIndex <= 0) {
    return;
  }

  root.traverse((child: any) => {
    if (!child?.isMesh) {
      return;
    }

    child.renderOrder = Math.max(Number(child.renderOrder) || 0, stackIndex);
    child.userData = {
      ...(child.userData ?? {}),
      visualStackIndex: stackIndex,
    };

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material: THREE.Material) =>
        cloneMaterialWithCoplanarOffset(material, stackIndex),
      );
      return;
    }

    if (child.material) {
      child.material = cloneMaterialWithCoplanarOffset(child.material as THREE.Material, stackIndex);
    }
  });
}

export function stackCoincidentVisualRoots(entries: CoincidentVisualRootEntry[]): void {
  const groups: CoincidentVisualRootEntry[][] = [];

  entries.forEach((entry) => {
    const existing = groups.find((group) => transformsMatchWithinTolerance(group[0].root, entry.root));
    if (existing) {
      existing.push(entry);
      return;
    }

    groups.push([entry]);
  });

  groups.forEach((group) => {
    if (group.length < 2) {
      applyVisualStackIndex(group[0].root, 0);
      return;
    }

    group
      .slice()
      .sort((left, right) => String(left.stableId).localeCompare(String(right.stableId)))
      .forEach((entry, index) => {
        applyVisualStackIndex(entry.root, index);
      });
  });
}
