import { Color, Matrix4, Vector3 } from 'three';

import {
  DEFAULT_JOINT,
  DEFAULT_LINK,
  GeometryType,
  JointType,
  type RobotData,
  type RobotState,
  type UrdfJoint,
  type UrdfLink,
  type UrdfVisual,
  type UsdMeshDescriptorRanges,
  type UsdPreparedExportCache,
  type UsdMeshRange,
  type UsdSceneBuffers,
  type UsdSceneMaterialRecord,
  type UsdSceneMeshDescriptor,
  type UsdSceneSnapshot,
} from '../../../types/index.ts';
import {
  adaptUsdViewerSnapshotToRobotData,
  resolveUsdMeshApproximationGeometry,
} from './usdViewerRobotAdapter.ts';
import { resolveUsdPrimitiveGeometryFromDescriptor as resolvePrimitiveGeometryFromDescriptor } from './usdPrimitiveGeometry.ts';
import { toVirtualUsdPath } from './usdPreloadSources.ts';
import { hydrateUsdViewerRobotResolutionFromRuntime } from './usdRuntimeRobotHydration.ts';
import type { ViewerRobotDataResolution } from './viewerRobotData.ts';

type MeshRange = UsdMeshRange;
type MeshDescriptorRanges = UsdMeshDescriptorRanges;
type SnapshotMaterialRecord = UsdSceneMaterialRecord;
type SnapshotMeshDescriptor = UsdSceneMeshDescriptor;
type SnapshotBuffers = UsdSceneBuffers;
type UsdExportSnapshot = UsdSceneSnapshot;

type DescriptorRole = 'visual' | 'collision';

type SnapshotGeomSubsetSection = {
  start: number;
  length: number;
  materialId?: string | null;
};

type ExportDescriptor = {
  descriptor: SnapshotMeshDescriptor;
  meshId: string;
  linkPath: string;
  linkId: string;
  role: DescriptorRole;
  exportPath: string;
  ordinal: number;
  subsetIndex?: number;
  subsetSection?: SnapshotGeomSubsetSection | null;
  materialIdOverride?: string | null;
  displayColor?: [number, number, number] | null;
  bakeTransformIntoMesh?: boolean;
};

type RobotLike = RobotData | RobotState;
const ORIGIN_EPSILON = 1e-9;

export interface UsdExportBundle {
  robot: RobotState;
  meshFiles: Map<string, Blob>;
  resolution: ViewerRobotDataResolution;
}

type SnapshotHost = {
  renderInterface?: {
    getCachedRobotSceneSnapshot?: (stageSourcePath?: string | null) => unknown;
    getPreferredVisualMaterialForLink?: (linkPath: string, requestingMeshId?: string | null) => unknown;
    getPreferredLinkWorldTransform?: (linkPath: string) => unknown;
    getWorldTransformForPrimPath?: (primPath: string) => unknown;
  } | null;
} | null | undefined;

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

function sanitizeFileToken(value: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'mesh';
}

function buildUsdSnapshotLookupPaths(stageSourcePath?: string | null): Array<string | null> {
  const rawStagePath = String(stageSourcePath || '').trim().split('?')[0];
  if (!rawStagePath) {
    return [null];
  }

  const normalizedStagePath = rawStagePath.startsWith('/')
    ? rawStagePath
    : toVirtualUsdPath(rawStagePath);

  return normalizedStagePath === rawStagePath
    ? [normalizedStagePath]
    : [normalizedStagePath, rawStagePath];
}

function normalizeSemanticToken(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .split('_')
    .filter((token) => token.length > 0 && ![
      'link',
      'joint',
      'visual',
      'visuals',
      'collision',
      'collisions',
      'mesh',
      'geom',
      'geometry',
      'proto',
      'id',
      'usd',
      'xform',
      'body',
    ].includes(token))
    .join('_');
}

function isGenericDescriptorName(value: string | null | undefined): boolean {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return true;
  return /^mesh(?:[_-]?\d+)?$/.test(raw)
    || /^geom(?:[_-]?\d+)?$/.test(raw)
    || /^proto(?:[_-].*)?$/.test(raw);
}

function getDescriptorSemanticName(descriptor: SnapshotMeshDescriptor): string {
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

function getDescriptorGeomSubsetSections(descriptor: SnapshotMeshDescriptor): SnapshotGeomSubsetSection[] {
  const geometry = descriptor.geometry && typeof descriptor.geometry === 'object'
    ? descriptor.geometry as {
        geomSubsetSections?: Array<{
          start?: unknown;
          length?: unknown;
          materialId?: unknown;
        }> | null;
      }
    : null;
  const rawSections = Array.isArray(geometry?.geomSubsetSections)
    ? geometry.geomSubsetSections
    : [];

  return rawSections
    .map((section) => {
      const start = Number(section?.start);
      const length = Number(section?.length);
      if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) {
        return null;
      }

      return {
        start: Math.max(0, Math.floor(start)),
        length: Math.max(0, Math.floor(length)),
        materialId: normalizeUsdPath(String(section?.materialId || '')) || null,
      } satisfies SnapshotGeomSubsetSection;
    })
    .filter(Boolean) as SnapshotGeomSubsetSection[];
}

function getDescriptorMaterialId(
  descriptor: SnapshotMeshDescriptor,
  materialIdOverride?: string | null,
): string {
  return normalizeUsdPath(
    materialIdOverride
    || descriptor.materialId
    || descriptor.geometry?.materialId
    || '',
  );
}

function toHexChannel(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, '0');
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

  const useNormalizedLinearChannels = Math.abs(r) <= 1
    && Math.abs(g) <= 1
    && Math.abs(b) <= 1;
  const linearColor = useNormalizedLinearChannels
    ? new Color(
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g)),
      Math.max(0, Math.min(1, b)),
    )
    : null;

  const a = opacityOverride ?? (source.length >= 4 ? Number(source[3]) : null);
  if (a !== null && Number.isFinite(a) && a < 0.999) {
    return `#${linearColor?.getHexString() ?? `${toHexChannel(to255(r))}${toHexChannel(to255(g))}${toHexChannel(to255(b))}`}${toHexChannel(to255(a))}`;
  }

  return `#${linearColor?.getHexString() ?? `${toHexChannel(to255(r))}${toHexChannel(to255(g))}${toHexChannel(to255(b))}`}`;
}

