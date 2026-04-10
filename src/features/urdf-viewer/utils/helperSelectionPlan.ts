import * as THREE from 'three';
import type { ViewerHelperKind } from '../types';

export interface HelperSelectionPlanOptions {
  fallbackType: 'link' | 'joint';
  fallbackId: string;
  helperKind?: ViewerHelperKind;
  linkObject?: THREE.Object3D | null;
}

export interface HelperSelectionPlan {
  selectTarget: { type: 'link' | 'joint'; id: string };
}

function resolveParentJointSelection(
  linkObject?: THREE.Object3D | null,
): { type: 'joint'; id: string } | null {
  let current = linkObject?.parent ?? null;

  while (current) {
    if ((current as any).isURDFJoint || (current as any).type === 'URDFJoint') {
      const jointId = current.name?.trim();
      return jointId ? { type: 'joint', id: jointId } : null;
    }

    current = current.parent;
  }

  return null;
}

function resolveChildJointSelection(
  linkObject?: THREE.Object3D | null,
): { type: 'joint'; id: string } | null {
  if (!linkObject) {
    return null;
  }

  const queue = [...linkObject.children];
  let fallbackJointId: string | null = null;

  while (queue.length > 0) {
    const current = queue.shift() ?? null;
    if (!current) {
      continue;
    }

    if ((current as any).isURDFJoint || (current as any).type === 'URDFJoint') {
      const jointId = current.name?.trim() || null;
      if (!jointId) {
        continue;
      }

      if ((current as { jointType?: string }).jointType !== 'fixed') {
        return { type: 'joint', id: jointId };
      }

      fallbackJointId ??= jointId;
      continue;
    }

    if ((current as any).isURDFLink || (current as any).type === 'URDFLink') {
      continue;
    }

    queue.push(...current.children);
  }

  return fallbackJointId ? { type: 'joint', id: fallbackJointId } : null;
}

export function resolveHelperSelectionPlan({
  fallbackType,
  fallbackId,
  helperKind,
  linkObject,
}: HelperSelectionPlanOptions): HelperSelectionPlan {
  if (helperKind === 'origin-axes') {
    const parentJointTarget = resolveParentJointSelection(linkObject);
    if (parentJointTarget) {
      return { selectTarget: parentJointTarget };
    }

    const childJointTarget = resolveChildJointSelection(linkObject);
    if (childJointTarget) {
      return { selectTarget: childJointTarget };
    }
  }

  return {
    selectTarget: {
      type: fallbackType,
      id: fallbackId,
    },
  };
}
