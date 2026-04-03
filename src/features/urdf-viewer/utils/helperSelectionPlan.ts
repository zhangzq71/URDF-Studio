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

function resolveParentJointSelection(linkObject?: THREE.Object3D | null): { type: 'joint'; id: string } | null {
  const parent = linkObject?.parent;
  if (!parent) {
    return null;
  }

  if ((parent as any).isURDFJoint || (parent as any).type === 'URDFJoint') {
    return { type: 'joint', id: parent.name };
  }

  return null;
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
  }

  return {
    selectTarget: {
      type: fallbackType,
      id: fallbackId,
    },
  };
}