function colorArrayToVertexColor(
  value: ArrayLike<number> | null | undefined,
): [number, number, number] | null {
  const source = Array.isArray(value)
    ? value
    : (value && typeof value.length === 'number' ? Array.from(value) : null);
  if (!source || source.length < 3) {
    return null;
  }

  const channels = source.slice(0, 3).map((channel) => Number(channel));
  if (channels.some((channel) => !Number.isFinite(channel))) {
    return null;
  }

  const normalizeChannel = (channel: number) => (
    Math.abs(channel) <= 1
      ? Math.max(0, Math.min(1, channel))
      : Math.max(0, Math.min(1, channel / 255))
  );

  return [
    normalizeChannel(channels[0]),
    normalizeChannel(channels[1]),
    normalizeChannel(channels[2]),
  ];
}

function shouldAdoptSnapshotColor(color: string | null | undefined): boolean {
  const normalized = String(color || '').trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized === DEFAULT_LINK.visual.color.toLowerCase()
    || normalized === DEFAULT_LINK.collision.color.toLowerCase();
}

function getDescriptorLinkPath(descriptor: SnapshotMeshDescriptor): string {
  const meshId = normalizeUsdPath(descriptor.meshId || '');
  if (meshId) {
    const markerIndex = meshId.indexOf('.proto_');
    if (markerIndex > 0) {
      let linkPath = meshId.slice(0, markerIndex);
      if (linkPath.endsWith('/visuals') || linkPath.endsWith('/collisions') || linkPath.endsWith('/colliders')) {
        const parentSlash = linkPath.lastIndexOf('/');
        if (parentSlash > 0) {
          linkPath = linkPath.slice(0, parentSlash);
        }
      }
      if (linkPath) {
        return linkPath;
      }
    }
  }

  const candidates = [descriptor.resolvedPrimPath, descriptor.meshId];
  for (const candidate of candidates) {
    const normalized = normalizeUsdPath(candidate || '');
    if (!normalized) continue;

    const authoredPathMatch = normalized.match(/^(.*?)(?:\/(?:visuals?|coll(?:isions?|iders?)))(?:$|[/.])/i);
    if (authoredPathMatch?.[1]) {
      return normalizeUsdPath(authoredPathMatch[1]);
    }
  }

  return '';
}

function getDescriptorRole(descriptor: SnapshotMeshDescriptor): DescriptorRole {
  const sectionName = String(descriptor.sectionName || '').trim().toLowerCase();
  if (sectionName === 'collisions' || sectionName === 'collision') {
    return 'collision';
  }

  const candidateText = `${descriptor.meshId || ''} ${descriptor.resolvedPrimPath || ''}`.toLowerCase();
  return /\/coll(?:isions?|iders?)(?:$|[/.])/.test(candidateText) ? 'collision' : 'visual';
}

function parseDescriptorOrdinal(descriptor: SnapshotMeshDescriptor, fallbackIndex: number): number {
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

function getDescriptorRanges(
  descriptor: SnapshotMeshDescriptor,
  buffers: SnapshotBuffers | null | undefined,
): MeshDescriptorRanges | null {
  if (descriptor.ranges) {
    return descriptor.ranges;
  }

  const meshId = normalizeUsdPath(descriptor.meshId || '');
  if (!meshId) return null;
  return buffers?.rangesByMeshId?.[meshId] || null;
}

function readRangeValues(source: ArrayLike<number> | null | undefined, range: MeshRange | null | undefined): number[] {
  if (!source || !range) return [];
  const offset = Math.max(0, Number(range.offset || 0));
  const count = Math.max(0, Number(range.count || 0));
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => Number(source[offset + index] || 0));
}

function formatObjNumber(value: number): string {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  const fixed = Number(normalized.toFixed(6));
  return Number.isInteger(fixed) ? String(fixed) : String(fixed);
}

function hasNonIdentityOrigin(
  origin: Pick<NonNullable<UrdfVisual['origin']>, 'xyz' | 'rpy'> | null | undefined,
): boolean {
  if (!origin) {
    return false;
  }

  return Math.abs(origin.xyz?.x || 0) > 1e-9
    || Math.abs(origin.xyz?.y || 0) > 1e-9
    || Math.abs(origin.xyz?.z || 0) > 1e-9
    || Math.abs(origin.rpy?.r || 0) > 1e-9
    || Math.abs(origin.rpy?.p || 0) > 1e-9
    || Math.abs(origin.rpy?.y || 0) > 1e-9;
}

function cloneVisualOrigin(
  origin: NonNullable<UrdfVisual['origin']> | null | undefined,
): NonNullable<UrdfVisual['origin']> {
  return {
    xyz: {
      x: origin?.xyz?.x || 0,
      y: origin?.xyz?.y || 0,
      z: origin?.xyz?.z || 0,
    },
    rpy: {
      r: origin?.rpy?.r || 0,
      p: origin?.rpy?.p || 0,
      y: origin?.rpy?.y || 0,
    },
  };
}

function originsApproximatelyEqual(
  left: NonNullable<UrdfVisual['origin']> | null | undefined,
  right: NonNullable<UrdfVisual['origin']> | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return Math.abs((left.xyz?.x || 0) - (right.xyz?.x || 0)) <= ORIGIN_EPSILON
    && Math.abs((left.xyz?.y || 0) - (right.xyz?.y || 0)) <= ORIGIN_EPSILON
    && Math.abs((left.xyz?.z || 0) - (right.xyz?.z || 0)) <= ORIGIN_EPSILON
    && Math.abs((left.rpy?.r || 0) - (right.rpy?.r || 0)) <= ORIGIN_EPSILON
    && Math.abs((left.rpy?.p || 0) - (right.rpy?.p || 0)) <= ORIGIN_EPSILON
    && Math.abs((left.rpy?.y || 0) - (right.rpy?.y || 0)) <= ORIGIN_EPSILON;
}

function stripSyntheticMeshApproximationOrigin(
  geometry: UrdfVisual | null | undefined,
  descriptor: SnapshotMeshDescriptor,
  snapshot: UsdExportSnapshot,
): UrdfVisual | null | undefined {
  if (!geometry?.origin || geometry.type === GeometryType.NONE) {
    return geometry;
  }

  if (resolvePrimitiveGeometryFromDescriptor(descriptor, geometry)) {
    return geometry;
  }

  const approximation = resolveUsdMeshApproximationGeometry(snapshot, descriptor);
  if (!approximation?.origin || !originsApproximatelyEqual(geometry.origin, approximation.origin)) {
    return geometry;
  }

  return {
    ...geometry,
    origin: {
      xyz: { x: 0, y: 0, z: 0 },
      rpy: { r: 0, p: 0, y: 0 },
    },
  };
}

