import * as THREE from 'three';

import type { UrdfLink } from '@/types';
import { getCollisionGeometryByObjectIndex } from '@/core/robot';

import { COLLISION_OVERLAY_RENDER_ORDER, collisionBaseMaterial } from './materials';

const COLLIDER_MESH_CACHE_KEY = '__collisionMeshesCache';

function getCollisionGeometryByIndex(linkData: UrdfLink | undefined, colliderIndex: number) {
  if (!linkData) return undefined;
  return getCollisionGeometryByObjectIndex(linkData, colliderIndex)?.geometry;
}

function isCollisionGeometryVisible(
  linkData: UrdfLink | undefined,
  colliderIndex: number,
  showCollision: boolean,
): boolean {
  if (!showCollision) return false;
  if (!linkData) return true;

  const geometry = getCollisionGeometryByIndex(linkData, colliderIndex);
  return geometry ? geometry.visible !== false : true;
}

function getColliderIndex(collider: THREE.Object3D): number {
  const linkObject = collider.parent && (collider.parent as any).isURDFLink
    ? collider.parent
    : null;
  if (!linkObject) return 0;

  const colliders = linkObject.children.filter((child: any) => child.isURDFCollider);
  const colliderIndex = colliders.indexOf(collider);
  return colliderIndex >= 0 ? colliderIndex : 0;
}

export interface SyncCollisionGroupVisibilityOptions {
  collider: THREE.Object3D;
  linkData?: UrdfLink;
  showCollision: boolean;
  highlightedMeshes?: ReadonlyMap<THREE.Mesh, unknown>;
}

function getColliderMeshes(collider: THREE.Object3D): THREE.Mesh[] {
  const cachedMeshes = collider.userData?.[COLLIDER_MESH_CACHE_KEY];
  if (Array.isArray(cachedMeshes) && cachedMeshes.every((mesh) => mesh instanceof THREE.Mesh)) {
    return cachedMeshes as THREE.Mesh[];
  }

  const meshes: THREE.Mesh[] = [];
  collider.traverse((inner: any) => {
    if (inner.isMesh) {
      meshes.push(inner as THREE.Mesh);
    }
  });

  collider.userData[COLLIDER_MESH_CACHE_KEY] = meshes;
  return meshes;
}

export function syncCollisionGroupVisibility({
  collider,
  linkData,
  showCollision,
  highlightedMeshes,
}: SyncCollisionGroupVisibilityOptions): boolean {
  const colliderIndex = getColliderIndex(collider);
  const isVisible = isCollisionGeometryVisible(linkData, colliderIndex, showCollision);
  let changed = collider.visible !== isVisible;

  collider.visible = isVisible;

  if (!isVisible) {
    return changed;
  }

  getColliderMeshes(collider).forEach((inner) => {
    const meshWithOriginalMaterial = inner as THREE.Mesh & { __origMaterial?: THREE.Material | THREE.Material[] };

    if (inner.userData.isCollisionMesh !== true) {
      changed = true;
    }
    inner.userData.isCollisionMesh = true;

    if (inner.raycast !== THREE.Mesh.prototype.raycast) {
      changed = true;
    }
    inner.raycast = THREE.Mesh.prototype.raycast;

    if (inner.visible !== true) {
      changed = true;
    }
    inner.visible = true;

    if (highlightedMeshes?.has(inner)) {
      return;
    }

    if (meshWithOriginalMaterial.__origMaterial) {
      meshWithOriginalMaterial.__origMaterial = collisionBaseMaterial;
    }

    if (inner.material !== collisionBaseMaterial) {
      changed = true;
    }
    inner.material = collisionBaseMaterial;

    if (inner.renderOrder !== COLLISION_OVERLAY_RENDER_ORDER) {
      changed = true;
    }
    inner.renderOrder = COLLISION_OVERLAY_RENDER_ORDER;
  });

  return changed;
}
