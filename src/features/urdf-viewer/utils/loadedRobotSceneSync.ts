import * as THREE from 'three';

import { collisionBaseMaterial, enhanceMaterials } from './materials';
import { markCollisionObject } from './robotLoaderPatchUtils';
import { applyURDFMaterials, type URDFMaterialInfo } from './urdfMaterials';

export interface SyncLoadedRobotSceneOptions {
  robot: THREE.Object3D;
  sourceFormat: 'urdf' | 'mjcf';
  showCollision: boolean;
  showVisual: boolean;
  urdfMaterials?: Map<string, URDFMaterialInfo> | null;
}

export interface SyncLoadedRobotSceneResult {
  changed: boolean;
  linkMeshMap: Map<string, THREE.Mesh[]>;
}

function resolveParentLink(robot: THREE.Object3D, object: THREE.Object3D): THREE.Object3D | null {
  let current: any = object;

  while (current) {
    if (current.isURDFLink || (robot as any).links?.[current.name]) {
      return current as THREE.Object3D;
    }

    current = current.parent;
  }

  return null;
}

function isVisualMeshUnderLink(mesh: THREE.Object3D): boolean {
  let current = mesh.parent as THREE.Object3D | null;

  while (current) {
    if ((current as any).isURDFCollider) {
      return false;
    }

    if ((current as any).isURDFLink) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

function meshNeedsMaterialUpgrade(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  return materials.some((material) => {
    if (!material) return false;
    if ((material as any).userData?.isCollisionMaterial) return false;
    return !(material instanceof THREE.MeshStandardMaterial);
  });
}

function pushMesh(map: Map<string, THREE.Mesh[]>, key: string, mesh: THREE.Mesh): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(mesh);
    return;
  }

  map.set(key, [mesh]);
}

export function syncLoadedRobotScene({
  robot,
  sourceFormat,
  showCollision,
  showVisual,
  urdfMaterials,
}: SyncLoadedRobotSceneOptions): SyncLoadedRobotSceneResult {
  const linkMeshMap = new Map<string, THREE.Mesh[]>();
  let changed = false;

  robot.traverse((child: any) => {
    const parentLink = resolveParentLink(robot, child);

    if (child.isURDFCollider) {
      if (child.visible !== showCollision) {
        changed = true;
      }
      child.visible = showCollision;

      if (parentLink && child.userData?.parentLinkName !== parentLink.name) {
        changed = true;
      }

      if (parentLink) {
        markCollisionObject(child, parentLink.name);
      } else {
        child.traverse((collisionMesh: any) => {
          if (!collisionMesh.isMesh) return;
          collisionMesh.userData.isCollisionMesh = true;
          collisionMesh.userData.isCollision = true;
          collisionMesh.userData.isVisual = false;
          collisionMesh.userData.isVisualMesh = false;
          collisionMesh.material = collisionBaseMaterial;
          collisionMesh.renderOrder = 999;
        });
      }

      child.traverse((collisionMesh: any) => {
        if (!collisionMesh.isMesh) return;

        collisionMesh.userData.isCollisionMesh = true;
        collisionMesh.userData.isCollision = true;
        collisionMesh.userData.isVisual = false;
        collisionMesh.userData.isVisualMesh = false;

        if (parentLink) {
          collisionMesh.userData.parentLinkName = parentLink.name;
          pushMesh(linkMeshMap, `${parentLink.name}:collision`, collisionMesh as THREE.Mesh);
        }
      });
      return;
    }

    if (!child.isMesh || child.userData?.isCollisionMesh) {
      return;
    }

    if (!parentLink || !isVisualMeshUnderLink(child)) {
      return;
    }

    const shouldUpgradeVisualMaterial = meshNeedsMaterialUpgrade(child as THREE.Mesh);

    if (sourceFormat === 'urdf' && urdfMaterials && shouldUpgradeVisualMaterial) {
      applyURDFMaterials(child, urdfMaterials);
    }

    if (shouldUpgradeVisualMaterial) {
      enhanceMaterials(child);
      changed = true;
    }

    if (
      child.userData?.parentLinkName !== parentLink.name
      || child.userData?.isVisualMesh !== true
      || child.userData?.isCollisionMesh === true
      || child.visible !== showVisual
    ) {
      changed = true;
    }

    child.userData.parentLinkName = parentLink.name;
    child.userData.isVisualMesh = true;
    child.userData.isCollisionMesh = false;
    child.visible = showVisual;

    pushMesh(linkMeshMap, `${parentLink.name}:visual`, child as THREE.Mesh);
  });

  return { changed, linkMeshMap };
}
