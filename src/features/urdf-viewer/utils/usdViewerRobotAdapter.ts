import * as THREE from 'three';

import {
  DEFAULT_JOINT,
  DEFAULT_LINK,
  GeometryType,
  JointType,
  type Euler,
  type UrdfJoint,
  type UrdfLink,
  type UrdfVisual,
  type UsdJointCatalogEntry,
  type UsdLinkDynamicsEntry,
  type UsdMeshCountsEntry,
  type UsdSceneMaterialRecord,
  type UsdRobotMetadataSnapshot,
  type UsdSceneMeshDescriptor,
  type UsdSceneSnapshot,
  type Vector3,
} from '@/types';
import type { ViewerRobotDataResolution } from './viewerRobotData';
import {
  buildNormalizedUsdPathSet,
  getUsdDescriptorSemanticChildLinkName,
  resolveUsdDescriptorTargetLinkPath,
} from './usdDescriptorLinkResolution';
import { resolveUsdPrimitiveGeometryFromDescriptor } from './usdPrimitiveGeometry';

type MeshPrimitiveCounts = Record<string, number | undefined>;
type MeshCountsEntry = UsdMeshCountsEntry;
type JointCatalogEntry = UsdJointCatalogEntry;
type LinkDynamicsEntry = UsdLinkDynamicsEntry;
type MaterialRecord = UsdSceneMaterialRecord;
type RobotMetadataSnapshot = UsdRobotMetadataSnapshot;
type MeshDescriptor = UsdSceneMeshDescriptor;
type RobotSceneSnapshot = UsdSceneSnapshot;

export type { ViewerRobotDataResolution } from './viewerRobotData';
export type UsdViewerRobotDataResolution = ViewerRobotDataResolution;

export type UsdViewerRobotSceneSnapshot = RobotSceneSnapshot;

function normalizeUsdPath(path: string | null | undefined): string {
  const normalized = String(path || '').trim().replace(/[<>]/g, '').replace(/\\/g, '/');
  if (!normalized) return '';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function getPathBasename(path: string | null | undefined): string {
  const normalized = normalizeUsdPath(path);
  if (!normalized) return '';
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

function normalizeDescriptorSectionName(sectionName: string | null | undefined): string {
  const normalized = String(sectionName || '').trim().toLowerCase();
  if (normalized === 'visual') return 'visuals';
  if (normalized === 'collision' || normalized === 'collider' || normalized === 'colliders') {
    return 'collisions';
  }
  return normalized;
}

function getDescriptorMaterialId(descriptor: MeshDescriptor): string {
  return normalizeUsdPath(
    descriptor.materialId
    || descriptor.geometry?.materialId
    || '',
  );
}

function colorArrayToHex(
  value: ArrayLike<number> | null | undefined,
  opacityOverride?: number | null,
): string | null {
  const source = Array.isArray(value)
    ? value
    : (value && typeof value.length === 'number' ? Array.from(value) : null);
  if (!source || source.length < 3) {
    return null;
  }

  const r = Number(source[0]);
  const g = Number(source[1]);
  const b = Number(source[2]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }

  const to255 = (channel: number) => (
    Math.abs(channel) <= 1
      ? channel * 255
      : channel
  );
  const toHex = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)))
    .toString(16)
    .padStart(2, '0');
  const linearColor = Math.abs(r) <= 1 && Math.abs(g) <= 1 && Math.abs(b) <= 1
    ? new THREE.Color(
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g)),
      Math.max(0, Math.min(1, b)),
    )
    : null;

  const a = opacityOverride ?? (source.length >= 4 ? Number(source[3]) : null);
  const rgb = linearColor
    ? [linearColor.getHexString()]
    : [
        toHex(to255(r)),
        toHex(to255(g)),
        toHex(to255(b)),
      ];

  if (a !== null && Number.isFinite(a) && a < 0.999) {
    rgb.push(toHex(to255(Number(a))));
  }

  return `#${rgb.join('')}`;
}

