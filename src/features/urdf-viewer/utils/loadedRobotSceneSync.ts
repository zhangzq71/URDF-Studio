import * as THREE from 'three';

import { COLLISION_OVERLAY_RENDER_ORDER, collisionBaseMaterial, enhanceMaterials } from './materials';
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
  const robotLinks = (robot as any).links as Record<string, THREE.Object3D> | undefined;

  const isLinkNode = (object: THREE.Object3D): boolean => (
    Boolean((object as any).isURDFLink || robotLinks?.[object.name])
  );

  const processCollisionMesh = (mesh: THREE.Mesh, parentLink: THREE.Object3D | null) => {
    if (mesh.userData?.isCollisionMesh !== true || mesh.userData?.isVisualMesh !== false) {
      changed = true;
    }

    mesh.userData.isCollisionMesh = true;
    mesh.userData.isCollision = true;
    mesh.userData.isVisual = false;
    mesh.userData.isVisualMesh = false;

    if (mesh.material !== collisionBaseMaterial) {
      changed = true;
      mesh.material = collisionBaseMaterial;
    }

    if (mesh.renderOrder !== COLLISION_OVERLAY_RENDER_ORDER) {
      changed = true;
      mesh.renderOrder = COLLISION_OVERLAY_RENDER_ORDER;
    }

    if (parentLink) {
      if (mesh.userData?.parentLinkName !== parentLink.name) {
        changed = true;
      }
      mesh.userData.parentLinkName = parentLink.name;
      pushMesh(linkMeshMap, `${parentLink.name}:collision`, mesh);
    }
  };

  const processVisualMesh = (mesh: THREE.Mesh, parentLink: THREE.Object3D) => {
    const shouldUpgradeVisualMaterial = meshNeedsMaterialUpgrade(mesh);

    if (sourceFormat === 'urdf' && urdfMaterials && shouldUpgradeVisualMaterial) {
      applyURDFMaterials(mesh, urdfMaterials);
    }

    if (shouldUpgradeVisualMaterial) {
      enhanceMaterials(mesh);
      changed = true;
    }

    if (
      mesh.userData?.parentLinkName !== parentLink.name
      || mesh.userData?.isVisualMesh !== true
      || mesh.userData?.isCollisionMesh === true
      || mesh.visible !== showVisual
    ) {
      changed = true;
    }

    mesh.userData.parentLinkName = parentLink.name;
    mesh.userData.isVisualMesh = true;
    mesh.userData.isCollisionMesh = false;
    mesh.visible = showVisual;

    pushMesh(linkMeshMap, `${parentLink.name}:visual`, mesh);
  };

  const walkNode = (
    node: THREE.Object3D,
    parentLink: THREE.Object3D | null,
    insideCollider: boolean,
  ) => {
    const nextParentLink = isLinkNode(node) ? node : parentLink;
    const nodeIsCollider = Boolean((node as any).isURDFCollider);
    const nextInsideCollider = insideCollider || nodeIsCollider;

    if (nodeIsCollider) {
      if (node.visible !== showCollision) {
        changed = true;
      }
      node.visible = showCollision;

      if (nextParentLink) {
        if (node.userData?.parentLinkName !== nextParentLink.name) {
          changed = true;
        }
        node.userData.parentLinkName = nextParentLink.name;
      }

      if (!showCollision) {
        return;
      }
    }

    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      if (nextInsideCollider) {
        processCollisionMesh(mesh, nextParentLink);
      } else if (nextParentLink) {
        processVisualMesh(mesh, nextParentLink);
      }
    }

    for (let index = 0; index < node.children.length; index += 1) {
      walkNode(node.children[index], nextParentLink, nextInsideCollider);
    }
  };

  for (let index = 0; index < robot.children.length; index += 1) {
    walkNode(robot.children[index], null, false);
  }

  return { changed, linkMeshMap };
}
