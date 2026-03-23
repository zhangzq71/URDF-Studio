import * as THREE from 'three';

import {
  DEFAULT_JOINT,
  DEFAULT_LINK,
  GeometryType,
  JointType,
  type UsdSceneMeshDescriptor,
  type UsdSceneSnapshot,
} from '@/types';
import { computeLinkWorldMatrices, createOriginMatrix } from '@/core/robot/kinematics';
import type { UrdfVisual } from '@/types';
import type { ViewerRobotDataResolution } from './viewerRobotData';
import { resolveUsdDescriptorTargetLinkPath } from './usdDescriptorLinkResolution';

interface UsdRuntimeTransformInterface {
  getPreferredLinkWorldTransform?: (linkPath: string) => unknown;
  getWorldTransformForPrimPath?: (primPath: string) => unknown;
}

type DescriptorRole = 'visual' | 'collision';

interface DescriptorEntry {
  descriptor: UsdSceneMeshDescriptor;
  ordinal: number;
}

const IDENTITY_MATRIX = new THREE.Matrix4();
const ROOT_TRANSFORM_EPSILON = 1e-6;

function toMatrix4(value: unknown): THREE.Matrix4 | null {
  if (!value) {
    return null;
  }

  if (value instanceof THREE.Matrix4) {
    return value.clone();
  }

  if (Array.isArray(value) || (typeof value === 'object' && typeof (value as ArrayLike<number>).length === 'number')) {
    const numeric = Array.from(value as ArrayLike<number>).map((entry) => Number(entry));
    if (numeric.length >= 16 && numeric.every((entry) => Number.isFinite(entry))) {
      return new THREE.Matrix4().fromArray(numeric.slice(0, 16));
    }
  }

  return null;
}

function normalizeUsdPath(path: string | null | undefined): string {
  const normalized = String(path || '').trim().replace(/[<>]/g, '').replace(/\\/g, '/');
  if (!normalized) return '';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function getDescriptorRole(descriptor: UsdSceneMeshDescriptor): DescriptorRole {
  const sectionName = String(descriptor.sectionName || '').trim().toLowerCase();
  if (
    sectionName === 'collisions'
    || sectionName === 'collision'
    || sectionName === 'colliders'
    || sectionName === 'collider'
  ) {
    return 'collision';
  }

  const candidateText = `${descriptor.meshId || ''} ${descriptor.resolvedPrimPath || ''}`.toLowerCase();
  return /\/coll(?:isions?|iders?)(?:$|[/.])/.test(candidateText) ? 'collision' : 'visual';
}

function parseDescriptorOrdinal(descriptor: UsdSceneMeshDescriptor, fallbackIndex: number): number {
  const meshId = String(descriptor.meshId || '');
  const match = meshId.match(/(?:\.proto_(?:mesh|[a-z]+)_id)(\d+)$/i);
  if (match) {
    const numeric = Number(match[1]);
    if (Number.isInteger(numeric) && numeric >= 0) {
      return numeric;
    }
  }

  return fallbackIndex;
}

function matrixToOrigin(matrix: THREE.Matrix4): NonNullable<UrdfVisual['origin']> {
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);

  const euler = new THREE.Euler(0, 0, 0, 'ZYX').setFromQuaternion(rotation.normalize(), 'ZYX');
  return {
    xyz: {
      x: position.x,
      y: position.y,
      z: position.z,
    },
    rpy: {
      r: euler.x,
      p: euler.y,
      y: euler.z,
    },
  };
}

function resolveLinkWorldMatrix(
  runtime: UsdRuntimeTransformInterface,
  resolution: ViewerRobotDataResolution,
  computedLinkWorldMatrices: Record<string, THREE.Matrix4>,
  linkPath: string | null | undefined,
): THREE.Matrix4 | null {
  const normalizedPath = normalizeUsdPath(linkPath);
  if (!normalizedPath) {
    return null;
  }

  const preferredLinkWorldMatrix = toMatrix4(runtime.getPreferredLinkWorldTransform?.(normalizedPath));
  if (preferredLinkWorldMatrix) {
    return preferredLinkWorldMatrix;
  }

  const primLinkWorldMatrix = toMatrix4(runtime.getWorldTransformForPrimPath?.(normalizedPath));
  if (primLinkWorldMatrix) {
    return primLinkWorldMatrix;
  }

  const linkId = resolution.linkIdByPath[normalizedPath];
  const computedLinkWorldMatrix = linkId ? computedLinkWorldMatrices[linkId] : null;
  return computedLinkWorldMatrix?.clone() || null;
}