function getSnapshotMaterialLookup(snapshot: RobotSceneSnapshot): Map<string, MaterialRecord> {
  const lookup = new Map<string, MaterialRecord>();
  const materials = Array.from(snapshot.render?.materials || []);

  materials.forEach((material) => {
    const keys = [
      normalizeUsdPath(material.materialId || ''),
      normalizeUsdPath(material.name || ''),
    ].filter(Boolean);

    keys.forEach((key) => {
      if (!lookup.has(key)) {
        lookup.set(key, material);
      }
    });
  });

  return lookup;
}

function isGenericDescriptorName(value: string | null | undefined): boolean {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return true;
  return /^mesh(?:[_-]?\d+)?$/.test(raw)
    || /^geom(?:[_-]?\d+)?$/.test(raw)
    || /^proto(?:[_-].*)?$/.test(raw);
}

function getDescriptorSemanticName(descriptor: MeshDescriptor): string {
  const semanticChildLinkName = getUsdDescriptorSemanticChildLinkName(descriptor);
  if (semanticChildLinkName) {
    return semanticChildLinkName;
  }

  const candidates = [
    getPathBasename(descriptor.resolvedPrimPath),
    getPathBasename(descriptor.meshId),
  ];

  for (const candidate of candidates) {
    if (!candidate || isGenericDescriptorName(candidate)) {
      continue;
    }
    return candidate;
  }

  return '';
}

