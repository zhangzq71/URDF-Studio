import * as THREE from 'three';

import type { UrdfLink } from '@/types';

import { shouldSyncDirectLinkChildVisibility } from './runtimeVisibility';
import { syncCollisionGroupVisibility } from './collisionVisibilitySync';

function resolveLinkNameForNode(node: THREE.Object3D, inheritedLinkName: string | null): string | null {
  const explicitLinkName = typeof node.userData?.parentLinkName === 'string' && node.userData.parentLinkName
    ? node.userData.parentLinkName
    : null;

  return explicitLinkName ?? inheritedLinkName;
}

function isVisualGeometryVisible(linkData: UrdfLink | undefined, showVisual: boolean): boolean {
  return showVisual && linkData?.visible !== false && linkData?.visual.visible !== false;
}

export interface SyncRobotGeometryVisibilityOptions {
  robot: THREE.Object3D;
  robotLinks?: Record<string, UrdfLink>;
  showCollision: boolean;
  showVisual: boolean;
  showCollisionAlwaysOnTop?: boolean;
  highlightedMeshes?: ReadonlyMap<THREE.Mesh, unknown>;
}

export function syncRobotGeometryVisibility({
  robot,
  robotLinks,
  showCollision,
  showVisual,
  showCollisionAlwaysOnTop = true,
  highlightedMeshes,
}: SyncRobotGeometryVisibilityOptions): boolean {
  let changed = false;

  const walkNode = (node: THREE.Object3D, currentLinkName: string | null) => {
    const nextLinkName = (node as any).isURDFLink && node.name ? node.name : currentLinkName;
    const linkName = resolveLinkNameForNode(node, nextLinkName);
    const linkData = linkName ? robotLinks?.[linkName] : undefined;

    if ((node as any).isURDFCollider) {
      changed = syncCollisionGroupVisibility({
        collider: node,
        linkData,
        showCollision,
        showCollisionAlwaysOnTop,
        highlightedMeshes,
      }) || changed;

      if (!node.visible) {
        return;
      }
    }

    if (node.userData?.isVisualGroup) {
      const isVisible = isVisualGeometryVisible(linkData, showVisual);
      if (node.visible !== isVisible) {
        changed = true;
      }
      node.visible = isVisible;
    }

    if (shouldSyncDirectLinkChildVisibility(node)) {
      const isVisible = isVisualGeometryVisible(linkData, showVisual);
      if (node.visible !== isVisible) {
        changed = true;
      }
      node.visible = isVisible;
    }

    if (
      (node as any).isMesh
      && node.userData?.isVisual
      && !node.userData?.isCollision
      && !node.userData?.isCollisionMesh
    ) {
      const isVisible = isVisualGeometryVisible(linkData, showVisual);
      if (node.visible !== isVisible) {
        changed = true;
      }
      node.visible = isVisible;
    }

    if ((node as any).isMesh && !node.userData?.isCollision && !node.userData?.isCollisionMesh) {
      let parent = node.parent;
      let isUrdfVisual = false;

      while (parent && parent !== robot) {
        if ((parent as any).isURDFVisual) {
          isUrdfVisual = true;
          break;
        }
        if ((parent as any).isURDFCollider) {
          break;
        }
        parent = parent.parent;
      }

      if (isUrdfVisual) {
        const isVisible = isVisualGeometryVisible(linkData, showVisual);
        if (node.visible !== isVisible) {
          changed = true;
        }
        node.visible = isVisible;
      }
    }

    for (let index = 0; index < node.children.length; index += 1) {
      walkNode(node.children[index], nextLinkName);
    }
  };

  for (let index = 0; index < robot.children.length; index += 1) {
    walkNode(robot.children[index], null);
  }

  return changed;
}