function resolvePrimWorldMatrix(
  runtime: UsdRuntimeTransformInterface,
  descriptor: UsdSceneMeshDescriptor,
): THREE.Matrix4 | null {
  const candidates = [
    normalizeUsdPath(descriptor.resolvedPrimPath || ''),
    normalizeUsdPath(descriptor.meshId || ''),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = toMatrix4(runtime.getWorldTransformForPrimPath?.(candidate));
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function buildDescriptorMap(
  snapshot: UsdSceneSnapshot | null | undefined,
  resolution: ViewerRobotDataResolution,
): Map<string, DescriptorEntry[]> {
  const descriptorsByLinkRole = new Map<string, DescriptorEntry[]>();
  const descriptors = Array.from(snapshot?.render?.meshDescriptors || []);
  const knownLinkPaths = Object.keys(resolution.linkIdByPath);

  descriptors.forEach((descriptor, index) => {
    const linkPath = resolveUsdDescriptorTargetLinkPath({
      descriptor,
      knownLinkPaths,
    });
    if (!linkPath) return;

    const linkId = resolution.linkIdByPath[linkPath];
    if (!linkId) return;

    const role = getDescriptorRole(descriptor);
    const key = `${linkId}:${role}`;
    const entries = descriptorsByLinkRole.get(key) || [];
    entries.push({
      descriptor,
      ordinal: parseDescriptorOrdinal(descriptor, index),
    });
    descriptorsByLinkRole.set(key, entries);
  });

  descriptorsByLinkRole.forEach((entries) => {
    entries.sort((left, right) => {
      if (left.ordinal !== right.ordinal) {
        return left.ordinal - right.ordinal;
      }
      return String(left.descriptor.meshId || '').localeCompare(String(right.descriptor.meshId || ''));
    });
  });

  return descriptorsByLinkRole;
}

function collectVisualAttachmentLinkIds(
  resolution: ViewerRobotDataResolution,
  parentLinkId: string,
): string[] {
  const parentLinkPath = normalizeUsdPath(resolution.linkPathById[parentLinkId]);

  return Object.values(resolution.robotData.joints)
    .filter((joint) => (
      joint.parentLinkId === parentLinkId
      && joint.type === 'fixed'
      && (() => {
        const childLinkPath = normalizeUsdPath(resolution.childLinkPathByJointId[joint.id]);
        return !childLinkPath || childLinkPath === parentLinkPath;
      })()
    ))
    .map((joint) => joint.childLinkId)
    .filter((childLinkId) => {
      const childLink = resolution.robotData.links[childLinkId];
      return Boolean(
        childLink
        && childLink.visual.type !== GeometryType.NONE
        && (childLink.inertial?.mass || 0) <= 1e-9,
      );
    });
}

function applyLocalOriginToVisual(
  visual: UrdfVisual,
  ownerLinkWorldMatrix: THREE.Matrix4,
  primWorldMatrix: THREE.Matrix4,
): UrdfVisual {
  const localMatrix = ownerLinkWorldMatrix
    .clone()
    .invert()
    .multiply(primWorldMatrix)
    .multiply(createOriginMatrix(visual.origin));
  return {
    ...visual,
    origin: matrixToOrigin(localMatrix),
  };
}

function isIdentityTransform(matrix: THREE.Matrix4): boolean {
  return matrix.elements.every((value, index) => (
    Math.abs(value - IDENTITY_MATRIX.elements[index]) <= ROOT_TRANSFORM_EPSILON
  ));
}

function createSyntheticWorldRootIfNeeded(
  resolution: ViewerRobotDataResolution,
  rootWorldMatrix: THREE.Matrix4 | null,
): void {
  if (!rootWorldMatrix || isIdentityTransform(rootWorldMatrix)) {
    return;
  }

  const originalRootLinkId = resolution.robotData.rootLinkId;
  if (!originalRootLinkId || originalRootLinkId === 'world') {
    return;
  }

  if (!resolution.robotData.links[originalRootLinkId]) {
    return;
  }

  if (!resolution.robotData.links.world) {
    resolution.robotData.links.world = {
      ...DEFAULT_LINK,
      id: 'world',
      name: 'world',
      visible: true,
      visual: {
        ...DEFAULT_LINK.visual,
        type: GeometryType.NONE,
      },
      collision: {
        ...DEFAULT_LINK.collision,
        type: GeometryType.NONE,
      },
      inertial: {
        ...DEFAULT_LINK.inertial,
        mass: 0,
      },
    };
  }

  const existingRootAnchor = Object.values(resolution.robotData.joints).find((joint) => (
    joint.parentLinkId === 'world'
    && joint.childLinkId === originalRootLinkId
  ));

  const rootAnchorJointId = existingRootAnchor?.id || `world_to_${originalRootLinkId}`;
  resolution.robotData.joints[rootAnchorJointId] = {
    ...DEFAULT_JOINT,
    ...(existingRootAnchor || {}),
    id: rootAnchorJointId,
    name: existingRootAnchor?.name || rootAnchorJointId,
    type: JointType.FIXED,
    parentLinkId: 'world',
    childLinkId: originalRootLinkId,
    origin: matrixToOrigin(rootWorldMatrix),
  };

  resolution.robotData.rootLinkId = 'world';
  resolution.linkPathById = {
    ...resolution.linkPathById,
    world: '',
  };
}

export function hydrateUsdViewerRobotResolutionFromRuntime(
  resolution: ViewerRobotDataResolution | null | undefined,
  snapshot: UsdSceneSnapshot | null | undefined,
  runtime: UsdRuntimeTransformInterface | null | undefined,
): ViewerRobotDataResolution | null {
  if (!resolution || !runtime) {
    return resolution ?? null;
  }

  const nextResolution: ViewerRobotDataResolution = {
    ...resolution,
    robotData: structuredClone(resolution.robotData),
  };
  let computedLinkWorldMatrices = computeLinkWorldMatrices(nextResolution.robotData);

  Object.values(nextResolution.robotData.joints).forEach((joint) => {
    const childLinkPath = resolution.childLinkPathByJointId[joint.id] || resolution.linkPathById[joint.childLinkId];
    const parentLinkPath = resolution.parentLinkPathByJointId[joint.id] || resolution.linkPathById[joint.parentLinkId];
    if (!childLinkPath || !parentLinkPath) {
      return;
    }

    const childWorldMatrix = resolveLinkWorldMatrix(
      runtime,
      nextResolution,
      computedLinkWorldMatrices,
      childLinkPath,
    );
    const parentWorldMatrix = resolveLinkWorldMatrix(
      runtime,
      nextResolution,
      computedLinkWorldMatrices,
      parentLinkPath,
    );
    if (!childWorldMatrix || !parentWorldMatrix) {
      return;
    }

    const jointLocalMatrix = parentWorldMatrix.clone().invert().multiply(childWorldMatrix);
    joint.origin = matrixToOrigin(jointLocalMatrix);
  });

  createSyntheticWorldRootIfNeeded(
    nextResolution,
    resolveLinkWorldMatrix(
      runtime,
      nextResolution,
      computedLinkWorldMatrices,
      resolution.linkPathById[nextResolution.robotData.rootLinkId],
    ),
  );

  computedLinkWorldMatrices = computeLinkWorldMatrices(nextResolution.robotData);
  const descriptorsByLinkRole = buildDescriptorMap(snapshot, resolution);

  Object.entries(resolution.linkIdByPath).forEach(([linkPath, linkId]) => {
    const ownerLinkWorldMatrix = resolveLinkWorldMatrix(
      runtime,
      nextResolution,
      computedLinkWorldMatrices,
      linkPath,
    );
    if (!ownerLinkWorldMatrix) {
      return;
    }

    const link = nextResolution.robotData.links[linkId];
    if (!link) {
      return;
    }

    const visualAttachmentLinkIds = collectVisualAttachmentLinkIds(nextResolution, linkId);
    const visualDescriptors = descriptorsByLinkRole.get(`${linkId}:visual`) || [];
    visualDescriptors.forEach((entry, index) => {
      const targetLinkId = index === 0 ? linkId : visualAttachmentLinkIds[index - 1];
      if (!targetLinkId) {
        return;
      }

      const primWorldMatrix = resolvePrimWorldMatrix(runtime, entry.descriptor);
      if (!primWorldMatrix) {
        return;
      }

      const targetLink = nextResolution.robotData.links[targetLinkId];
      if (!targetLink) {
        return;
      }

      targetLink.visual = applyLocalOriginToVisual(
        targetLink.visual,
        ownerLinkWorldMatrix,
        primWorldMatrix,
      );
    });

    const collisionDescriptors = descriptorsByLinkRole.get(`${linkId}:collision`) || [];
    collisionDescriptors.forEach((entry, index) => {
      const primWorldMatrix = resolvePrimWorldMatrix(runtime, entry.descriptor);
      if (!primWorldMatrix) {
        return;
      }

      if (index === 0) {
        link.collision = {
          ...link.collision,
          origin: matrixToOrigin(
            ownerLinkWorldMatrix
              .clone()
              .invert()
              .multiply(primWorldMatrix)
              .multiply(createOriginMatrix(link.collision.origin)),
          ),
        };
        return;
      }

      const collisionBodies = [...(link.collisionBodies || [])];
      if (!collisionBodies[index - 1]) {
        return;
      }

      collisionBodies[index - 1] = {
        ...collisionBodies[index - 1],
        origin: matrixToOrigin(
          ownerLinkWorldMatrix
            .clone()
            .invert()
            .multiply(primWorldMatrix)
            .multiply(createOriginMatrix(collisionBodies[index - 1].origin)),
        ),
      };
      link.collisionBodies = collisionBodies;
    });
  });

  return nextResolution;
}
