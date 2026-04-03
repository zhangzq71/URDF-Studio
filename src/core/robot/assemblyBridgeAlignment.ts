import * as THREE from 'three';

import type { AssemblyComponent, AssemblyState, AssemblyTransform, BridgeJoint } from '@/types';

import { computeLinkWorldMatrices, createOriginMatrix } from './kinematics';
import { cloneAssemblyTransform } from './assemblyTransforms';

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

function normalizeZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
}

export function buildAssemblyTransformMatrix(transform?: AssemblyTransform | null): THREE.Matrix4 {
  const normalized = cloneAssemblyTransform(transform);

  return new THREE.Matrix4().compose(
    new THREE.Vector3(normalized.position.x, normalized.position.y, normalized.position.z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(normalized.rotation.r, normalized.rotation.p, normalized.rotation.y, 'ZYX'),
    ),
    UNIT_SCALE,
  );
}

export function decomposeAssemblyTransformMatrix(matrix: THREE.Matrix4): AssemblyTransform {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'ZYX');

  matrix.decompose(position, quaternion, scale);
  euler.setFromQuaternion(quaternion, 'ZYX');

  return cloneAssemblyTransform({
    position: {
      x: normalizeZero(position.x),
      y: normalizeZero(position.y),
      z: normalizeZero(position.z),
    },
    rotation: {
      r: normalizeZero(euler.x),
      p: normalizeZero(euler.y),
      y: normalizeZero(euler.z),
    },
  });
}

export function resolveAssemblyComponentLinkId(
  component: AssemblyComponent,
  linkId: string,
): string | null {
  if (component.robot.links[linkId]) {
    return linkId;
  }

  const namespacedLinkId = `${component.id}_${linkId}`;
  if (component.robot.links[namespacedLinkId]) {
    return namespacedLinkId;
  }

  return null;
}

export function resolveAlignedAssemblyComponentTransformForBridge(
  assemblyState: AssemblyState,
  bridge: BridgeJoint,
): AssemblyTransform | null {
  const parentComponent = assemblyState.components[bridge.parentComponentId];
  const childComponent = assemblyState.components[bridge.childComponentId];

  if (!parentComponent || !childComponent) {
    return null;
  }

  const resolvedParentLinkId = resolveAssemblyComponentLinkId(parentComponent, bridge.parentLinkId);
  const resolvedChildLinkId = resolveAssemblyComponentLinkId(childComponent, bridge.childLinkId);
  if (!resolvedParentLinkId || !resolvedChildLinkId) {
    return null;
  }

  const parentLinkWorldMatrices = computeLinkWorldMatrices(parentComponent.robot);
  const childLinkWorldMatrices = computeLinkWorldMatrices(childComponent.robot);
  const parentLinkLocalMatrix = parentLinkWorldMatrices[resolvedParentLinkId];
  const childLinkLocalMatrix = childLinkWorldMatrices[resolvedChildLinkId];
  if (!parentLinkLocalMatrix || !childLinkLocalMatrix) {
    return null;
  }

  const parentRootMatrix = buildAssemblyTransformMatrix(parentComponent.transform);
  const parentLinkWorldMatrix = parentRootMatrix.clone().multiply(parentLinkLocalMatrix);
  const childRootWorldMatrix = parentLinkWorldMatrix
    .clone()
    .multiply(createOriginMatrix(bridge.joint.origin))
    .multiply(childLinkLocalMatrix.clone().invert());

  return decomposeAssemblyTransformMatrix(childRootWorldMatrix);
}