function parseDescriptorOrdinal(descriptor: MeshDescriptor, fallbackIndex: number): number {
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

function createUniqueId(base: string, used: Set<string>, fallbackPath: string): string {
  const normalizedBase = String(base || 'link').replace(/[^\w]+/g, '_') || 'link';
  if (!used.has(normalizedBase)) {
    used.add(normalizedBase);
    return normalizedBase;
  }

  const sanitizedPath = String(fallbackPath || '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '') || normalizedBase;
  if (!used.has(sanitizedPath)) {
    used.add(sanitizedPath);
    return sanitizedPath;
  }

  let suffix = 2;
  while (used.has(`${sanitizedPath}_${suffix}`)) {
    suffix += 1;
  }
  const candidate = `${sanitizedPath}_${suffix}`;
  used.add(candidate);
  return candidate;
}

function toVector3(value: ArrayLike<number> | null | undefined, fallback: Vector3 = { x: 0, y: 0, z: 0 }): Vector3 {
  return {
    x: Number.isFinite(Number(value?.[0])) ? Number(value?.[0]) : fallback.x,
    y: Number.isFinite(Number(value?.[1])) ? Number(value?.[1]) : fallback.y,
    z: Number.isFinite(Number(value?.[2])) ? Number(value?.[2]) : fallback.z,
  };
}

function quaternionComponentsToEuler(
  x: unknown,
  y: unknown,
  z: unknown,
  w: unknown,
  fallback: Euler = { r: 0, p: 0, y: 0 },
): Euler {
  const quaternion = new THREE.Quaternion(
    Number(x) || 0,
    Number(y) || 0,
    Number(z) || 0,
    Number(w) || 0,
  );
  if (quaternion.lengthSq() <= 1e-12) {
    return fallback;
  }

  quaternion.normalize();
  const euler = new THREE.Euler(0, 0, 0, 'ZYX').setFromQuaternion(quaternion, 'ZYX');
  return {
    r: euler.x,
    p: euler.y,
    y: euler.z,
  };
}

function getDynamicsOriginRotation(
  dynamicsEntry?: LinkDynamicsEntry | null,
): Euler {
  const principalAxesLocal = dynamicsEntry?.principalAxesLocal;
  if (principalAxesLocal && typeof principalAxesLocal.length === 'number' && principalAxesLocal.length >= 4) {
    return quaternionComponentsToEuler(
      principalAxesLocal[0],
      principalAxesLocal[1],
      principalAxesLocal[2],
      principalAxesLocal[3],
    );
  }

  const principalAxesLocalWxyz = dynamicsEntry?.principalAxesLocalWxyz;
  if (principalAxesLocalWxyz && typeof principalAxesLocalWxyz.length === 'number' && principalAxesLocalWxyz.length >= 4) {
    return quaternionComponentsToEuler(
      principalAxesLocalWxyz[1],
      principalAxesLocalWxyz[2],
      principalAxesLocalWxyz[3],
      principalAxesLocalWxyz[0],
    );
  }

  return { r: 0, p: 0, y: 0 };
}

function degreesToRadians(value: number | null | undefined): number | undefined {
  return Number.isFinite(Number(value)) ? (Number(value) * Math.PI) / 180 : undefined;
}

function jointTypeFromViewerValue(value: string | null | undefined): JointType {
  const normalized = String(value || '').trim().toLowerCase();
  switch (normalized) {
    case 'fixed':
      return JointType.FIXED;
    case 'continuous':
      return JointType.CONTINUOUS;
    case 'prismatic':
      return JointType.PRISMATIC;
    case 'planar':
      return JointType.PLANAR;
    case 'floating':
      return JointType.FLOATING;
    case 'revolute':
    default:
      return JointType.REVOLUTE;
  }
}

function axisFromToken(token: string | null | undefined): Vector3 {
  const normalized = String(token || '').trim().toUpperCase();
  switch (normalized) {
    case 'Y':
      return { x: 0, y: 1, z: 0 };
    case 'Z':
      return { x: 0, y: 0, z: 1 };
    case 'X':
    default:
      return { x: 1, y: 0, z: 0 };
  }
}

function axisFromViewerEntry(entry: JointCatalogEntry): Vector3 {
  const axisLocal = entry.axisLocal;
  if (axisLocal && typeof axisLocal.length === 'number' && axisLocal.length >= 3) {
    const vector = toVector3(axisLocal, axisFromToken(entry.axisToken));
    if (vector.x !== 0 || vector.y !== 0 || vector.z !== 0) {
      return vector;
    }
  }
  return axisFromToken(entry.axisToken);
}

function geometryTypeFromCollisionPrimitive(counts: MeshPrimitiveCounts | null | undefined): GeometryType {
  if (!counts || typeof counts !== 'object') {
    return GeometryType.MESH;
  }

  const preferredOrder: Array<[string, GeometryType]> = [
    ['box', GeometryType.BOX],
    ['cube', GeometryType.BOX],
    ['sphere', GeometryType.SPHERE],
    ['cylinder', GeometryType.CYLINDER],
    ['capsule', GeometryType.CAPSULE],
    ['mesh', GeometryType.MESH],
  ];

  for (const [key, geometryType] of preferredOrder) {
    if (Number(counts[key] || 0) > 0) {
      return geometryType;
    }
  }

  return GeometryType.MESH;
}

function createPlaceholderVisual(type: GeometryType, color: string, meshPath?: string): UrdfVisual {
  return {
    ...DEFAULT_LINK.visual,
    type,
    color,
    meshPath,
    dimensions: type === GeometryType.NONE ? { x: 0, y: 0, z: 0 } : { x: 1, y: 1, z: 1 },
    origin: {
      xyz: { x: 0, y: 0, z: 0 },
      rpy: { r: 0, p: 0, y: 0 },
    },
  };
}

function cloneMeshCountsEntry(entry: MeshCountsEntry | null | undefined): MeshCountsEntry {
  return {
    visualMeshCount: Number(entry?.visualMeshCount || 0),
    collisionMeshCount: Number(entry?.collisionMeshCount || 0),
    collisionPrimitiveCounts: {
      ...(entry?.collisionPrimitiveCounts || {}),
    },
  };
}

function deriveMeshCountsByLinkPath(
  snapshot: RobotSceneSnapshot,
  knownLinkPaths: Iterable<string | null | undefined>,
): Record<string, MeshCountsEntry> {
  const existing = snapshot.robotMetadataSnapshot?.meshCountsByLinkPath;
  const descriptors = Array.from(snapshot.render?.meshDescriptors || []);
  if (descriptors.length === 0) {
    return existing || {};
  }

  const derived: Record<string, MeshCountsEntry> = {};
  const normalizedKnownLinkPaths = buildNormalizedUsdPathSet(knownLinkPaths);

  const ensureEntry = (linkPath: string): MeshCountsEntry => {
    if (!derived[linkPath]) {
      derived[linkPath] = {
        visualMeshCount: 0,
        collisionMeshCount: 0,
        collisionPrimitiveCounts: {},
      };
    }
    return derived[linkPath];
  };

  for (const descriptor of descriptors) {
    const linkPath = resolveUsdDescriptorTargetLinkPath({
      descriptor,
      knownLinkPaths: normalizedKnownLinkPaths,
    });
    if (!linkPath) continue;

    const entry = ensureEntry(linkPath);
    const sectionName = normalizeDescriptorSectionName(descriptor.sectionName);
    if (sectionName === 'collisions') {
      entry.collisionMeshCount = Number(entry.collisionMeshCount || 0) + 1;
      const primitiveType = String(descriptor.primType || '').trim().toLowerCase();
      if (primitiveType) {
        const collisionPrimitiveCounts = entry.collisionPrimitiveCounts || {};
        collisionPrimitiveCounts[primitiveType] = Number(collisionPrimitiveCounts[primitiveType] || 0) + 1;
        entry.collisionPrimitiveCounts = collisionPrimitiveCounts;
      }
      continue;
    }

    entry.visualMeshCount = Number(entry.visualMeshCount || 0) + 1;
  }

  if (!existing || Object.keys(existing).length === 0) {
    return derived;
  }

  const result: Record<string, MeshCountsEntry> = {};
  const allLinkPaths = new Set([
    ...Object.keys(existing),
    ...Object.keys(derived),
  ]);

  allLinkPaths.forEach((linkPath) => {
    const existingEntry = cloneMeshCountsEntry(existing[linkPath]);
    const derivedEntry = cloneMeshCountsEntry(derived[linkPath]);
    const mergedEntry: MeshCountsEntry = {
      visualMeshCount: derivedEntry.visualMeshCount > 0
        ? derivedEntry.visualMeshCount
        : existingEntry.visualMeshCount,
      collisionMeshCount: derivedEntry.collisionMeshCount > 0
        ? derivedEntry.collisionMeshCount
        : existingEntry.collisionMeshCount,
      collisionPrimitiveCounts: Object.keys(derivedEntry.collisionPrimitiveCounts || {}).length > 0
        ? derivedEntry.collisionPrimitiveCounts
        : existingEntry.collisionPrimitiveCounts,
    };

    if (mergedEntry.visualMeshCount > 0 || mergedEntry.collisionMeshCount > 0) {
      result[linkPath] = mergedEntry;
    }
  });

  return result;
}

function createLinkFromViewerMetadata(linkPath: string, meshCounts: MeshCountsEntry, dynamicsEntry?: LinkDynamicsEntry | null): UrdfLink {
  const visualCount = Number(meshCounts.visualMeshCount || 0);
  const collisionCount = Number(meshCounts.collisionMeshCount || 0);
  const collisionType = collisionCount > 0
    ? geometryTypeFromCollisionPrimitive(meshCounts.collisionPrimitiveCounts)
    : GeometryType.NONE;

  return {
    ...DEFAULT_LINK,
    id: '',
    name: getPathBasename(linkPath) || 'link',
    visual: visualCount > 0
      // USD scene snapshots only tell us that a link has authored visual geometry.
      // The link path itself is not a loadable mesh asset, so keep meshPath empty to
      // avoid invalid mesh-analysis lookups such as "/go2_description/base".
      ? createPlaceholderVisual(GeometryType.MESH, DEFAULT_LINK.visual.color)
      : createPlaceholderVisual(GeometryType.NONE, DEFAULT_LINK.visual.color),
    collision: collisionCount > 0
      ? createPlaceholderVisual(
          collisionType,
          DEFAULT_LINK.collision.color,
        )
      : createPlaceholderVisual(GeometryType.NONE, DEFAULT_LINK.collision.color),
    collisionBodies: collisionCount > 1
      ? Array.from({ length: collisionCount - 1 }, () => createPlaceholderVisual(
          collisionType,
          DEFAULT_LINK.collision.color,
        ))
      : [],
    inertial: {
      ...DEFAULT_LINK.inertial,
      mass: Number.isFinite(Number(dynamicsEntry?.mass)) ? Number(dynamicsEntry?.mass) : DEFAULT_LINK.inertial.mass,
      origin: {
        xyz: toVector3(dynamicsEntry?.centerOfMassLocal, DEFAULT_LINK.inertial.origin?.xyz),
        rpy: getDynamicsOriginRotation(dynamicsEntry),
      },
      inertia: Array.isArray(dynamicsEntry?.diagonalInertia) || (dynamicsEntry?.diagonalInertia && typeof dynamicsEntry.diagonalInertia.length === 'number')
        ? {
            ixx: Number(dynamicsEntry?.diagonalInertia?.[0]) || 0,
            ixy: 0,
            ixz: 0,
            iyy: Number(dynamicsEntry?.diagonalInertia?.[1]) || 0,
            iyz: 0,
            izz: Number(dynamicsEntry?.diagonalInertia?.[2]) || 0,
          }
        : { ...DEFAULT_LINK.inertial.inertia },
    },
  };
}

function createJointFromViewerEntry(
  entry: JointCatalogEntry,
  linkIdByPath: Map<string, string>,
  usedJointIds: Set<string>,
): UrdfJoint | null {
  const childPath = normalizeUsdPath(entry.linkPath || entry.childLinkPath);
  const parentPath = normalizeUsdPath(entry.parentLinkPath);
  if (!childPath || !parentPath) return null;

  const childLinkId = linkIdByPath.get(childPath);
  const parentLinkId = linkIdByPath.get(parentPath);
  if (!childLinkId || !parentLinkId) return null;

  const jointName = String(entry.jointName || getPathBasename(entry.jointPath) || `${getPathBasename(childPath)}_joint`).trim();
  const jointId = createUniqueId(jointName || 'joint', usedJointIds, `${parentPath}_${childPath}`);
  const jointType = jointTypeFromViewerValue(entry.jointTypeName || entry.jointType);
  const lower = degreesToRadians(entry.lowerLimitDeg);
  const upper = degreesToRadians(entry.upperLimitDeg);
  const originXyz = entry.originXyz && typeof entry.originXyz.length === 'number'
    ? toVector3(entry.originXyz)
    : toVector3(entry.localPivotInLink);
  const originQuatWxyz = entry.originQuatWxyz && typeof entry.originQuatWxyz.length === 'number'
    ? Array.from(entry.originQuatWxyz).slice(0, 4)
    : null;

  return {
    ...DEFAULT_JOINT,
    id: jointId,
    name: jointName || jointId,
    type: jointType,
    parentLinkId,
    childLinkId,
    origin: {
      xyz: originXyz,
      rpy: originQuatWxyz
        ? quaternionComponentsToEuler(
            originQuatWxyz[1],
            originQuatWxyz[2],
            originQuatWxyz[3],
            originQuatWxyz[0],
          )
        : { r: 0, p: 0, y: 0 },
    },
    axis: axisFromViewerEntry(entry),
    limit: {
      ...DEFAULT_JOINT.limit,
      ...(lower !== undefined ? { lower } : {}),
      ...(upper !== undefined ? { upper } : {}),
    },
  };
}

export function adaptUsdViewerSnapshotToRobotData(
  snapshot: RobotSceneSnapshot | null | undefined,
  options: { fileName?: string } = {},
): ViewerRobotDataResolution | null {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const metadata = snapshot.robotMetadataSnapshot || {};
  const linkParentPairs = Array.from(metadata.linkParentPairs || snapshot.robotTree?.linkParentPairs || []);
  const jointCatalogEntries = Array.from(metadata.jointCatalogEntries || snapshot.robotTree?.jointCatalogEntries || []);
  const linkDynamicsEntries = Array.from(metadata.linkDynamicsEntries || snapshot.physics?.linkDynamicsEntries || []);
  const rootLinkPaths = Array.from(snapshot.robotTree?.rootLinkPaths || []);

  const linkPaths = new Set<string>();
  const addLinkPath = (value: string | null | undefined) => {
    const normalized = normalizeUsdPath(value);
    if (normalized) linkPaths.add(normalized);
  };

  linkParentPairs.forEach((pair) => {
    addLinkPath(pair?.[0]);
    addLinkPath(pair?.[1]);
  });
  jointCatalogEntries.forEach((entry) => {
    addLinkPath(entry.linkPath);
    addLinkPath(entry.childLinkPath);
    addLinkPath(entry.parentLinkPath);
  });
  linkDynamicsEntries.forEach((entry) => addLinkPath(entry.linkPath));
  rootLinkPaths.forEach((entry) => addLinkPath(entry));
  Object.keys(metadata.meshCountsByLinkPath || {}).forEach((path) => addLinkPath(path));

  const meshCountsByLinkPath = deriveMeshCountsByLinkPath(snapshot, linkPaths);
  Object.keys(meshCountsByLinkPath).forEach((path) => addLinkPath(path));

  const normalizedStageSourcePath = normalizeUsdPath(snapshot.stageSourcePath || metadata.stageSourcePath);
  if (linkPaths.size === 0) {
    return null;
  }

  const sortedLinkPaths = Array.from(linkPaths).sort((left, right) => left.localeCompare(right));
  const dynamicsByLinkPath = new Map<string, LinkDynamicsEntry>();
  linkDynamicsEntries.forEach((entry) => {
    const normalizedPath = normalizeUsdPath(entry.linkPath);
    if (normalizedPath && !dynamicsByLinkPath.has(normalizedPath)) {
      dynamicsByLinkPath.set(normalizedPath, entry);
    }
  });

  const links: Record<string, UrdfLink> = {};
  const linkIdByPath = new Map<string, string>();
  const linkPathById = new Map<string, string>();
  const usedLinkIds = new Set<string>();

  for (const linkPath of sortedLinkPaths) {
    const linkName = getPathBasename(linkPath) || 'link';
    const linkId = createUniqueId(linkName, usedLinkIds, linkPath);
    linkIdByPath.set(linkPath, linkId);

    const link = createLinkFromViewerMetadata(
      linkPath,
      meshCountsByLinkPath[linkPath] || {},
      dynamicsByLinkPath.get(linkPath) || null,
    );
    link.id = linkId;
    link.name = linkName;
    links[linkId] = link;
    linkPathById.set(linkId, linkPath);
  }

  const joints: Record<string, UrdfJoint> = {};
  const usedJointIds = new Set<string>();
  const explicitChildPaths = new Set<string>();
  const jointPathById = new Map<string, string>();
  const childLinkPathByJointId = new Map<string, string>();
  const parentLinkPathByJointId = new Map<string, string>();

  for (const entry of jointCatalogEntries) {
    const joint = createJointFromViewerEntry(entry, linkIdByPath, usedJointIds);
    if (!joint) continue;
    joints[joint.id] = joint;

    const childPath = normalizeUsdPath(entry.linkPath || entry.childLinkPath);
    const parentPath = normalizeUsdPath(entry.parentLinkPath);
    const jointPath = normalizeUsdPath(entry.jointPath);
    if (childPath) {
      explicitChildPaths.add(childPath);
      childLinkPathByJointId.set(joint.id, childPath);
    }
    if (parentPath) {
      parentLinkPathByJointId.set(joint.id, parentPath);
    }
    if (jointPath) {
      jointPathById.set(joint.id, jointPath);
    }
  }

  for (const pair of linkParentPairs) {
    const childPath = normalizeUsdPath(pair?.[0]);
    const parentPath = normalizeUsdPath(pair?.[1]);
    if (!childPath || !parentPath || explicitChildPaths.has(childPath)) continue;

    const childLinkId = linkIdByPath.get(childPath);
    const parentLinkId = linkIdByPath.get(parentPath);
    if (!childLinkId || !parentLinkId) continue;

    const jointId = createUniqueId(`${getPathBasename(childPath) || childLinkId}_fixed`, usedJointIds, `${parentPath}_${childPath}_fixed`);
    joints[jointId] = {
      ...DEFAULT_JOINT,
      id: jointId,
      name: jointId,
      type: JointType.FIXED,
      parentLinkId,
      childLinkId,
      origin: {
        xyz: { x: 0, y: 0, z: 0 },
        rpy: { r: 0, p: 0, y: 0 },
      },
      axis: { x: 0, y: 0, z: 1 },
    };
    childLinkPathByJointId.set(jointId, childPath);
    parentLinkPathByJointId.set(jointId, parentPath);
  }

  const childLinkIds = new Set(Object.values(joints).map((joint) => joint.childLinkId));
  const preferredRootPath = normalizeUsdPath(rootLinkPaths[0]);
  const rootLinkId = (preferredRootPath ? linkIdByPath.get(preferredRootPath) : null)
    || Object.keys(links).find((linkId) => !childLinkIds.has(linkId))
    || Object.keys(links)[0];

  if (!rootLinkId) {
    return null;
  }

  const robotName = getPathBasename(snapshot.stage?.defaultPrimPath)
    || (options.fileName ? options.fileName.split('/').pop()?.replace(/\.[^/.]+$/, '') : '')
    || getPathBasename(normalizedStageSourcePath)
    || 'usd_scene';

  const materials: Record<string, { color?: string; texture?: string }> = {};
  const materialLookup = getSnapshotMaterialLookup(snapshot);
  const descriptors = Array.from(snapshot.render?.meshDescriptors || []);
  const visualDescriptorsByLinkPath = new Map<string, Array<{ descriptor: MeshDescriptor; ordinal: number }>>();
  const collisionDescriptorsByLinkPath = new Map<string, Array<{ descriptor: MeshDescriptor; ordinal: number }>>();
  const visualDescriptorTargetLinkIds = new Map<string, string>();

  const getDescriptorEntryKey = (descriptor: MeshDescriptor, ordinal: number) => (
    `${normalizeDescriptorSectionName(descriptor.sectionName)}|${normalizeUsdPath(descriptor.meshId)}|${normalizeUsdPath(descriptor.resolvedPrimPath)}|${ordinal}`
  );

  descriptors.forEach((descriptor) => {
    const linkPath = resolveUsdDescriptorTargetLinkPath({
      descriptor,
      knownLinkPaths: linkPaths,
    });
    if (!linkPath) {
      return;
    }

    const sectionName = normalizeDescriptorSectionName(descriptor.sectionName);
    const targetMap = sectionName === 'collisions'
      ? collisionDescriptorsByLinkPath
      : visualDescriptorsByLinkPath;
    const entries = targetMap.get(linkPath) || [];
    entries.push({
      descriptor,
      ordinal: parseDescriptorOrdinal(descriptor, entries.length),
    });
    targetMap.set(linkPath, entries);
  });

  visualDescriptorsByLinkPath.forEach((entries) => {
    entries.sort((left, right) => left.ordinal - right.ordinal);
  });
  collisionDescriptorsByLinkPath.forEach((entries) => {
    entries.sort((left, right) => left.ordinal - right.ordinal);
  });

  descriptors.forEach((descriptor) => {
    const sectionName = normalizeDescriptorSectionName(descriptor.sectionName);
    if (sectionName !== 'visuals') {
      return;
    }

    const linkPath = resolveUsdDescriptorTargetLinkPath({
      descriptor,
      knownLinkPaths: linkPaths,
    });
    const linkId = linkIdByPath.get(linkPath);
    if (!linkId || materials[linkId]) {
      return;
    }

    const materialId = getDescriptorMaterialId(descriptor);
    const material = materialId ? materialLookup.get(materialId) : null;
    if (!material) {
      return;
    }

    const color = colorArrayToHex(material.color, material.opacity);
    const texture = material.mapPath ? String(material.mapPath) : undefined;
    if (!color && !texture) {
      return;
    }

    const link = links[linkId];
    if (link && (link.visual.color === DEFAULT_LINK.visual.color || !link.visual.color)) {
      link.visual = {
        ...link.visual,
        ...(color ? { color } : {}),
        materialSource: 'named',
      };
    }

    materials[linkId] = {
      ...(color ? { color } : {}),
      ...(texture ? { texture } : {}),
    };
  });

  visualDescriptorsByLinkPath.forEach((entries, linkPath) => {
    const parentLinkId = linkIdByPath.get(linkPath);
    if (!parentLinkId) {
      return;
    }

    if (entries[0]) {
      visualDescriptorTargetLinkIds.set(
        getDescriptorEntryKey(entries[0].descriptor, entries[0].ordinal),
        parentLinkId,
      );
    }

    if (entries.length <= 1) {
      return;
    }

    entries.slice(1).forEach(({ descriptor, ordinal }, index) => {
      const semanticName = getDescriptorSemanticName(descriptor);
      const childLinkId = createUniqueId(
        semanticName || `${parentLinkId}_geom_${index + 1}`,
        usedLinkIds,
        `${parentLinkId}_${descriptor.resolvedPrimPath || descriptor.meshId || index}`,
      );
      const childJointId = createUniqueId(
        `fixed_${childLinkId}`,
        usedJointIds,
        `${parentLinkId}_${childLinkId}_fixed`,
      );
      const materialId = getDescriptorMaterialId(descriptor);
      const material = materialId ? materialLookup.get(materialId) : null;
      const color = colorArrayToHex(material?.color, material?.opacity) || DEFAULT_LINK.visual.color;
      const texture = material?.mapPath ? String(material.mapPath) : undefined;

      links[childLinkId] = {
        ...DEFAULT_LINK,
        id: childLinkId,
        name: childLinkId,
        visual: createPlaceholderVisual(GeometryType.MESH, color),
        collision: createPlaceholderVisual(GeometryType.NONE, DEFAULT_LINK.collision.color),
        inertial: {
          ...DEFAULT_LINK.inertial,
          mass: 0,
        },
      };
      joints[childJointId] = {
        ...DEFAULT_JOINT,
        id: childJointId,
        name: childJointId,
        type: JointType.FIXED,
        parentLinkId,
        childLinkId,
        origin: {
          xyz: { x: 0, y: 0, z: 0 },
          rpy: { r: 0, p: 0, y: 0 },
        },
        axis: { x: 0, y: 0, z: 1 },
      };

      materials[childLinkId] = {
        ...(color ? { color } : {}),
        ...(texture ? { texture } : {}),
      };
      visualDescriptorTargetLinkIds.set(
        getDescriptorEntryKey(descriptor, ordinal),
        childLinkId,
      );
    });
  });

  visualDescriptorsByLinkPath.forEach((entries) => {
    entries.forEach(({ descriptor, ordinal }) => {
      const targetLinkId = visualDescriptorTargetLinkIds.get(getDescriptorEntryKey(descriptor, ordinal));
      if (!targetLinkId || !links[targetLinkId]) {
        return;
      }

      const primitiveGeometry = resolveUsdPrimitiveGeometryFromDescriptor(descriptor, links[targetLinkId].visual);
      if (!primitiveGeometry) {
        return;
      }

      links[targetLinkId].visual = {
        ...links[targetLinkId].visual,
        ...primitiveGeometry,
        meshPath: undefined,
      };
    });
  });

  collisionDescriptorsByLinkPath.forEach((entries, linkPath) => {
    const linkId = linkIdByPath.get(linkPath);
    const link = linkId ? links[linkId] : null;
    if (!link) {
      return;
    }

    entries.forEach(({ descriptor }, index) => {
      const currentCollision = index === 0
        ? link.collision
        : link.collisionBodies?.[index - 1];
      const primitiveGeometry = resolveUsdPrimitiveGeometryFromDescriptor(descriptor, currentCollision);
      if (!primitiveGeometry) {
        return;
      }

      const nextCollision = {
        ...DEFAULT_LINK.collision,
        ...(currentCollision || {}),
        ...primitiveGeometry,
        meshPath: undefined,
        origin: currentCollision?.origin || { ...DEFAULT_LINK.collision.origin },
      };

      if (index === 0) {
        link.collision = nextCollision;
        return;
      }

      const collisionBodies = [...(link.collisionBodies || [])];
      collisionBodies[index - 1] = nextCollision;
      link.collisionBodies = collisionBodies;
    });
  });

  return {
    stageSourcePath: normalizedStageSourcePath || null,
    linkIdByPath: Object.fromEntries(linkIdByPath.entries()),
    linkPathById: Object.fromEntries(linkPathById.entries()),
    jointPathById: Object.fromEntries(jointPathById.entries()),
    childLinkPathByJointId: Object.fromEntries(childLinkPathByJointId.entries()),
    parentLinkPathByJointId: Object.fromEntries(parentLinkPathByJointId.entries()),
    runtimeLinkMappingMode: 'robot-data',
    robotData: {
      name: robotName,
      links,
      joints,
      rootLinkId,
      ...(Object.keys(materials).length > 0 ? { materials } : {}),
    },
  };
}