function buildObjBlobFromDescriptor(
  descriptor: ExportDescriptor,
  buffers: SnapshotBuffers | null | undefined,
): Blob | null {
  const ranges = getDescriptorRanges(descriptor.descriptor, buffers);
  const positionValues = readRangeValues(buffers?.positions, ranges?.positions);
  if (positionValues.length < 9) {
    return null;
  }

  const indexValues = readRangeValues(buffers?.indices, ranges?.indices).map((value) => Number(value));
  const transformValues = readRangeValues(buffers?.transforms, ranges?.transform);

  const transform = transformValues.length >= 16
    ? new Matrix4().fromArray(transformValues.slice(0, 16))
    : null;
  const shouldBakeTransform = descriptor.bakeTransformIntoMesh !== false;
  const tempVector = new Vector3();
  const vertexColor = descriptor.displayColor || null;

  const lines: string[] = [`o ${sanitizeFileToken(`${descriptor.linkId}_${descriptor.role}_${descriptor.ordinal}`)}`];

  for (let index = 0; index + 2 < positionValues.length; index += 3) {
    tempVector.set(positionValues[index], positionValues[index + 1], positionValues[index + 2]);
    if (transform && shouldBakeTransform) {
      tempVector.applyMatrix4(transform);
    }
    lines.push(vertexColor
      ? `v ${formatObjNumber(tempVector.x)} ${formatObjNumber(tempVector.y)} ${formatObjNumber(tempVector.z)} ${formatObjNumber(vertexColor[0])} ${formatObjNumber(vertexColor[1])} ${formatObjNumber(vertexColor[2])}`
      : `v ${formatObjNumber(tempVector.x)} ${formatObjNumber(tempVector.y)} ${formatObjNumber(tempVector.z)}`);
  }

  const vertexCount = Math.floor(positionValues.length / 3);
  const fullTriangleIndices = indexValues.length >= 3
    ? indexValues
    : Array.from({ length: vertexCount }, (_, index) => index);
  const triangleIndices = descriptor.subsetSection
    ? (() => {
        const start = Math.max(0, Math.min(fullTriangleIndices.length, descriptor.subsetSection.start));
        const end = Math.max(start, Math.min(fullTriangleIndices.length, start + descriptor.subsetSection.length));
        const sliced = fullTriangleIndices.slice(start, end);
        return sliced.length >= 3 ? sliced : [];
      })()
    : fullTriangleIndices;

  for (let index = 0; index + 2 < triangleIndices.length; index += 3) {
    const a = Number(triangleIndices[index]) + 1;
    const b = Number(triangleIndices[index + 1]) + 1;
    const c = Number(triangleIndices[index + 2]) + 1;
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      continue;
    }
    lines.push(`f ${a} ${b} ${c}`);
  }

  if (!lines.some((line) => line.startsWith('f '))) {
    return null;
  }

  return new Blob([`${lines.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
}

function cloneRobotState(input: RobotLike): RobotState {
  const cloned = structuredClone(input) as RobotLike;
  return {
    ...cloned,
    selection: 'selection' in cloned
      ? { ...(cloned.selection || { type: null, id: null }) }
      : { type: null, id: null },
  };
}

function fillMeshPath(current: UrdfVisual, fallback?: UrdfVisual): UrdfVisual {
  if (current.type !== GeometryType.MESH) {
    return current;
  }

  if (current.meshPath || !fallback?.meshPath) {
    return current;
  }

  return {
    ...current,
    meshPath: fallback.meshPath,
  };
}

function mergeGeometryWithSnapshot(current: UrdfVisual | undefined, fallback?: UrdfVisual): UrdfVisual | undefined {
  if (!current) {
    return fallback;
  }

  if (!fallback) {
    return current;
  }

  if (current.type === GeometryType.NONE && fallback.type !== GeometryType.NONE) {
    return fallback;
  }

  return fillMeshPath(current, fallback);
}

function mergeLinkWithSnapshotMeshPaths(current: UrdfLink, fallback?: UrdfLink): UrdfLink {
  if (!fallback) {
    return current;
  }

  const fallbackBodies = fallback.collisionBodies || [];
  const currentBodies = current.collisionBodies || [];
  const mergedBodyCount = Math.max(currentBodies.length, fallbackBodies.length);
  const mergedBodies = mergedBodyCount > 0
    ? Array.from({ length: mergedBodyCount }, (_, index) => {
        const currentBody = currentBodies[index];
        const fallbackBody = fallbackBodies[index];
        if (currentBody && fallbackBody) {
          return mergeGeometryWithSnapshot(currentBody, fallbackBody);
        }
        return currentBody || fallbackBody;
      }).filter(Boolean) as UrdfVisual[]
    : current.collisionBodies;

  return {
    ...fallback,
    ...current,
    visual: mergeGeometryWithSnapshot(current.visual, fallback.visual) || current.visual,
    collision: mergeGeometryWithSnapshot(current.collision, fallback.collision) || current.collision,
    collisionBodies: mergedBodies,
  };
}

function mergeCurrentRobotWithSnapshotMeshPaths(
  currentRobot: RobotLike,
  snapshotRobot: RobotState,
): RobotState {
  const baseRobot = cloneRobotState(currentRobot);
  const mergedLinks: Record<string, UrdfLink> = {};
  const linkIds = new Set([
    ...Object.keys(snapshotRobot.links),
    ...Object.keys(baseRobot.links),
  ]);

  linkIds.forEach((linkId) => {
    const currentLink = baseRobot.links[linkId];
    const snapshotLink = snapshotRobot.links[linkId];
    if (currentLink && snapshotLink) {
      mergedLinks[linkId] = mergeLinkWithSnapshotMeshPaths(currentLink, snapshotLink);
      return;
    }
    mergedLinks[linkId] = currentLink || snapshotLink;
  });

  return {
    ...snapshotRobot,
    ...baseRobot,
    rootLinkId: snapshotRobot.rootLinkId && mergedLinks[snapshotRobot.rootLinkId]
      ? snapshotRobot.rootLinkId
      : baseRobot.rootLinkId,
    links: mergedLinks,
    joints: {
      ...snapshotRobot.joints,
      ...baseRobot.joints,
    },
    materials: {
      ...(snapshotRobot.materials || {}),
      ...(baseRobot.materials || {}),
    },
    closedLoopConstraints: baseRobot.closedLoopConstraints || snapshotRobot.closedLoopConstraints,
    selection: 'selection' in currentRobot
      ? { ...((currentRobot as RobotState).selection || { type: null, id: null }) }
      : { type: null, id: null },
  };
}

function isSyntheticWorldLink(link: UrdfLink | undefined): boolean {
  if (!link) {
    return false;
  }

  return link.visual.type === GeometryType.NONE
    && link.collision.type === GeometryType.NONE
    && (link.inertial?.mass || 0) <= 1e-9;
}

function stripSyntheticWorldRootForExport(robot: RobotState): RobotState {
  if (robot.rootLinkId !== 'world' || !isSyntheticWorldLink(robot.links.world)) {
    return robot;
  }

  const worldChildJoints = Object.values(robot.joints).filter((joint) => (
    joint.parentLinkId === 'world'
  ));
  if (worldChildJoints.length !== 1) {
    return robot;
  }

  const rootAnchorJoint = worldChildJoints[0];
  if (rootAnchorJoint.type !== JointType.FIXED || !robot.links[rootAnchorJoint.childLinkId]) {
    return robot;
  }

  if (hasNonIdentityOrigin(rootAnchorJoint.origin)) {
    return robot;
  }

  const nextLinks = { ...robot.links };
  delete nextLinks.world;

  const nextJoints = { ...robot.joints };
  delete nextJoints[rootAnchorJoint.id];

  return {
    ...robot,
    rootLinkId: rootAnchorJoint.childLinkId,
    links: nextLinks,
    joints: nextJoints,
  };
}

function resolveUsdExportResolution(
  snapshot: UsdExportSnapshot,
  options: {
    fileName?: string;
    resolution?: ViewerRobotDataResolution | null;
    targetWindow?: SnapshotHost;
  } = {},
): ViewerRobotDataResolution | null {
  if (options.resolution) {
    return options.resolution;
  }

  const initialResolution = adaptUsdViewerSnapshotToRobotData(snapshot, {
    fileName: options.fileName,
  });
  if (!initialResolution) {
    return null;
  }

  const host = options.targetWindow ?? (typeof window !== 'undefined' ? (window as SnapshotHost) : null);
  const hydratedResolution = hydrateUsdViewerRobotResolutionFromRuntime(
    initialResolution,
    snapshot,
    host?.renderInterface,
  );

  return hydratedResolution || initialResolution;
}

function ensureMeshDimensions(dimensions: UrdfVisual['dimensions'] | null | undefined): UrdfVisual['dimensions'] {
  if (!dimensions) {
    return { x: 1, y: 1, z: 1 };
  }

  const values = [dimensions.x, dimensions.y, dimensions.z];
  const hasMeaningfulDimension = values.some((value) => Number.isFinite(value) && Math.abs(value) > 1e-9);
  return hasMeaningfulDimension
    ? dimensions
    : { x: 1, y: 1, z: 1 };
}

function getSnapshotMaterialLookup(snapshot: UsdExportSnapshot): Map<string, SnapshotMaterialRecord> {
  const lookup = new Map<string, SnapshotMaterialRecord>();
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

function getSnapshotPreferredVisualMaterialLookup(
  snapshot: UsdExportSnapshot,
): Map<string, SnapshotMaterialRecord> {
  const lookup = new Map<string, SnapshotMaterialRecord>();
  const rawLookup = snapshot.render?.preferredVisualMaterialsByLinkPath;
  if (!rawLookup || typeof rawLookup !== 'object') {
    return lookup;
  }

  Object.entries(rawLookup).forEach(([linkPath, record]) => {
    const normalizedLinkPath = normalizeUsdPath(linkPath);
    if (!normalizedLinkPath || !record || typeof record !== 'object') {
      return;
    }
    lookup.set(normalizedLinkPath, record);
  });

  return lookup;
}

function serializeLivePreferredMaterialRecord(material: unknown): SnapshotMaterialRecord | null {
  if (!material || typeof material !== 'object') {
    return null;
  }

  const candidate = material as {
    name?: unknown;
    opacity?: unknown;
    color?: { r?: unknown; g?: unknown; b?: unknown } | null;
    map?: { name?: unknown } | null;
  };

  const name = String(candidate.name || '').trim();
  const opacity = Number(candidate.opacity);
  const color = candidate.color && typeof candidate.color === 'object'
    ? [candidate.color.r, candidate.color.g, candidate.color.b]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    : null;
  const mapPath = String(candidate.map?.name || '').trim();

  if (!name && !mapPath && !color?.length && !Number.isFinite(opacity)) {
    return null;
  }

  return {
    ...(name ? { name } : {}),
    ...(color && color.length === 3 ? { color } : {}),
    ...(Number.isFinite(opacity) ? { opacity } : {}),
    ...(mapPath ? { mapPath } : {}),
  };
}

function enrichSnapshotWithLivePreferredMaterials(
  snapshot: UsdExportSnapshot,
  host: SnapshotHost,
): UsdExportSnapshot {
  const renderInterface = host?.renderInterface;
  if (typeof renderInterface?.getPreferredVisualMaterialForLink !== 'function') {
    return snapshot;
  }

  const preferredByLinkPath: Record<string, SnapshotMaterialRecord> = {
    ...(snapshot.render?.preferredVisualMaterialsByLinkPath || {}),
  };
  let changed = false;

  Array.from(snapshot.render?.meshDescriptors || []).forEach((descriptor) => {
    if (getDescriptorRole(descriptor) !== 'visual') {
      return;
    }

    const linkPath = normalizeUsdPath(getDescriptorLinkPath(descriptor));
    if (!linkPath) {
      return;
    }

    const liveRecord = serializeLivePreferredMaterialRecord(
      renderInterface.getPreferredVisualMaterialForLink(linkPath, null),
    );
    if (!liveRecord) {
      return;
    }

    preferredByLinkPath[linkPath] = liveRecord;
    changed = true;
  });

  if (!changed) {
    return snapshot;
  }

  return {
    ...snapshot,
    render: {
      ...(snapshot.render || {}),
      preferredVisualMaterialsByLinkPath: preferredByLinkPath,
    },
  };
}

function shouldAdoptSnapshotMaterialColor(color: string | null | undefined): boolean {
  return shouldAdoptSnapshotColor(color)
    || String(color || '').trim().length === 0;
}

function mergeLinkMaterial(
  robot: RobotState,
  linkId: string,
  payload: { color?: string; texture?: string },
): void {
  if (!payload.color && !payload.texture) {
    return;
  }

  const current = robot.materials?.[linkId] || {};
  const nextColor = payload.color && shouldAdoptSnapshotMaterialColor(current.color)
    ? payload.color
    : current.color;
  const nextTexture = current.texture || payload.texture;

  if (!nextColor && !nextTexture) {
    return;
  }

  robot.materials = {
    ...(robot.materials || {}),
    [linkId]: {
      ...(current || {}),
      ...(nextColor ? { color: nextColor } : {}),
      ...(nextTexture ? { texture: nextTexture } : {}),
    },
  };
}

function applySnapshotMaterialRecordToLink(
  robot: RobotState,
  linkId: string,
  material: SnapshotMaterialRecord | null | undefined,
): boolean {
  const color = colorArrayToHex(material?.color, material?.opacity);
  const texture = material?.mapPath ? String(material.mapPath).trim() || undefined : undefined;

  if (!color && !texture) {
    return false;
  }

  const link = robot.links[linkId];
  if (!link) {
    return false;
  }

  if (color && shouldAdoptSnapshotColor(link.visual.color)) {
    link.visual = {
      ...link.visual,
      color,
      materialSource: 'named',
    };
  }

  mergeLinkMaterial(robot, linkId, {
    ...(color ? { color } : {}),
    ...(texture ? { texture } : {}),
  });

  return true;
}

function getDescriptorMaterialRecord(
  descriptor: Pick<ExportDescriptor, 'descriptor' | 'materialIdOverride'> | SnapshotMeshDescriptor,
  materialLookup: Map<string, SnapshotMaterialRecord>,
): SnapshotMaterialRecord | null {
  const sourceDescriptor = 'descriptor' in descriptor
    ? descriptor.descriptor
    : descriptor;
  const materialIdOverride = 'materialIdOverride' in descriptor
    ? descriptor.materialIdOverride
    : null;
  const materialId = getDescriptorMaterialId(sourceDescriptor, materialIdOverride);
  if (!materialId) {
    return null;
  }

  return materialLookup.get(materialId) || null;
}

function applyDescriptorMaterialToLink(
  robot: RobotState,
  linkId: string,
  descriptor: ExportDescriptor,
  materialLookup: Map<string, SnapshotMaterialRecord>,
): boolean {
  const material = getDescriptorMaterialRecord(descriptor, materialLookup);
  if (!material) {
    return false;
  }

  return applySnapshotMaterialRecordToLink(robot, linkId, material);
}

function buildFixedChildLinksByParent(robot: RobotState): Map<string, string[]> {
  const result = new Map<string, string[]>();

  Object.values(robot.joints).forEach((joint) => {
    if (joint.type !== JointType.FIXED) {
      return;
    }

    const list = result.get(joint.parentLinkId) || [];
    list.push(joint.childLinkId);
    result.set(joint.parentLinkId, list);
  });

  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getGeomSuffixOrder(candidate: string, parentLinkId: string, parentName: string): number {
  const patterns = [
    new RegExp(`^${escapeRegExp(parentLinkId)}_geom_(\\d+)$`),
    new RegExp(`^${escapeRegExp(parentName)}_geom_(\\d+)$`),
  ];

  for (const pattern of patterns) {
    const match = candidate.match(pattern);
    if (match) {
      const numeric = Number(match[1]);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }

  return Number.POSITIVE_INFINITY;
}

function getLinkSemanticCandidates(link: UrdfLink): string[] {
  const candidates = [
    normalizeSemanticToken(link.id),
    normalizeSemanticToken(link.name),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

function scoreDescriptorAgainstLink(descriptor: SnapshotMeshDescriptor, link: UrdfLink): number {
  const descriptorToken = normalizeSemanticToken(getDescriptorSemanticName(descriptor));
  if (!descriptorToken) {
    return 0;
  }

  let bestScore = 0;
  getLinkSemanticCandidates(link).forEach((candidate) => {
    if (candidate === descriptorToken) {
      bestScore = Math.max(bestScore, 8);
      return;
    }

    if (candidate.endsWith(`_${descriptorToken}`) || candidate.startsWith(`${descriptorToken}_`)) {
      bestScore = Math.max(bestScore, 6);
      return;
    }

    if (candidate.includes(descriptorToken) || descriptorToken.includes(candidate)) {
      bestScore = Math.max(bestScore, 4);
    }
  });

  return bestScore;
}

function isVisualAttachmentLink(link: UrdfLink | undefined, parentLinkId: string, parentName: string): boolean {
  if (!link) {
    return false;
  }

  const zeroMass = (link.inertial?.mass || 0) <= 1e-9;
  const visualPresent = link.visual.type !== GeometryType.NONE;
  const collisionOnly = link.visual.type === GeometryType.NONE && link.collision.type !== GeometryType.NONE;
  const syntheticName = getGeomSuffixOrder(link.id, parentLinkId, parentName) !== Number.POSITIVE_INFINITY
    || getGeomSuffixOrder(link.name, parentLinkId, parentName) !== Number.POSITIVE_INFINITY;

  return !collisionOnly && (syntheticName || (zeroMass && visualPresent));
}

function sortVisualAttachmentLinkIds(robot: RobotState, parentLinkId: string, candidateIds: string[]): string[] {
  const parent = robot.links[parentLinkId];
  const parentName = parent?.name || parentLinkId;

  return [...candidateIds].sort((leftId, rightId) => {
    const leftLink = robot.links[leftId];
    const rightLink = robot.links[rightId];
    const leftOrder = getGeomSuffixOrder(leftId, parentLinkId, parentName);
    const rightOrder = getGeomSuffixOrder(rightId, parentLinkId, parentName);

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const leftName = leftLink?.name || leftId;
    const rightName = rightLink?.name || rightId;
    return leftName.localeCompare(rightName);
  });
}

function collectVisualAttachmentLinkIds(
  robot: RobotState,
  parentLinkId: string,
  fixedChildrenByParent: Map<string, string[]>,
): string[] {
  const parent = robot.links[parentLinkId];
  if (!parent) {
    return [];
  }

  const childIds = (fixedChildrenByParent.get(parentLinkId) || []).filter((childId) => (
    isVisualAttachmentLink(robot.links[childId], parentLinkId, parent.name)
  ));

  return [
    parentLinkId,
    ...sortVisualAttachmentLinkIds(robot, parentLinkId, childIds),
  ];
}

function createUniqueRobotRecordKey(
  existing: Record<string, unknown>,
  preferredKeys: string[],
  fallbackKey: string,
): string {
  const candidates = [...preferredKeys, fallbackKey]
    .map((value) => sanitizeFileToken(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (!existing[candidate]) {
      return candidate;
    }
  }

  const base = sanitizeFileToken(fallbackKey);
  let suffix = 2;
  while (existing[`${base}_${suffix}`]) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

function createSyntheticVisualAttachmentLink(
  robot: RobotState,
  parentLinkId: string,
  descriptor: SnapshotMeshDescriptor,
  ordinal: number,
): string {
  const descriptorToken = normalizeSemanticToken(getDescriptorSemanticName(descriptor));
  const linkId = createUniqueRobotRecordKey(
    robot.links,
    [
      descriptorToken ? `${descriptorToken}_link` : '',
      descriptorToken ? `${parentLinkId}_${descriptorToken}` : '',
    ],
    `${parentLinkId}_geom_${ordinal}`,
  );
  const jointId = createUniqueRobotRecordKey(
    robot.joints,
    [`fixed_${linkId}`],
    `${parentLinkId}_fixed_${linkId}`,
  );

  robot.links[linkId] = {
    ...DEFAULT_LINK,
    id: linkId,
    name: linkId,
    visual: {
      ...DEFAULT_LINK.visual,
      type: GeometryType.MESH,
      dimensions: { x: 1, y: 1, z: 1 },
      origin: { ...DEFAULT_LINK.visual.origin },
    },
    collision: {
      ...DEFAULT_LINK.collision,
      type: GeometryType.NONE,
      dimensions: { x: 0, y: 0, z: 0 },
      origin: { ...DEFAULT_LINK.collision.origin },
    },
    inertial: {
      ...DEFAULT_LINK.inertial,
      mass: 0,
    },
  };

  robot.joints[jointId] = {
    ...DEFAULT_JOINT,
    id: jointId,
    name: jointId,
    type: JointType.FIXED,
    parentLinkId,
    childLinkId: linkId,
    origin: {
      xyz: { x: 0, y: 0, z: 0 },
      rpy: { r: 0, p: 0, y: 0 },
    },
    axis: { x: 0, y: 0, z: 1 },
    limit: undefined as UrdfJoint['limit'],
  };

  return linkId;
}

function assignVisualDescriptorToLink(
  snapshot: UsdExportSnapshot,
  robot: RobotState,
  linkId: string,
  entry: ExportDescriptor,
  descriptorByPath: Map<string, ExportDescriptor>,
  materialLookup: Map<string, SnapshotMaterialRecord>,
  preferredMaterialRecord?: SnapshotMaterialRecord | null,
  allowPreferredMaterialFallback: boolean = false,
): void {
  const link = robot.links[linkId];
  if (!link) {
    return;
  }

  const descriptorMaterialRecord = getDescriptorMaterialRecord(entry, materialLookup);
  const preferredFallbackColor = allowPreferredMaterialFallback
    ? colorArrayToVertexColor(preferredMaterialRecord?.color)
    : null;
  entry.displayColor = colorArrayToVertexColor(descriptorMaterialRecord?.color) || preferredFallbackColor;

  const primitiveGeometry = resolvePrimitiveGeometryFromDescriptor(entry.descriptor, link.visual);
  if (primitiveGeometry) {
    link.visual = {
      ...DEFAULT_LINK.visual,
      ...(link.visual || {}),
      ...primitiveGeometry,
      meshPath: undefined,
      origin: link.visual?.origin || { ...DEFAULT_LINK.visual.origin },
    };
    const appliedMaterial = applyDescriptorMaterialToLink(robot, linkId, entry, materialLookup);
    if (!appliedMaterial && allowPreferredMaterialFallback) {
      applySnapshotMaterialRecordToLink(robot, linkId, preferredMaterialRecord);
    }
    return;
  }

  const visual = stripSyntheticMeshApproximationOrigin(link.visual, entry.descriptor, snapshot) || link.visual;
  link.visual = {
    ...DEFAULT_LINK.visual,
    ...(visual || {}),
    type: GeometryType.MESH,
    meshPath: entry.exportPath,
    dimensions: ensureMeshDimensions(visual?.dimensions),
    origin: visual?.origin || { ...DEFAULT_LINK.visual.origin },
  };
  entry.bakeTransformIntoMesh = !hasNonIdentityOrigin(link.visual.origin);
  descriptorByPath.set(entry.exportPath, entry);
  const appliedMaterial = applyDescriptorMaterialToLink(robot, linkId, entry, materialLookup);
  if (!appliedMaterial && allowPreferredMaterialFallback) {
    applySnapshotMaterialRecordToLink(robot, linkId, preferredMaterialRecord);
  }
}

function assignCollisionDescriptorToLink(
  snapshot: UsdExportSnapshot,
  robot: RobotState,
  linkId: string,
  entry: ExportDescriptor,
  descriptorByPath: Map<string, ExportDescriptor>,
  collisionIndex: number,
): void {
  const link = robot.links[linkId];
  if (!link) {
    return;
  }

  const currentCollision = collisionIndex === 0
    ? link.collision
    : link.collisionBodies?.[collisionIndex - 1];
  const primitiveGeometry = resolvePrimitiveGeometryFromDescriptor(entry.descriptor, currentCollision);
  if (primitiveGeometry) {
    const nextCollision = {
      ...DEFAULT_LINK.collision,
      ...(currentCollision || {}),
      ...primitiveGeometry,
      meshPath: undefined,
      origin: currentCollision?.origin || { ...DEFAULT_LINK.collision.origin },
    };

    if (collisionIndex === 0) {
      link.collision = nextCollision;
      return;
    }

    const bodies = [...(link.collisionBodies || [])];
    bodies[collisionIndex - 1] = nextCollision;
    link.collisionBodies = bodies;
    return;
  }

  const sanitizedCollision = stripSyntheticMeshApproximationOrigin(currentCollision, entry.descriptor, snapshot)
    || currentCollision;
  if (collisionIndex === 0) {
    link.collision = {
      ...DEFAULT_LINK.collision,
      ...(sanitizedCollision || {}),
      type: GeometryType.MESH,
      meshPath: entry.exportPath,
      dimensions: ensureMeshDimensions(sanitizedCollision?.dimensions),
      origin: sanitizedCollision?.origin || { ...DEFAULT_LINK.collision.origin },
    };
    entry.bakeTransformIntoMesh = !hasNonIdentityOrigin(link.collision.origin);
    descriptorByPath.set(entry.exportPath, entry);
    return;
  }

  const bodies = [...(link.collisionBodies || [])];
  const currentBody = sanitizedCollision;
  bodies[collisionIndex - 1] = {
    ...DEFAULT_LINK.collision,
    ...(currentBody || {}),
    type: GeometryType.MESH,
    meshPath: entry.exportPath,
    dimensions: ensureMeshDimensions(currentBody?.dimensions),
    origin: currentBody?.origin || { ...DEFAULT_LINK.collision.origin },
  };
  link.collisionBodies = bodies;
  entry.bakeTransformIntoMesh = !hasNonIdentityOrigin(bodies[collisionIndex - 1]?.origin);
  descriptorByPath.set(entry.exportPath, entry);
}

function assignLinkDescriptors(
  snapshot: UsdExportSnapshot,
  robot: RobotState,
  linkId: string,
  linkPath: string,
  visualDescriptors: ExportDescriptor[],
  collisionDescriptors: ExportDescriptor[],
  descriptorByPath: Map<string, ExportDescriptor>,
  materialLookup: Map<string, SnapshotMaterialRecord>,
  preferredMaterialLookup: Map<string, SnapshotMaterialRecord>,
  fixedChildrenByParent: Map<string, string[]>,
): void {
  if (!robot.links[linkId]) {
    return;
  }

  const visualLinkIds = collectVisualAttachmentLinkIds(robot, linkId, fixedChildrenByParent);
  const usedVisualLinkIds = new Set<string>();
  const preferredMaterialRecord = preferredMaterialLookup.get(normalizeUsdPath(linkPath)) || null;

  visualDescriptors.forEach((entry, index) => {
    let targetLinkId: string | undefined;

    if (index === 0) {
      targetLinkId = linkId;
    } else {
      const availableLinkIds = visualLinkIds.filter((candidateId) => (
        candidateId !== linkId && !usedVisualLinkIds.has(candidateId)
      ));

      let bestMatchId: string | undefined;
      let bestScore = 0;
      availableLinkIds.forEach((candidateId) => {
        const candidateLink = robot.links[candidateId];
        const score = candidateLink ? scoreDescriptorAgainstLink(entry.descriptor, candidateLink) : 0;
        if (score > bestScore) {
          bestScore = score;
          bestMatchId = candidateId;
        }
      });

      targetLinkId = bestMatchId || availableLinkIds[0];
      if (!targetLinkId) {
        targetLinkId = createSyntheticVisualAttachmentLink(robot, linkId, entry.descriptor, index);
        visualLinkIds.push(targetLinkId);
        const children = fixedChildrenByParent.get(linkId) || [];
        children.push(targetLinkId);
        fixedChildrenByParent.set(linkId, children);
      }
    }

    if (entry.subsetSection && targetLinkId !== linkId) {
      const sourceOrigin = robot.links[linkId]?.visual?.origin;
      const targetLink = robot.links[targetLinkId];
      if (
        targetLink
        && hasNonIdentityOrigin(sourceOrigin)
        && !hasNonIdentityOrigin(targetLink.visual.origin)
      ) {
        targetLink.visual = {
          ...targetLink.visual,
          origin: cloneVisualOrigin(sourceOrigin),
        };
      }
    }

    usedVisualLinkIds.add(targetLinkId);
    assignVisualDescriptorToLink(
      snapshot,
      robot,
      targetLinkId,
      entry,
      descriptorByPath,
      materialLookup,
      preferredMaterialRecord,
      index === 0 && targetLinkId === linkId,
    );
  });

  collisionDescriptors.forEach((entry, index) => {
    assignCollisionDescriptorToLink(snapshot, robot, linkId, entry, descriptorByPath, index);
  });
}

function collectReferencedMeshPaths(robot: RobotState): Set<string> {
  const referenced = new Set<string>();

  Object.values(robot.links).forEach((link) => {
    if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
      referenced.add(link.visual.meshPath);
    }
    if (link.collision.type === GeometryType.MESH && link.collision.meshPath) {
      referenced.add(link.collision.meshPath);
    }
    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH && body.meshPath) {
        referenced.add(body.meshPath);
      }
    });
  });

  return referenced;
}

function createDescriptorExportMap(
  snapshot: UsdExportSnapshot,
  resolution: ViewerRobotDataResolution,
  currentRobot?: RobotLike | null,
): {
  robot: RobotState;
  descriptorByPath: Map<string, ExportDescriptor>;
} {
  const snapshotRobot = cloneRobotState({
    ...resolution.robotData,
    selection: { type: null, id: null },
  });
  const baseRobot = currentRobot
    ? mergeCurrentRobotWithSnapshotMeshPaths(currentRobot, snapshotRobot)
    : snapshotRobot;
  const descriptors = Array.from(snapshot.render?.meshDescriptors || []);
  const descriptorsByLinkRole = new Map<string, ExportDescriptor[]>();
  const materialLookup = getSnapshotMaterialLookup(snapshot);
  const preferredMaterialLookup = getSnapshotPreferredVisualMaterialLookup(snapshot);

  descriptors.forEach((descriptor, index) => {
    const linkPath = getDescriptorLinkPath(descriptor);
    if (!linkPath) return;

    const linkId = resolution.linkIdByPath[linkPath];
    if (!linkId) return;

    const role = getDescriptorRole(descriptor);
    const ordinal = parseDescriptorOrdinal(descriptor, index);
    const key = `${linkId}:${role}`;
    const current = descriptorsByLinkRole.get(key) || [];
    const geomSubsetSections = role === 'visual'
      ? getDescriptorGeomSubsetSections(descriptor)
      : [];
    const expandedEntries = geomSubsetSections.length > 0
      ? geomSubsetSections.map((subsetSection, subsetIndex) => {
          const hasMultipleSubsets = geomSubsetSections.length > 1;
          return {
            descriptor,
            meshId: normalizeUsdPath(descriptor.meshId || ''),
            linkPath,
            linkId,
            role,
            exportPath: `${sanitizeFileToken(linkId)}_${role}_${ordinal}${hasMultipleSubsets ? `_section_${subsetIndex}` : ''}.obj`,
            ordinal,
            subsetIndex,
            subsetSection,
            materialIdOverride: subsetSection.materialId || null,
          } satisfies ExportDescriptor;
        })
      : [{
          descriptor,
          meshId: normalizeUsdPath(descriptor.meshId || ''),
          linkPath,
          linkId,
          role,
          exportPath: `${sanitizeFileToken(linkId)}_${role}_${ordinal}.obj`,
          ordinal,
          subsetIndex: 0,
          subsetSection: null,
          materialIdOverride: null,
        } satisfies ExportDescriptor];

    current.push(...expandedEntries);
    descriptorsByLinkRole.set(key, current);
  });

  descriptorsByLinkRole.forEach((entries) => {
    entries.sort((left, right) => {
      if (left.ordinal !== right.ordinal) {
        return left.ordinal - right.ordinal;
      }
      if ((left.subsetIndex || 0) !== (right.subsetIndex || 0)) {
        return (left.subsetIndex || 0) - (right.subsetIndex || 0);
      }
      return left.meshId.localeCompare(right.meshId);
    });
  });

  const descriptorByPath = new Map<string, ExportDescriptor>();
  const fixedChildrenByParent = buildFixedChildLinksByParent(baseRobot);

  Object.entries(resolution.linkIdByPath).forEach(([linkPath, linkId]) => {
    assignLinkDescriptors(
      snapshot,
      baseRobot,
      linkId,
      linkPath,
      descriptorsByLinkRole.get(`${linkId}:visual`) || [],
      descriptorsByLinkRole.get(`${linkId}:collision`) || [],
      descriptorByPath,
      materialLookup,
      preferredMaterialLookup,
      fixedChildrenByParent,
    );
  });

  return {
    robot: stripSyntheticWorldRootForExport(baseRobot),
    descriptorByPath,
  };
}

export function getCurrentUsdViewerSceneSnapshot(
  options: { stageSourcePath?: string | null; targetWindow?: SnapshotHost } = {},
): UsdExportSnapshot | null {
  const host = options.targetWindow ?? (typeof window !== 'undefined' ? (window as SnapshotHost) : null);
  for (const stageSourcePath of buildUsdSnapshotLookupPaths(options.stageSourcePath)) {
    const snapshot = host?.renderInterface?.getCachedRobotSceneSnapshot?.(stageSourcePath);
    if (snapshot && typeof snapshot === 'object') {
      return enrichSnapshotWithLivePreferredMaterials(snapshot as UsdExportSnapshot, host);
    }
  }

  return null;
}

export function resolveUsdExportSceneSnapshot(
  options: {
    stageSourcePath?: string | null;
    cachedSnapshot?: UsdExportSnapshot | null;
    targetWindow?: SnapshotHost;
  } = {},
): UsdExportSnapshot | null {
  const host = options.targetWindow ?? (typeof window !== 'undefined' ? (window as SnapshotHost) : null);
  if (options.cachedSnapshot && typeof options.cachedSnapshot === 'object') {
    return enrichSnapshotWithLivePreferredMaterials(options.cachedSnapshot, host);
  }

  return getCurrentUsdViewerSceneSnapshot({
    stageSourcePath: options.stageSourcePath,
    targetWindow: host,
  });
}

export function prepareUsdExportCacheFromSnapshot(
  snapshot: UsdExportSnapshot,
  options: {
    fileName?: string;
    resolution?: ViewerRobotDataResolution | null;
    targetWindow?: SnapshotHost;
  } = {},
): (UsdPreparedExportCache & { resolution: ViewerRobotDataResolution }) | null {
  const resolution = resolveUsdExportResolution(snapshot, options);

  if (!resolution) {
    return null;
  }

  const { robot: snapshotRobot, descriptorByPath } = createDescriptorExportMap(snapshot, resolution);
  const meshFiles: Record<string, Blob> = {};

  collectReferencedMeshPaths(snapshotRobot).forEach((meshPath) => {
    const descriptor = descriptorByPath.get(meshPath);
    if (!descriptor) return;

    const blob = buildObjBlobFromDescriptor(descriptor, snapshot.buffers || null);
    if (!blob) return;

    meshFiles[meshPath] = blob;
  });

  return {
    stageSourcePath: snapshot.stageSourcePath || resolution.stageSourcePath || null,
    robotData: {
      name: snapshotRobot.name,
      links: snapshotRobot.links,
      joints: snapshotRobot.joints,
      rootLinkId: snapshotRobot.rootLinkId,
      materials: snapshotRobot.materials,
      closedLoopConstraints: snapshotRobot.closedLoopConstraints,
    },
    meshFiles,
    resolution,
  };
}

export function buildUsdExportBundleFromPreparedCache(
  preparedCache: UsdPreparedExportCache,
  options: {
    currentRobot?: RobotLike | null;
  } = {},
): UsdExportBundle | null {
  if (!preparedCache?.robotData || typeof preparedCache.robotData !== 'object') {
    return null;
  }

  const snapshotRobot = cloneRobotState({
    ...preparedCache.robotData,
    selection: { type: null, id: null },
  });
  const robot = stripSyntheticWorldRootForExport(options.currentRobot
    ? mergeCurrentRobotWithSnapshotMeshPaths(options.currentRobot, snapshotRobot)
    : snapshotRobot);

  return {
    robot,
    meshFiles: new Map(Object.entries(preparedCache.meshFiles || {})),
    resolution: {
      robotData: preparedCache.robotData,
      stageSourcePath: preparedCache.stageSourcePath || null,
      linkIdByPath: {},
      linkPathById: {},
      jointPathById: {},
      childLinkPathByJointId: {},
      parentLinkPathByJointId: {},
    },
  };
}

export function buildUsdExportBundleFromSnapshot(
  snapshot: UsdExportSnapshot,
  options: {
    fileName?: string;
    currentRobot?: RobotLike | null;
    resolution?: ViewerRobotDataResolution | null;
    targetWindow?: SnapshotHost;
  } = {},
): UsdExportBundle | null {
  const resolution = resolveUsdExportResolution(snapshot, options);
  if (!resolution) {
    return null;
  }

  const { robot, descriptorByPath } = createDescriptorExportMap(snapshot, resolution, options.currentRobot);
  const meshFiles = new Map<string, Blob>();

  collectReferencedMeshPaths(robot).forEach((meshPath) => {
    const descriptor = descriptorByPath.get(meshPath);
    if (!descriptor) return;

    const blob = buildObjBlobFromDescriptor(descriptor, snapshot.buffers || null);
    if (!blob) return;

    meshFiles.set(meshPath, blob);
  });

  return {
    robot,
    meshFiles,
    resolution,
  };
}
