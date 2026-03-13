/**
 * Geometry type conversion utilities.
 * Handles smart dimension/rotation conversion between geometry types,
 * and auto-align computation for cylinders.
 */
import * as THREE from 'three';
import type { RobotState } from '@/types';
import { GeometryType } from '@/types';
import { createLoadingManager, createMeshLoader } from '@/core/loaders/meshLoader';
import { disposeObject3D } from '@/shared/utils/three/dispose';

// Reusable THREE objects - avoid allocation in render/compute paths
const _tempVec3A = new THREE.Vector3();
const _tempVec3B = new THREE.Vector3();
const _tempVec3C = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempQuatB = new THREE.Quaternion();
const _tempEuler = new THREE.Euler(0, 0, 0, 'ZYX');
const _tempEulerB = new THREE.Euler(0, 0, 0, 'ZYX');
const _zAxis = new THREE.Vector3(0, 0, 1);
const MAX_MESH_ANALYSIS_POINTS = 4096;
const DEFAULT_MESH_SURFACE_POINT_LIMIT = 1536;

export interface MeshAnalysisOptions {
  includePrimitiveFits?: boolean;
  includeSurfacePoints?: boolean;
  pointCollectionLimit?: number;
  surfacePointLimit?: number;
}

/**
 * Compute auto-align for a cylinder geometry to match the child joint direction.
 * Returns dimensions and origin to align the cylinder along the joint vector,
 * or null if no child joint exists.
 */
export function computeAutoAlign(robot: RobotState, linkId: string) {
  const childJoint = Object.values(robot.joints).find(j => j.parentLinkId === linkId);
  if (!childJoint) return null;

  _tempVec3A.set(childJoint.origin.xyz.x, childJoint.origin.xyz.y, childJoint.origin.xyz.z);
  const length = _tempVec3A.length();
  _tempVec3B.copy(_tempVec3A).multiplyScalar(0.5); // midpoint
  _tempVec3C.copy(_tempVec3A).normalize(); // direction

  // Calculate rotation to align Z-axis with the vector
  if (Math.abs(_tempVec3C.x) < 1e-8 && Math.abs(_tempVec3C.y) < 1e-8 && Math.abs(_tempVec3C.z + 1) < 1e-8) {
    _tempQuat.setFromAxisAngle(_tempVec3A.set(1, 0, 0), Math.PI);
  } else {
    _tempQuat.setFromUnitVectors(_zAxis, _tempVec3C);
  }

  _tempEuler.setFromQuaternion(_tempQuat, 'ZYX');

  return {
    dimensions: { y: length },
    origin: {
      xyz: { x: _tempVec3B.x, y: _tempVec3B.y, z: _tempVec3B.z },
      rpy: { r: _tempEuler.x, p: _tempEuler.y, y: _tempEuler.z }
    }
  };
}

export interface MeshBounds {
  x: number;
  y: number;
  z: number;
  cx: number; // bounding box center x (mesh-local, scaled to meters)
  cy: number; // bounding box center y
  cz: number; // bounding box center z
}

export interface MeshClearanceObstaclePoint {
  x: number;
  y: number;
  z: number;
}

export interface MeshClearanceObstacle {
  points: MeshClearanceObstaclePoint[];
}

export interface MeshAnalysis {
  bounds: MeshBounds;
  representativeColor?: string;
  surfacePoints?: MeshClearanceObstaclePoint[];
  primitiveFits?: {
    cylinder?: PrimitiveFit;
    capsule?: PrimitiveFit;
    cylinderCandidates?: PrimitiveFit[];
    capsuleCandidates?: PrimitiveFit[];
  };
}

interface PrimitiveFit {
  axis: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  radius: number;
  length: number;
  volume: number;
}

interface ScalarInterval {
  start: number;
  end: number;
}

interface Point3 extends MeshClearanceObstaclePoint {}

interface ProjectedPoint {
  t: number;
  u: number;
  v: number;
  radial: number;
}

interface Circle2D {
  cx: number;
  cy: number;
  r: number;
}

function extractMaterialColorHex(material: THREE.Material | undefined): string | undefined {
  if (!material) return undefined;
  const color = (material as THREE.Material & { color?: THREE.Color }).color;
  if (!(color instanceof THREE.Color)) return undefined;
  return `#${color.getHexString()}`;
}

function addColorWeight(
  colorWeights: Map<string, number>,
  color: string | undefined,
  weight: number
): void {
  if (!color || !Number.isFinite(weight) || weight <= 0) return;
  colorWeights.set(color, (colorWeights.get(color) ?? 0) + weight);
}

function getRepresentativeMeshColor(object: THREE.Object3D): string | undefined {
  const colorWeights = new Map<string, number>();

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
      ? [mesh.material]
      : [];

    if (materials.length === 0) return;

    const indexCount = geometry?.index?.count ?? 0;
    const vertexCount = geometry?.attributes?.position?.count ?? 0;
    const defaultWeight = Math.max(indexCount, vertexCount, 1);

    if (materials.length === 1) {
      addColorWeight(colorWeights, extractMaterialColorHex(materials[0]), defaultWeight);
      return;
    }

    const groupWeights = new Array<number>(materials.length).fill(0);
    if (geometry?.groups?.length) {
      geometry.groups.forEach((group) => {
        if (group.materialIndex >= 0 && group.materialIndex < groupWeights.length) {
          groupWeights[group.materialIndex] += Math.max(group.count, 1);
        }
      });
    }

    const fallbackWeight = defaultWeight / materials.length;
    materials.forEach((material, index) => {
      addColorWeight(
        colorWeights,
        extractMaterialColorHex(material),
        groupWeights[index] > 0 ? groupWeights[index] : fallbackWeight
      );
    });
  });

  let representativeColor: string | undefined;
  let bestWeight = -1;

  colorWeights.forEach((weight, color) => {
    if (weight > bestWeight) {
      bestWeight = weight;
      representativeColor = color;
    }
  });

  return representativeColor;
}

/**
 * Asynchronously compute mesh bounds plus a representative display color.
 * Representative color is the dominant material color weighted by geometry group size.
 */
export async function computeMeshAnalysisFromAssets(
  meshPath: string,
  assets: Record<string, string>,
  meshScale?: { x: number; y: number; z: number },
  options: MeshAnalysisOptions = {},
): Promise<MeshAnalysis | null> {
  try {
    const manager = createLoadingManager(assets, '', { preferPlaceholderTextures: true });
    const meshLoader = createMeshLoader(assets, manager);

    return await new Promise<MeshAnalysis | null>((resolve) => {
      meshLoader(meshPath, manager, (obj: THREE.Object3D) => {
        if (!obj || (obj as THREE.Object3D & { userData: { isPlaceholder?: boolean } }).userData?.isPlaceholder) {
          resolve(null);
          return;
        }
        const normalizedScale = normalizeMeshScale(meshScale);
        const includePrimitiveFits = options.includePrimitiveFits ?? true;
        const includeSurfacePoints = options.includeSurfacePoints ?? true;
        const pointCollectionLimit = Math.max(
          1,
          options.pointCollectionLimit
            ?? (includePrimitiveFits ? MAX_MESH_ANALYSIS_POINTS : DEFAULT_MESH_SURFACE_POINT_LIMIT),
        );
        const surfacePointLimit = Math.max(
          1,
          options.surfacePointLimit ?? DEFAULT_MESH_SURFACE_POINT_LIMIT,
        );
        obj.scale.set(normalizedScale.x, normalizedScale.y, normalizedScale.z);
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const representativeColor = getRepresentativeMeshColor(obj);
        if (box.isEmpty()) {
          disposeObject3D(obj, true);
          resolve(null);
          return;
        }
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const needsPointCollection = includePrimitiveFits || includeSurfacePoints;
        const points = needsPointCollection ? collectMeshPoints(obj, pointCollectionLimit) : [];
        const surfacePoints = includeSurfacePoints ? sampleMeshPoints(points, surfacePointLimit) : undefined;
        const primitiveFits = includePrimitiveFits ? computeBestPrimitiveFits(points) : undefined;
        disposeObject3D(obj, true);
        resolve({
          bounds: {
            x: Math.abs(size.x),
            y: Math.abs(size.y),
            z: Math.abs(size.z),
            cx: center.x,
            cy: center.y,
            cz: center.z,
          },
          representativeColor,
          surfacePoints,
          primitiveFits,
        });
      });
    });
  } catch {
    return null;
  }
}

/**
 * Asynchronously compute the bounding box size of a mesh from asset storage.
 * Returns null if the mesh cannot be found, loaded, or has an empty bounding box.
 */
export async function computeMeshBoundsFromAssets(
  meshPath: string,
  assets: Record<string, string>,
  meshScale?: { x: number; y: number; z: number }
): Promise<MeshBounds | null> {
  const analysis = await computeMeshAnalysisFromAssets(meshPath, assets, meshScale, {
    includePrimitiveFits: false,
    includeSurfacePoints: false,
  });
  return analysis?.bounds ?? null;
}

interface GeomData {
  type?: GeometryType;
  dimensions?: { x: number; y: number; z: number };
  origin?: {
    xyz: { x: number; y: number; z: number };
    rpy: { r: number; p: number; y: number };
  };
}

interface ConversionResult {
  type: GeometryType;
  dimensions: { x: number; y: number; z: number };
  origin: {
    xyz: { x: number; y: number; z: number };
    rpy: { r: number; p: number; y: number };
  };
}

interface ConversionContext {
  siblingGeometries?: GeomData[];
  meshClearanceObstacles?: MeshClearanceObstacle[];
  fitVolumeWindowRatio?: number;
  overlapAllowanceRatio?: number;
}

const DEFAULT_DIMENSIONS = { x: 0.1, y: 0.5, z: 0.1 };
const DEFAULT_ORIGIN = {
  xyz: { x: 0, y: 0, z: 0 },
  rpy: { r: 0, p: 0, y: 0 },
};

type MeshPrimaryAxis = 'x' | 'y' | 'z';

function toPositive(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function normalizeOrigin(origin: GeomData['origin']): ConversionResult['origin'] {
  return {
    xyz: {
      x: origin?.xyz?.x ?? DEFAULT_ORIGIN.xyz.x,
      y: origin?.xyz?.y ?? DEFAULT_ORIGIN.xyz.y,
      z: origin?.xyz?.z ?? DEFAULT_ORIGIN.xyz.z,
    },
    rpy: {
      r: origin?.rpy?.r ?? DEFAULT_ORIGIN.rpy.r,
      p: origin?.rpy?.p ?? DEFAULT_ORIGIN.rpy.p,
      y: origin?.rpy?.y ?? DEFAULT_ORIGIN.rpy.y,
    },
  };
}

function normalizeDimensions(dimensions: GeomData['dimensions']): { x: number; y: number; z: number } {
  return {
    x: toPositive(dimensions?.x, DEFAULT_DIMENSIONS.x),
    y: toPositive(dimensions?.y, DEFAULT_DIMENSIONS.y),
    z: toPositive(dimensions?.z, DEFAULT_DIMENSIONS.z),
  };
}

function normalizeMeshScale(dimensions: GeomData['dimensions']): { x: number; y: number; z: number } {
  const toNonZero = (value: number | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) < 1e-8) {
      return 1;
    }
    return value;
  };

  return {
    x: toNonZero(dimensions?.x),
    y: toNonZero(dimensions?.y),
    z: toNonZero(dimensions?.z),
  };
}

function collectMeshPoints(
  object: THREE.Object3D,
  maxPoints: number = MAX_MESH_ANALYSIS_POINTS,
): Point3[] {
  const meshEntries: Array<{
    mesh: THREE.Mesh;
    position: THREE.BufferAttribute;
    vertexCount: number;
  }> = [];
  let totalVertexCount = 0;

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    if (!position || position.count <= 0) return;

    meshEntries.push({
      mesh,
      position,
      vertexCount: position.count,
    });
    totalVertexCount += position.count;
  });

  if (meshEntries.length === 0 || totalVertexCount === 0) {
    return [];
  }

  const points: Point3[] = [];
  const vertex = new THREE.Vector3();
  const pushVertex = (mesh: THREE.Mesh, position: THREE.BufferAttribute, vertexIndex: number) => {
    vertex.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
    points.push({ x: vertex.x, y: vertex.y, z: vertex.z });
  };

  if (totalVertexCount <= maxPoints) {
    meshEntries.forEach(({ mesh, position, vertexCount }) => {
      for (let index = 0; index < vertexCount; index += 1) {
        pushVertex(mesh, position, index);
      }
    });
    return points;
  }

  let remainingBudget = maxPoints;
  let remainingVertexCount = totalVertexCount;

  meshEntries.forEach(({ mesh, position, vertexCount }, meshIndex) => {
    if (remainingBudget <= 0 || remainingVertexCount <= 0) {
      remainingVertexCount -= vertexCount;
      return;
    }

    const isLastMesh = meshIndex === meshEntries.length - 1;
    const quota = isLastMesh
      ? Math.min(remainingBudget, vertexCount)
      : Math.max(
          1,
          Math.min(
            vertexCount,
            Math.round((vertexCount / remainingVertexCount) * remainingBudget),
          ),
        );

    if (quota >= vertexCount) {
      for (let index = 0; index < vertexCount; index += 1) {
        pushVertex(mesh, position, index);
      }
    } else if (quota === 1) {
      pushVertex(mesh, position, Math.floor((vertexCount - 1) / 2));
    } else {
      for (let sampleIndex = 0; sampleIndex < quota; sampleIndex += 1) {
        const vertexIndex = Math.min(
          Math.round((sampleIndex * (vertexCount - 1)) / (quota - 1)),
          vertexCount - 1,
        );
        pushVertex(mesh, position, vertexIndex);
      }
    }

    remainingBudget -= quota;
    remainingVertexCount -= vertexCount;
  });

  return points;
}

function sampleMeshPoints(
  points: Point3[],
  maxPoints: number = 1536,
): MeshClearanceObstaclePoint[] {
  if (points.length <= maxPoints) {
    return points.map((point) => ({ x: point.x, y: point.y, z: point.z }));
  }

  const step = Math.max(Math.floor(points.length / maxPoints), 1);
  const sampled: MeshClearanceObstaclePoint[] = [];

  for (let index = 0; index < points.length && sampled.length < maxPoints; index += step) {
    const point = points[index];
    sampled.push({ x: point.x, y: point.y, z: point.z });
  }

  const lastPoint = points[points.length - 1];
  if (
    lastPoint &&
    (sampled.length === 0
      || sampled[sampled.length - 1].x !== lastPoint.x
      || sampled[sampled.length - 1].y !== lastPoint.y
      || sampled[sampled.length - 1].z !== lastPoint.z)
  ) {
    sampled.push({ x: lastPoint.x, y: lastPoint.y, z: lastPoint.z });
  }

  return sampled;
}

function canonicalizeAxis(axis: Point3): Point3 | null {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (!Number.isFinite(length) || length <= 1e-8) return null;

  let normalized = {
    x: axis.x / length,
    y: axis.y / length,
    z: axis.z / length,
  };

  if (
    normalized.x < -1e-8 ||
    (Math.abs(normalized.x) <= 1e-8 && normalized.y < -1e-8) ||
    (Math.abs(normalized.x) <= 1e-8 && Math.abs(normalized.y) <= 1e-8 && normalized.z < 0)
  ) {
    normalized = {
      x: -normalized.x,
      y: -normalized.y,
      z: -normalized.z,
    };
  }

  return normalized;
}

function getAxisVectorForPrimaryAxis(primaryAxis: MeshPrimaryAxis): Point3 {
  if (primaryAxis === 'x') return { x: 1, y: 0, z: 0 };
  if (primaryAxis === 'y') return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}

function computeSweepHalfExtent(
  primitiveRadius: number,
  primitiveLength: number,
  newType: GeometryType
): number {
  if (newType === GeometryType.CAPSULE) {
    return Math.max(toPositive(primitiveLength, 0.1) / 2 - toPositive(primitiveRadius, 0.05), 0);
  }

  return toPositive(primitiveLength, 0.1) / 2;
}

function composePrimitiveLength(
  sweepHalfExtent: number,
  primitiveRadius: number,
  newType: GeometryType
): number {
  if (newType === GeometryType.CAPSULE) {
    return Math.max(sweepHalfExtent, 0) * 2 + toPositive(primitiveRadius, 0.05) * 2;
  }

  return Math.max(sweepHalfExtent, 0) * 2;
}

function subtractBlockedInterval(intervals: ScalarInterval[], blockedStart: number, blockedEnd: number): ScalarInterval[] {
  if (!Number.isFinite(blockedStart) || !Number.isFinite(blockedEnd) || blockedEnd <= blockedStart) {
    return intervals;
  }

  const nextIntervals: ScalarInterval[] = [];

  intervals.forEach((interval) => {
    if (blockedEnd <= interval.start || blockedStart >= interval.end) {
      nextIntervals.push(interval);
      return;
    }

    if (blockedStart > interval.start) {
      nextIntervals.push({
        start: interval.start,
        end: Math.min(blockedStart, interval.end),
      });
    }

    if (blockedEnd < interval.end) {
      nextIntervals.push({
        start: Math.max(blockedEnd, interval.start),
        end: interval.end,
      });
    }
  });

  return nextIntervals.filter((interval) => interval.end - interval.start > 1e-8);
}

function mergeIntervals(intervals: ScalarInterval[]): ScalarInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((left, right) =>
    left.start - right.start || left.end - right.end
  );
  const merged: ScalarInterval[] = [{ ...sorted[0] }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (current.start <= last.end + 1e-8) {
      last.end = Math.max(last.end, current.end);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

function choosePreferredInterval(intervals: ScalarInterval[]): ScalarInterval | null {
  if (intervals.length === 0) return null;

  return intervals.reduce<ScalarInterval | null>((best, interval) => {
    if (!best) return interval;

    const intervalLength = interval.end - interval.start;
    const bestLength = best.end - best.start;
    if (intervalLength > bestLength + 1e-8) {
      return interval;
    }

    if (Math.abs(intervalLength - bestLength) <= 1e-8) {
      const intervalMidpoint = Math.abs((interval.start + interval.end) / 2);
      const bestMidpoint = Math.abs((best.start + best.end) / 2);
      if (intervalMidpoint < bestMidpoint - 1e-8) {
        return interval;
      }
    }

    return best;
  }, null);
}

function rotateLocalVectorByOrigin(
  origin: ConversionResult['origin'],
  localVector: Point3
): Point3 {
  _tempEuler.set(origin.rpy.r, origin.rpy.p, origin.rpy.y);
  _tempVec3A.set(localVector.x, localVector.y, localVector.z).applyEuler(_tempEuler);
  const axis = canonicalizeAxis({ x: _tempVec3A.x, y: _tempVec3A.y, z: _tempVec3A.z });
  return axis ?? { x: 0, y: 0, z: 1 };
}

function computeOverlapAllowance(
  primitiveRadius: number,
  overlapAllowanceRatio: number | undefined,
): number {
  if (!Number.isFinite(overlapAllowanceRatio) || !overlapAllowanceRatio || overlapAllowanceRatio <= 0) {
    return 0;
  }

  const safeRatio = Math.min(Math.max(overlapAllowanceRatio, 0), 0.35);
  return Math.min(Math.max(primitiveRadius * safeRatio, 0), primitiveRadius * 0.35);
}

function computeBroadPhaseRadius(geometry: GeomData): number | null {
  const type = geometry.type ?? GeometryType.NONE;
  const dims = normalizeDimensions(geometry.dimensions);

  switch (type) {
    case GeometryType.SPHERE:
      return toPositive(dims.x, 0.05);
    case GeometryType.BOX:
      return Math.hypot(dims.x, dims.y, dims.z) / 2;
    case GeometryType.CYLINDER:
      return Math.hypot(toPositive(dims.x, 0.05), toPositive(dims.y, 0.1) / 2);
    case GeometryType.CAPSULE:
      return Math.max(toPositive(dims.y, 0.1) / 2, toPositive(dims.x, 0.05));
    default:
      return null;
  }
}

function collectSiblingBroadPhaseSpheres(
  siblingGeometries: GeomData[] | undefined,
): { center: THREE.Vector3; radius: number }[] {
  if (!siblingGeometries?.length) {
    return [];
  }

  return siblingGeometries
    .map((geometry) => {
      const radius = computeBroadPhaseRadius(geometry);
      if (!radius || radius <= 1e-8) {
        return null;
      }

      const origin = normalizeOrigin(geometry.origin);
      return {
        center: new THREE.Vector3(origin.xyz.x, origin.xyz.y, origin.xyz.z),
        radius,
      };
    })
    .filter((sphere): sphere is { center: THREE.Vector3; radius: number } => sphere !== null);
}

function buildBlockedCenterIntervals(
  candidateCenter: THREE.Vector3,
  axisVector: THREE.Vector3,
  primitiveRadius: number,
  siblingSpheres: { center: THREE.Vector3; radius: number }[],
  clearance: number,
): ScalarInterval[] {
  const blockedIntervals: ScalarInterval[] = [];

  siblingSpheres.forEach((sibling) => {
    _tempVec3A.copy(sibling.center).sub(candidateCenter);
    const projection = _tempVec3A.dot(axisVector);
    _tempVec3B.copy(axisVector).multiplyScalar(projection);
    _tempVec3C.copy(_tempVec3A).sub(_tempVec3B);

    const radialDistance = _tempVec3C.length();
    const combinedRadius = primitiveRadius + sibling.radius + clearance;
    if (radialDistance >= combinedRadius) {
      return;
    }

    const axialPadding = Math.sqrt(Math.max(combinedRadius * combinedRadius - radialDistance * radialDistance, 0));
    blockedIntervals.push({
      start: projection - axialPadding,
      end: projection + axialPadding,
    });
  });

  return mergeIntervals(blockedIntervals);
}

function findNearestSafeCenterShift(
  candidateCenter: THREE.Vector3,
  axisVector: THREE.Vector3,
  primitiveRadius: number,
  siblingSpheres: { center: THREE.Vector3; radius: number }[],
  clearance: number,
): number {
  const blockedIntervals = buildBlockedCenterIntervals(
    candidateCenter,
    axisVector,
    primitiveRadius,
    siblingSpheres,
    clearance,
  );

  const blockingInterval = blockedIntervals.find((interval) =>
    interval.start <= 0 + 1e-8 && interval.end >= 0 - 1e-8
  );

  if (!blockingInterval) {
    return 0;
  }

  const leftMagnitude = Math.abs(blockingInterval.start);
  const rightMagnitude = Math.abs(blockingInterval.end);

  if (leftMagnitude < rightMagnitude - 1e-8) {
    return blockingInterval.start;
  }

  if (rightMagnitude < leftMagnitude - 1e-8) {
    return blockingInterval.end;
  }

  return blockingInterval.end;
}

function resolveAvailableSweepInterval(
  candidateCenter: THREE.Vector3,
  axisVector: THREE.Vector3,
  sweepHalfExtent: number,
  primitiveRadius: number,
  siblingSpheres: { center: THREE.Vector3; radius: number }[],
  clearance: number,
): { centerShift: number; sweepHalfExtent: number } | null {
  if (sweepHalfExtent <= 1e-8) {
    const hasOverlapAtCenter = siblingSpheres.some((sibling) => {
      _tempVec3A.copy(sibling.center).sub(candidateCenter);
      const projection = _tempVec3A.dot(axisVector);
      _tempVec3B.copy(axisVector).multiplyScalar(projection);
      _tempVec3C.copy(_tempVec3A).sub(_tempVec3B);
      const radialDistance = _tempVec3C.length();
      return radialDistance + 1e-8 < primitiveRadius + sibling.radius + clearance
        && Math.abs(projection) <= 1e-8;
    });

    return hasOverlapAtCenter
      ? null
      : {
          centerShift: 0,
          sweepHalfExtent: 0,
        };
  }

  let intervals: ScalarInterval[] = [{ start: -sweepHalfExtent, end: sweepHalfExtent }];

  siblingSpheres.forEach((sibling) => {
    _tempVec3A.copy(sibling.center).sub(candidateCenter);
    const projection = _tempVec3A.dot(axisVector);
    _tempVec3B.copy(axisVector).multiplyScalar(projection);
    _tempVec3C.copy(_tempVec3A).sub(_tempVec3B);

    const radialDistance = _tempVec3C.length();
    const combinedRadius = primitiveRadius + sibling.radius + clearance;
    if (radialDistance >= combinedRadius) {
      return;
    }

    const axialPadding = Math.sqrt(Math.max(combinedRadius * combinedRadius - radialDistance * radialDistance, 0));
    intervals = subtractBlockedInterval(intervals, projection - axialPadding, projection + axialPadding);
  });

  const preferredInterval = choosePreferredInterval(intervals);
  if (!preferredInterval) {
    return null;
  }

  return {
    centerShift: (preferredInterval.start + preferredInterval.end) / 2,
    sweepHalfExtent: Math.max((preferredInterval.end - preferredInterval.start) / 2, 0),
  };
}

function collectRadiusCandidates(
  primitiveRadius: number,
  candidateCenter: THREE.Vector3,
  axisVector: THREE.Vector3,
  siblingSpheres: { center: THREE.Vector3; radius: number }[],
  clearance: number,
  minRadius: number,
): number[] {
  const candidates = new Set<number>([
    primitiveRadius,
    minRadius,
  ]);

  siblingSpheres.forEach((sibling) => {
    _tempVec3A.copy(sibling.center).sub(candidateCenter);
    const projection = _tempVec3A.dot(axisVector);
    _tempVec3B.copy(axisVector).multiplyScalar(projection);
    _tempVec3C.copy(_tempVec3A).sub(_tempVec3B);

    const radialDistance = _tempVec3C.length();
    candidates.add(Math.max(radialDistance - sibling.radius - clearance, minRadius));
  });

  return Array.from(candidates)
    .filter((value) => Number.isFinite(value) && value >= minRadius)
    .sort((left, right) => right - left);
}

function collectMeshObstaclePoints(
  meshClearanceObstacles: MeshClearanceObstacle[] | undefined,
): Point3[] {
  if (!meshClearanceObstacles?.length) {
    return [];
  }

  const points: Point3[] = [];
  meshClearanceObstacles.forEach((obstacle) => {
    obstacle.points.forEach((point) => {
      points.push({ x: point.x, y: point.y, z: point.z });
    });
  });

  return points;
}

function resolveAvailableSweepIntervalFromBlockedIntervals(
  sweepHalfExtent: number,
  blockedIntervals: ScalarInterval[],
): { centerShift: number; sweepHalfExtent: number } | null {
  if (sweepHalfExtent <= 1e-8) {
    const blockingInterval = blockedIntervals.find((interval) =>
      interval.start <= 0 + 1e-8 && interval.end >= 0 - 1e-8
    );

    return blockingInterval
      ? null
      : {
          centerShift: 0,
          sweepHalfExtent: 0,
        };
  }

  let intervals: ScalarInterval[] = [{ start: -sweepHalfExtent, end: sweepHalfExtent }];
  blockedIntervals.forEach((interval) => {
    intervals = subtractBlockedInterval(intervals, interval.start, interval.end);
  });

  const preferredInterval = choosePreferredInterval(intervals);
  if (!preferredInterval) {
    return null;
  }

  return {
    centerShift: (preferredInterval.start + preferredInterval.end) / 2,
    sweepHalfExtent: Math.max((preferredInterval.end - preferredInterval.start) / 2, 0),
  };
}

function findNearestSafeCenterShiftFromBlockedIntervals(
  blockedIntervals: ScalarInterval[],
): number {
  const blockingInterval = blockedIntervals.find((interval) =>
    interval.start <= 0 + 1e-8 && interval.end >= 0 - 1e-8
  );

  if (!blockingInterval) {
    return 0;
  }

  const leftMagnitude = Math.abs(blockingInterval.start);
  const rightMagnitude = Math.abs(blockingInterval.end);

  if (leftMagnitude < rightMagnitude - 1e-8) {
    return blockingInterval.start;
  }

  if (rightMagnitude < leftMagnitude - 1e-8) {
    return blockingInterval.end;
  }

  return blockingInterval.end;
}

function buildMeshPointBlockedIntervals(
  candidateCenter: THREE.Vector3,
  axisVector: THREE.Vector3,
  sweepHalfExtent: number,
  primitiveRadius: number,
  meshObstaclePoints: Point3[],
  clearance: number,
  newType: GeometryType,
): ScalarInterval[] {
  const blockedIntervals: ScalarInterval[] = [];
  const radialLimit = primitiveRadius + clearance;

  meshObstaclePoints.forEach((point) => {
    _tempVec3A.set(point.x, point.y, point.z).sub(candidateCenter);
    const projection = _tempVec3A.dot(axisVector);
    _tempVec3B.copy(axisVector).multiplyScalar(projection);
    _tempVec3C.copy(_tempVec3A).sub(_tempVec3B);

    const radialDistance = _tempVec3C.length();
    if (radialDistance >= radialLimit) {
      return;
    }

    const axialPadding = newType === GeometryType.CAPSULE
      ? Math.sqrt(Math.max(radialLimit * radialLimit - radialDistance * radialDistance, 0))
      : 0;

    blockedIntervals.push({
      start: projection - sweepHalfExtent - axialPadding,
      end: projection + sweepHalfExtent + axialPadding,
    });
  });

  return mergeIntervals(blockedIntervals);
}

function collectRadiusCandidatesFromMeshPoints(
  primitiveRadius: number,
  candidateCenter: THREE.Vector3,
  axisVector: THREE.Vector3,
  meshObstaclePoints: Point3[],
  clearance: number,
  minRadius: number,
): number[] {
  const candidates = new Set<number>([
    primitiveRadius,
    minRadius,
  ]);

  meshObstaclePoints.forEach((point) => {
    _tempVec3A.set(point.x, point.y, point.z).sub(candidateCenter);
    const projection = _tempVec3A.dot(axisVector);
    _tempVec3B.copy(axisVector).multiplyScalar(projection);
    _tempVec3C.copy(_tempVec3A).sub(_tempVec3B);
    const radialDistance = _tempVec3C.length();
    candidates.add(Math.max(radialDistance - clearance, minRadius));
  });

  return Array.from(candidates)
    .filter((value) => Number.isFinite(value) && value >= minRadius)
    .sort((left, right) => right - left);
}

function applyMeshPointCollisionClearance(
  primitiveRadius: number,
  primitiveLength: number,
  axisInLinkSpace: Point3,
  newType: GeometryType,
  meshClearanceObstacles: MeshClearanceObstacle[] | undefined,
  centerOrigin: ConversionResult['origin'],
  overlapAllowanceRatio?: number,
): { radius: number; length: number; centerShift: number } {
  if ((newType !== GeometryType.CYLINDER && newType !== GeometryType.CAPSULE) || !meshClearanceObstacles?.length) {
    return {
      radius: primitiveRadius,
      length: primitiveLength,
      centerShift: 0,
    };
  }

  const axis = canonicalizeAxis(axisInLinkSpace);
  if (!axis) {
    return {
      radius: primitiveRadius,
      length: primitiveLength,
      centerShift: 0,
    };
  }

  const meshObstaclePoints = collectMeshObstaclePoints(meshClearanceObstacles);
  if (meshObstaclePoints.length === 0) {
    return {
      radius: primitiveRadius,
      length: primitiveLength,
      centerShift: 0,
    };
  }

  const candidateCenter = new THREE.Vector3(
    centerOrigin.xyz.x,
    centerOrigin.xyz.y,
    centerOrigin.xyz.z,
  );
  const axisVector = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
  const radius = toPositive(primitiveRadius, 0.05);
  const minSize = 1e-4;
  const baseClearance = Math.min(Math.max(radius * 0.05, 0.002), 0.01);
  const clearance = baseClearance - computeOverlapAllowance(radius, overlapAllowanceRatio);
  const minRadius = Math.min(Math.max(radius * 0.15, minSize), radius);
  const radiusCandidates = collectRadiusCandidatesFromMeshPoints(
    radius,
    candidateCenter,
    axisVector,
    meshObstaclePoints,
    clearance,
    minRadius,
  );

  let bestCandidate: { radius: number; sweepHalfExtent: number; centerShift: number; volume: number } | null = null;

  radiusCandidates.forEach((radiusCandidate) => {
    const sweepHalfExtent = computeSweepHalfExtent(radiusCandidate, primitiveLength, newType);
    const blockedIntervals = buildMeshPointBlockedIntervals(
      candidateCenter,
      axisVector,
      sweepHalfExtent,
      radiusCandidate,
      meshObstaclePoints,
      clearance,
      newType,
    );
    const safeInterval = resolveAvailableSweepIntervalFromBlockedIntervals(sweepHalfExtent, blockedIntervals);

    if (!safeInterval) {
      return;
    }

    const length = composePrimitiveLength(safeInterval.sweepHalfExtent, radiusCandidate, newType);
    const volume = computePrimitiveVolume(newType, radiusCandidate, length);
    if (!Number.isFinite(volume) || volume <= 0) {
      return;
    }

    const nextCandidate = {
      radius: radiusCandidate,
      sweepHalfExtent: safeInterval.sweepHalfExtent,
      centerShift: safeInterval.centerShift,
      volume,
    };

    if (!bestCandidate) {
      bestCandidate = nextCandidate;
      return;
    }

    const volumeTolerance = Math.max(bestCandidate.volume * 0.01, 1e-8);
    if (nextCandidate.volume > bestCandidate.volume + volumeTolerance) {
      bestCandidate = nextCandidate;
      return;
    }

    if (Math.abs(nextCandidate.volume - bestCandidate.volume) <= volumeTolerance) {
      if (nextCandidate.sweepHalfExtent > bestCandidate.sweepHalfExtent + 1e-8) {
        bestCandidate = nextCandidate;
        return;
      }

      if (
        Math.abs(nextCandidate.sweepHalfExtent - bestCandidate.sweepHalfExtent) <= 1e-8
        && Math.abs(nextCandidate.centerShift) < Math.abs(bestCandidate.centerShift) - 1e-8
      ) {
        bestCandidate = nextCandidate;
      }
    }
  });

  if (bestCandidate) {
    return {
      radius: bestCandidate.radius,
      length: composePrimitiveLength(bestCandidate.sweepHalfExtent, bestCandidate.radius, newType),
      centerShift: bestCandidate.centerShift,
    };
  }

  let fallbackCandidate: { radius: number; length: number; centerShift: number; volume: number } | null = null;

  radiusCandidates.forEach((radiusCandidate) => {
    const fallbackHalfExtent = computeSweepHalfExtent(
      radiusCandidate,
      newType === GeometryType.CAPSULE ? radiusCandidate * 2 : minSize,
      newType,
    );
    const blockedIntervals = buildMeshPointBlockedIntervals(
      candidateCenter,
      axisVector,
      fallbackHalfExtent,
      radiusCandidate,
      meshObstaclePoints,
      clearance,
      newType,
    );
    const centerShift = findNearestSafeCenterShiftFromBlockedIntervals(blockedIntervals);
    const length = composePrimitiveLength(fallbackHalfExtent, radiusCandidate, newType);
    const volume = computePrimitiveVolume(newType, radiusCandidate, length);
    if (!Number.isFinite(volume) || volume <= 0) {
      return;
    }

    const nextCandidate = {
      radius: radiusCandidate,
      length,
      centerShift,
      volume,
    };

    if (!fallbackCandidate) {
      fallbackCandidate = nextCandidate;
      return;
    }

    const shiftDelta = Math.abs(nextCandidate.centerShift) - Math.abs(fallbackCandidate.centerShift);
    if (shiftDelta < -1e-8) {
      fallbackCandidate = nextCandidate;
      return;
    }

    if (Math.abs(shiftDelta) <= 1e-8) {
      const volumeTolerance = Math.max(fallbackCandidate.volume * 0.01, 1e-8);
      if (nextCandidate.volume > fallbackCandidate.volume + volumeTolerance) {
        fallbackCandidate = nextCandidate;
      }
    }
  });

  if (fallbackCandidate) {
    return {
      radius: fallbackCandidate.radius,
      length: fallbackCandidate.length,
      centerShift: fallbackCandidate.centerShift,
    };
  }

  return {
    radius,
    length: composePrimitiveLength(newType === GeometryType.CAPSULE ? 0 : minSize / 2, radius, newType),
    centerShift: 0,
  };
}

function buildBoxPointBlockedIntervals(
  points: Point3[],
  center: THREE.Vector3,
  inverseRotation: THREE.Quaternion,
  majorAxis: MeshPrimaryAxis,
  halfMajor: number,
  halfCrossA: number,
  halfCrossB: number,
  clearance: number,
): ScalarInterval[] {
  const blockedIntervals: ScalarInterval[] = [];

  points.forEach((point) => {
    _tempVec3A.set(point.x, point.y, point.z).sub(center).applyQuaternion(inverseRotation);
    const majorCoord = majorAxis === 'x'
      ? _tempVec3A.x
      : majorAxis === 'y'
        ? _tempVec3A.y
        : _tempVec3A.z;
    const crossA = majorAxis === 'x'
      ? _tempVec3A.y
      : majorAxis === 'y'
        ? _tempVec3A.x
        : _tempVec3A.x;
    const crossB = majorAxis === 'x'
      ? _tempVec3A.z
      : majorAxis === 'y'
        ? _tempVec3A.z
        : _tempVec3A.y;

    if (Math.abs(crossA) >= halfCrossA + clearance || Math.abs(crossB) >= halfCrossB + clearance) {
      return;
    }

    blockedIntervals.push({
      start: majorCoord - halfMajor - clearance,
      end: majorCoord + halfMajor + clearance,
    });
  });

  return mergeIntervals(blockedIntervals);
}

function applyMeshPointBoxClearance(
  boxDimensions: { x: number; y: number; z: number },
  origin: ConversionResult['origin'],
  meshClearanceObstacles: MeshClearanceObstacle[] | undefined,
): { dimensions: { x: number; y: number; z: number }; origin: ConversionResult['origin'] } {
  if (!meshClearanceObstacles?.length) {
    return {
      dimensions: boxDimensions,
      origin,
    };
  }

  const points = collectMeshObstaclePoints(meshClearanceObstacles);
  if (points.length === 0) {
    return {
      dimensions: boxDimensions,
      origin,
    };
  }

  const majorAxis = getPrimaryAxis(boxDimensions);
  const localAxis = getAxisVectorForPrimaryAxis(majorAxis);
  const halfMajor = Math.max(
    (majorAxis === 'x' ? boxDimensions.x : majorAxis === 'y' ? boxDimensions.y : boxDimensions.z) / 2,
    1e-4,
  );
  const halfCrossA = majorAxis === 'x'
    ? boxDimensions.y / 2
    : majorAxis === 'y'
      ? boxDimensions.x / 2
      : boxDimensions.x / 2;
  const halfCrossB = majorAxis === 'x'
    ? boxDimensions.z / 2
    : majorAxis === 'y'
      ? boxDimensions.z / 2
      : boxDimensions.y / 2;
  const boxRadius = Math.hypot(boxDimensions.x, boxDimensions.y, boxDimensions.z) / 2;
  const clearance = Math.min(Math.max(boxRadius * 0.05, 0.002), 0.01);
  const center = new THREE.Vector3(origin.xyz.x, origin.xyz.y, origin.xyz.z);
  const inverseRotation = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(origin.rpy.r, origin.rpy.p, origin.rpy.y, 'ZYX'))
    .invert();
  const blockedIntervals = buildBoxPointBlockedIntervals(
    points,
    center,
    inverseRotation,
    majorAxis,
    halfMajor,
    halfCrossA,
    halfCrossB,
    clearance,
  );
  const safeInterval = resolveAvailableSweepIntervalFromBlockedIntervals(halfMajor, blockedIntervals);

  if (safeInterval) {
    const nextOrigin = Math.abs(safeInterval.centerShift) > 1e-8
      ? offsetOriginByLocalVector(origin, {
          x: localAxis.x * safeInterval.centerShift,
          y: localAxis.y * safeInterval.centerShift,
          z: localAxis.z * safeInterval.centerShift,
        })
      : origin;
    const nextDimensions = { ...boxDimensions };
    const nextMajorSize = Math.max(safeInterval.sweepHalfExtent * 2, 1e-4);

    if (majorAxis === 'x') {
      nextDimensions.x = nextMajorSize;
    } else if (majorAxis === 'y') {
      nextDimensions.y = nextMajorSize;
    } else {
      nextDimensions.z = nextMajorSize;
    }

    return {
      dimensions: nextDimensions,
      origin: nextOrigin,
    };
  }

  const fallbackHalfExtent = 5e-5;
  const fallbackBlockedIntervals = buildBoxPointBlockedIntervals(
    points,
    center,
    inverseRotation,
    majorAxis,
    fallbackHalfExtent,
    halfCrossA,
    halfCrossB,
    clearance,
  );
  const fallbackShift = findNearestSafeCenterShiftFromBlockedIntervals(fallbackBlockedIntervals);
  const fallbackOrigin = Math.abs(fallbackShift) > 1e-8
    ? offsetOriginByLocalVector(origin, {
        x: localAxis.x * fallbackShift,
        y: localAxis.y * fallbackShift,
        z: localAxis.z * fallbackShift,
      })
    : origin;
  const fallbackDimensions = { ...boxDimensions };

  if (majorAxis === 'x') {
    fallbackDimensions.x = 1e-4;
  } else if (majorAxis === 'y') {
    fallbackDimensions.y = 1e-4;
  } else {
    fallbackDimensions.z = 1e-4;
  }

  return {
    dimensions: fallbackDimensions,
    origin: fallbackOrigin,
  };
}

function applySiblingCollisionClearance(
  primitiveRadius: number,
  primitiveLength: number,
  axisInLinkSpace: Point3,
  newType: GeometryType,
  siblingGeometries: GeomData[] | undefined,
  centerOrigin: ConversionResult['origin'],
  overlapAllowanceRatio?: number,
): { radius: number; length: number; centerShift: number } {
  if ((newType !== GeometryType.CYLINDER && newType !== GeometryType.CAPSULE) || !siblingGeometries?.length) {
    return {
      radius: primitiveRadius,
      length: primitiveLength,
      centerShift: 0,
    };
  }

  const axis = canonicalizeAxis(axisInLinkSpace);
  if (!axis) {
    return {
      radius: primitiveRadius,
      length: primitiveLength,
      centerShift: 0,
    };
  }

  const siblingSpheres = collectSiblingBroadPhaseSpheres(siblingGeometries);
  if (siblingSpheres.length === 0) {
    return {
      radius: primitiveRadius,
      length: primitiveLength,
      centerShift: 0,
    };
  }

  const candidateCenter = new THREE.Vector3(
    centerOrigin.xyz.x,
    centerOrigin.xyz.y,
    centerOrigin.xyz.z,
  );
  const axisVector = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
  const radius = toPositive(primitiveRadius, 0.05);
  const minSize = 1e-4;
  const baseClearance = Math.min(Math.max(radius * 0.05, 0.002), 0.01);
  const clearance = baseClearance - computeOverlapAllowance(radius, overlapAllowanceRatio);
  const minRadius = Math.min(Math.max(radius * 0.15, minSize), radius);
  const radiusCandidates = collectRadiusCandidates(
    radius,
    candidateCenter,
    axisVector,
    siblingSpheres,
    clearance,
    minRadius,
  );

  let bestCandidate: { radius: number; sweepHalfExtent: number; centerShift: number; volume: number } | null = null;

  radiusCandidates.forEach((radiusCandidate) => {
    const sweepHalfExtent = computeSweepHalfExtent(radiusCandidate, primitiveLength, newType);
    const safeInterval = resolveAvailableSweepInterval(
      candidateCenter,
      axisVector,
      sweepHalfExtent,
      radiusCandidate,
      siblingSpheres,
      clearance,
    );

    if (!safeInterval) {
      return;
    }

    const length = composePrimitiveLength(safeInterval.sweepHalfExtent, radiusCandidate, newType);
    const volume = computePrimitiveVolume(newType, radiusCandidate, length);
    if (!Number.isFinite(volume) || volume <= 0) {
      return;
    }

    const nextCandidate = {
      radius: radiusCandidate,
      sweepHalfExtent: safeInterval.sweepHalfExtent,
      centerShift: safeInterval.centerShift,
      volume,
    };

    if (!bestCandidate) {
      bestCandidate = nextCandidate;
      return;
    }

    const volumeTolerance = Math.max(bestCandidate.volume * 0.01, 1e-8);
    if (nextCandidate.volume > bestCandidate.volume + volumeTolerance) {
      bestCandidate = nextCandidate;
      return;
    }

    if (Math.abs(nextCandidate.volume - bestCandidate.volume) <= volumeTolerance) {
      if (nextCandidate.sweepHalfExtent > bestCandidate.sweepHalfExtent + 1e-8) {
        bestCandidate = nextCandidate;
        return;
      }

      if (
        Math.abs(nextCandidate.sweepHalfExtent - bestCandidate.sweepHalfExtent) <= 1e-8
        && Math.abs(nextCandidate.centerShift) < Math.abs(bestCandidate.centerShift) - 1e-8
      ) {
        bestCandidate = nextCandidate;
      }
    }
  });

  if (bestCandidate) {
    return {
      radius: bestCandidate.radius,
      length: composePrimitiveLength(bestCandidate.sweepHalfExtent, bestCandidate.radius, newType),
      centerShift: bestCandidate.centerShift,
    };
  }

  let fallbackCandidate: { radius: number; length: number; centerShift: number; volume: number } | null = null;

  radiusCandidates.forEach((radiusCandidate) => {
    const centerShift = findNearestSafeCenterShift(
      candidateCenter,
      axisVector,
      radiusCandidate,
      siblingSpheres,
      clearance,
    );
    const length = composePrimitiveLength(newType === GeometryType.CAPSULE ? 0 : minSize / 2, radiusCandidate, newType);
    const volume = computePrimitiveVolume(newType, radiusCandidate, length);
    if (!Number.isFinite(volume) || volume <= 0) {
      return;
    }

    const nextCandidate = {
      radius: radiusCandidate,
      length,
      centerShift,
      volume,
    };

    if (!fallbackCandidate) {
      fallbackCandidate = nextCandidate;
      return;
    }

    const shiftDelta = Math.abs(nextCandidate.centerShift) - Math.abs(fallbackCandidate.centerShift);
    if (shiftDelta < -1e-8) {
      fallbackCandidate = nextCandidate;
      return;
    }

    if (Math.abs(shiftDelta) <= 1e-8) {
      const volumeTolerance = Math.max(fallbackCandidate.volume * 0.01, 1e-8);
      if (nextCandidate.volume > fallbackCandidate.volume + volumeTolerance) {
        fallbackCandidate = nextCandidate;
      }
    }
  });

  if (fallbackCandidate) {
    return {
      radius: fallbackCandidate.radius,
      length: fallbackCandidate.length,
      centerShift: fallbackCandidate.centerShift,
    };
  }

  return {
    radius,
    length: composePrimitiveLength(newType === GeometryType.CAPSULE ? 0 : minSize / 2, radius, newType),
    centerShift: 0,
  };
}

function applySiblingBoxClearance(
  boxDimensions: { x: number; y: number; z: number },
  origin: ConversionResult['origin'],
  siblingGeometries: GeomData[] | undefined,
): ConversionResult['origin'] {
  if (!siblingGeometries?.length) {
    return origin;
  }

  const siblingSpheres = collectSiblingBroadPhaseSpheres(siblingGeometries);
  if (siblingSpheres.length === 0) {
    return origin;
  }

  const boxRadius = computeBroadPhaseRadius({
    type: GeometryType.BOX,
    dimensions: boxDimensions,
    origin,
  });
  if (!boxRadius || boxRadius <= 1e-8) {
    return origin;
  }

  const center = new THREE.Vector3(origin.xyz.x, origin.xyz.y, origin.xyz.z);
  const clearance = Math.min(Math.max(boxRadius * 0.05, 0.002), 0.01);
  const axisPriority = ([
    { axis: 'x' as const, size: boxDimensions.x },
    { axis: 'y' as const, size: boxDimensions.y },
    { axis: 'z' as const, size: boxDimensions.z },
  ]).sort((left, right) => right.size - left.size);

  let bestShift: { localAxis: Point3; centerShift: number } | null = null;

  axisPriority.forEach(({ axis }) => {
    const localAxis = getAxisVectorForPrimaryAxis(axis);
    const axisInLinkSpace = rotateLocalVectorByOrigin(origin, localAxis);
    const centerShift = findNearestSafeCenterShift(
      center,
      _tempVec3A.set(axisInLinkSpace.x, axisInLinkSpace.y, axisInLinkSpace.z).normalize(),
      boxRadius,
      siblingSpheres,
      clearance,
    );

    if (!bestShift) {
      bestShift = { localAxis, centerShift };
      return;
    }

    const nextShiftMagnitude = Math.abs(centerShift);
    const bestShiftMagnitude = Math.abs(bestShift.centerShift);
    if (nextShiftMagnitude < bestShiftMagnitude - 1e-8) {
      bestShift = { localAxis, centerShift };
      return;
    }

    if (Math.abs(nextShiftMagnitude - bestShiftMagnitude) <= 1e-8 && axis === axisPriority[0].axis) {
      bestShift = { localAxis, centerShift };
    }
  });

  if (!bestShift || Math.abs(bestShift.centerShift) <= 1e-8) {
    return origin;
  }

  return offsetOriginByLocalVector(origin, {
    x: bestShift.localAxis.x * bestShift.centerShift,
    y: bestShift.localAxis.y * bestShift.centerShift,
    z: bestShift.localAxis.z * bestShift.centerShift,
  });
}

function addCandidateAxis(axes: Point3[], axis: Point3): void {
  const normalized = canonicalizeAxis(axis);
  if (!normalized) return;

  const isDuplicate = axes.some((existing) =>
    Math.abs(existing.x * normalized.x + existing.y * normalized.y + existing.z * normalized.z) > 0.999
  );

  if (!isDuplicate) {
    axes.push(normalized);
  }
}

function computePrincipalAxes(points: Point3[]): Point3[] {
  if (points.length === 0) return [];

  let meanX = 0;
  let meanY = 0;
  let meanZ = 0;

  points.forEach((point) => {
    meanX += point.x;
    meanY += point.y;
    meanZ += point.z;
  });

  meanX /= points.length;
  meanY /= points.length;
  meanZ /= points.length;

  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;

  points.forEach((point) => {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    const dz = point.z - meanZ;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  });

  const invCount = 1 / Math.max(points.length, 1);
  const matrix = [
    [xx * invCount, xy * invCount, xz * invCount],
    [xy * invCount, yy * invCount, yz * invCount],
    [xz * invCount, yz * invCount, zz * invCount],
  ];
  const eigenvectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const candidates: Array<[number, number]> = [[0, 1], [0, 2], [1, 2]];
    let pivot: [number, number] = [0, 1];
    let maxValue = 0;

    candidates.forEach(([row, col]) => {
      const value = Math.abs(matrix[row][col]);
      if (value > maxValue) {
        maxValue = value;
        pivot = [row, col];
      }
    });

    if (maxValue <= 1e-12) break;

    const [row, col] = pivot;
    const diff = matrix[col][col] - matrix[row][row];
    const angle = 0.5 * Math.atan2(2 * matrix[row][col], diff);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rowRow = matrix[row][row];
    const colCol = matrix[col][col];
    const rowCol = matrix[row][col];

    matrix[row][row] = cos * cos * rowRow - 2 * sin * cos * rowCol + sin * sin * colCol;
    matrix[col][col] = sin * sin * rowRow + 2 * sin * cos * rowCol + cos * cos * colCol;
    matrix[row][col] = 0;
    matrix[col][row] = 0;

    for (let index = 0; index < 3; index += 1) {
      if (index === row || index === col) continue;
      const rowValue = matrix[index][row];
      const colValue = matrix[index][col];
      matrix[index][row] = cos * rowValue - sin * colValue;
      matrix[row][index] = matrix[index][row];
      matrix[index][col] = sin * rowValue + cos * colValue;
      matrix[col][index] = matrix[index][col];
    }

    for (let index = 0; index < 3; index += 1) {
      const rowValue = eigenvectors[index][row];
      const colValue = eigenvectors[index][col];
      eigenvectors[index][row] = cos * rowValue - sin * colValue;
      eigenvectors[index][col] = sin * rowValue + cos * colValue;
    }
  }

  const sorted = [0, 1, 2]
    .map((index) => ({
      value: matrix[index][index],
      axis: {
        x: eigenvectors[0][index],
        y: eigenvectors[1][index],
        z: eigenvectors[2][index],
      },
    }))
    .sort((left, right) => right.value - left.value);

  return sorted
    .map((entry) => canonicalizeAxis(entry.axis))
    .filter((axis): axis is Point3 => axis !== null);
}

function createDeterministicRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6D2B79F5) >>> 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministically<T>(values: T[], seed: number): T[] {
  const shuffled = [...values];
  const random = createDeterministicRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function isPointInsideCircle(point: { x: number; y: number }, circle: Circle2D): boolean {
  const dx = point.x - circle.cx;
  const dy = point.y - circle.cy;
  return dx * dx + dy * dy <= (circle.r + 1e-8) * (circle.r + 1e-8);
}

function createCircleFromDiameter(
  pointA: { x: number; y: number },
  pointB: { x: number; y: number }
): Circle2D {
  const centerX = (pointA.x + pointB.x) / 2;
  const centerY = (pointA.y + pointB.y) / 2;
  return {
    cx: centerX,
    cy: centerY,
    r: Math.hypot(pointA.x - centerX, pointA.y - centerY),
  };
}

function createCircleFromThreePoints(
  pointA: { x: number; y: number },
  pointB: { x: number; y: number },
  pointC: { x: number; y: number }
): Circle2D | null {
  const determinant =
    2 *
    (
      pointA.x * (pointB.y - pointC.y) +
      pointB.x * (pointC.y - pointA.y) +
      pointC.x * (pointA.y - pointB.y)
    );

  if (Math.abs(determinant) <= 1e-10) {
    return null;
  }

  const pointASquared = pointA.x * pointA.x + pointA.y * pointA.y;
  const pointBSquared = pointB.x * pointB.x + pointB.y * pointB.y;
  const pointCSquared = pointC.x * pointC.x + pointC.y * pointC.y;

  const centerX =
    (
      pointASquared * (pointB.y - pointC.y) +
      pointBSquared * (pointC.y - pointA.y) +
      pointCSquared * (pointA.y - pointB.y)
    ) / determinant;
  const centerY =
    (
      pointASquared * (pointC.x - pointB.x) +
      pointBSquared * (pointA.x - pointC.x) +
      pointCSquared * (pointB.x - pointA.x)
    ) / determinant;

  return {
    cx: centerX,
    cy: centerY,
    r: Math.hypot(pointA.x - centerX, pointA.y - centerY),
  };
}

function createSmallestEnclosingPairCircle(
  pointA: { x: number; y: number },
  pointB: { x: number; y: number },
  pointC: { x: number; y: number }
): Circle2D {
  const candidates = [
    createCircleFromDiameter(pointA, pointB),
    createCircleFromDiameter(pointA, pointC),
    createCircleFromDiameter(pointB, pointC),
  ];

  let bestCircle = candidates[0];
  candidates.forEach((candidate) => {
    if (
      isPointInsideCircle(pointA, candidate) &&
      isPointInsideCircle(pointB, candidate) &&
      isPointInsideCircle(pointC, candidate) &&
      candidate.r < bestCircle.r
    ) {
      bestCircle = candidate;
    }
  });

  return bestCircle;
}

function computeMinimumEnclosingCircle(points: Array<{ x: number; y: number }>): Circle2D {
  if (points.length === 0) {
    return { cx: 0, cy: 0, r: 0 };
  }

  const shuffled = shuffleDeterministically(points, 0x9E3779B9);
  let circle: Circle2D = { cx: shuffled[0].x, cy: shuffled[0].y, r: 0 };

  for (let i = 0; i < shuffled.length; i += 1) {
    const pointI = shuffled[i];
    if (isPointInsideCircle(pointI, circle)) continue;

    circle = { cx: pointI.x, cy: pointI.y, r: 0 };

    for (let j = 0; j < i; j += 1) {
      const pointJ = shuffled[j];
      if (isPointInsideCircle(pointJ, circle)) continue;

      circle = createCircleFromDiameter(pointI, pointJ);

      for (let k = 0; k < j; k += 1) {
        const pointK = shuffled[k];
        if (isPointInsideCircle(pointK, circle)) continue;

        const circumcircle = createCircleFromThreePoints(pointI, pointJ, pointK);
        circle = circumcircle ?? createSmallestEnclosingPairCircle(pointI, pointJ, pointK);
      }
    }
  }

  return circle;
}

function createPerpendicularBasis(axis: Point3): { axis: THREE.Vector3; basisU: THREE.Vector3; basisV: THREE.Vector3 } {
  const axisVector = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
  const reference = Math.abs(axisVector.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const basisU = new THREE.Vector3().crossVectors(reference, axisVector).normalize();
  const basisV = new THREE.Vector3().crossVectors(axisVector, basisU).normalize();
  return { axis: axisVector, basisU, basisV };
}

function evaluateCapsuleRadius(points: ProjectedPoint[], radius: number) {
  let maxStart = -Infinity;
  let minEnd = Infinity;

  for (const point of points) {
    if (point.radial > radius + 1e-8) {
      return null;
    }

    const slack = Math.sqrt(Math.max(radius * radius - point.radial * point.radial, 0));
    maxStart = Math.max(maxStart, point.t - slack);
    minEnd = Math.min(minEnd, point.t + slack);
  }

  const segmentLength = Math.max(0, maxStart - minEnd);
  const centerT = (maxStart + minEnd) / 2;
  const totalLength = segmentLength + 2 * radius;

  return {
    centerT,
    totalLength,
    volume: computeCapsuleVolume(totalLength, radius),
  };
}

function computeBestCapsuleFit(
  points: ProjectedPoint[],
  axis: THREE.Vector3,
  lineCenter: THREE.Vector3,
  minRadius: number
): PrimitiveFit {
  let midpoint = 0;
  if (points.length > 0) {
    let minT = Infinity;
    let maxT = -Infinity;
    points.forEach((point) => {
      minT = Math.min(minT, point.t);
      maxT = Math.max(maxT, point.t);
    });
    midpoint = (minT + maxT) / 2;
  }

  let upperRadius = minRadius;
  points.forEach((point) => {
    upperRadius = Math.max(upperRadius, Math.hypot(point.radial, point.t - midpoint));
  });
  upperRadius = Math.max(upperRadius, minRadius + 1e-6);

  let bestRadius = minRadius;
  let bestResult = evaluateCapsuleRadius(points, minRadius);

  if (!bestResult) {
    bestResult = evaluateCapsuleRadius(points, upperRadius);
    bestRadius = upperRadius;
  }

  if (!bestResult) {
    return {
      axis: { x: axis.x, y: axis.y, z: axis.z },
      center: { x: lineCenter.x, y: lineCenter.y, z: lineCenter.z },
      radius: toPositive(minRadius, 0.05),
      length: Math.max(toPositive(minRadius, 0.05) * 2, 0.1),
      volume: computeCapsuleVolume(Math.max(toPositive(minRadius, 0.05) * 2, 0.1), toPositive(minRadius, 0.05)),
    };
  }

  let searchMin = minRadius;
  let searchMax = upperRadius;

  for (let pass = 0; pass < 3; pass += 1) {
    const samples = pass === 0 ? 24 : 18;
    const span = searchMax - searchMin;
    if (span <= 1e-6) break;

    for (let index = 0; index <= samples; index += 1) {
      const radius = searchMin + (span * index) / samples;
      const result = evaluateCapsuleRadius(points, radius);
      if (!result) continue;
      if (!bestResult || result.volume < bestResult.volume) {
        bestResult = result;
        bestRadius = radius;
      }
    }

    const refineSpan = span / Math.max(samples, 1);
    searchMin = Math.max(minRadius, bestRadius - refineSpan * 1.5);
    searchMax = Math.min(upperRadius, bestRadius + refineSpan * 1.5);
  }

  const center = lineCenter.clone().addScaledVector(axis, bestResult.centerT);

  return {
    axis: { x: axis.x, y: axis.y, z: axis.z },
    center: { x: center.x, y: center.y, z: center.z },
    radius: bestRadius,
    length: bestResult.totalLength,
    volume: bestResult.volume,
  };
}

function computePrimitiveFitsForAxis(points: Point3[], axis: Point3): { cylinder: PrimitiveFit; capsule: PrimitiveFit } | null {
  if (points.length === 0) return null;

  const { axis: axisVector, basisU, basisV } = createPerpendicularBasis(axis);
  const projected = points.map((point) => ({
    t: point.x * axisVector.x + point.y * axisVector.y + point.z * axisVector.z,
    u: point.x * basisU.x + point.y * basisU.y + point.z * basisU.z,
    v: point.x * basisV.x + point.y * basisV.y + point.z * basisV.z,
    radial: 0,
  }));

  const circle = computeMinimumEnclosingCircle(projected.map((point) => ({ x: point.u, y: point.v })));
  const lineCenter = new THREE.Vector3()
    .copy(basisU)
    .multiplyScalar(circle.cx)
    .addScaledVector(basisV, circle.cy);

  projected.forEach((point) => {
    point.radial = Math.hypot(point.u - circle.cx, point.v - circle.cy);
  });

  let minT = Infinity;
  let maxT = -Infinity;
  projected.forEach((point) => {
    minT = Math.min(minT, point.t);
    maxT = Math.max(maxT, point.t);
  });
  const cylinderLength = Math.max(0, maxT - minT);
  const cylinderCenter = lineCenter.clone().addScaledVector(axisVector, (minT + maxT) / 2);
  const cylinderRadius = Math.max(circle.r, 1e-8);
  const cylinder = {
    axis: { x: axisVector.x, y: axisVector.y, z: axisVector.z },
    center: { x: cylinderCenter.x, y: cylinderCenter.y, z: cylinderCenter.z },
    radius: cylinderRadius,
    length: cylinderLength,
    volume: Math.PI * cylinderRadius * cylinderRadius * cylinderLength,
  };

  const capsule = computeBestCapsuleFit(projected, axisVector, lineCenter, cylinderRadius);

  return { cylinder, capsule };
}

function computeBestPrimitiveFits(points: Point3[]): MeshAnalysis['primitiveFits'] | undefined {
  if (points.length === 0) return undefined;

  const candidateAxes: Point3[] = [];
  addCandidateAxis(candidateAxes, { x: 1, y: 0, z: 0 });
  addCandidateAxis(candidateAxes, { x: 0, y: 1, z: 0 });
  addCandidateAxis(candidateAxes, { x: 0, y: 0, z: 1 });
  computePrincipalAxes(points).forEach((axis) => addCandidateAxis(candidateAxes, axis));

  let bestCylinder: PrimitiveFit | undefined;
  let bestCapsule: PrimitiveFit | undefined;
  const cylinderCandidates: PrimitiveFit[] = [];
  const capsuleCandidates: PrimitiveFit[] = [];

  candidateAxes.forEach((axis) => {
    const fit = computePrimitiveFitsForAxis(points, axis);
    if (!fit) return;

    cylinderCandidates.push(fit.cylinder);
    capsuleCandidates.push(fit.capsule);

    if (!bestCylinder || fit.cylinder.volume < bestCylinder.volume) {
      bestCylinder = fit.cylinder;
    }
    if (!bestCapsule || fit.capsule.volume < bestCapsule.volume) {
      bestCapsule = fit.capsule;
    }
  });

  return {
    cylinder: bestCylinder,
    capsule: bestCapsule,
    cylinderCandidates: cylinderCandidates.sort((left, right) =>
      left.volume - right.volume || left.length - right.length || left.radius - right.radius
    ),
    capsuleCandidates: capsuleCandidates.sort((left, right) =>
      left.volume - right.volume || left.length - right.length || left.radius - right.radius
    ),
  };
}

function offsetOriginByLocalVector(
  origin: ConversionResult['origin'],
  localOffset: { x: number; y: number; z: number }
): ConversionResult['origin'] {
  _tempEuler.set(origin.rpy.r, origin.rpy.p, origin.rpy.y);
  _tempVec3A.set(localOffset.x, localOffset.y, localOffset.z).applyEuler(_tempEuler);

  return {
    xyz: {
      x: origin.xyz.x + _tempVec3A.x,
      y: origin.xyz.y + _tempVec3A.y,
      z: origin.xyz.z + _tempVec3A.z,
    },
    rpy: {
      r: origin.rpy.r,
      p: origin.rpy.p,
      y: origin.rpy.y,
    },
  };
}

function getPrimaryAxis(bounds: { x: number; y: number; z: number }): MeshPrimaryAxis {
  if (bounds.x >= bounds.y && bounds.x >= bounds.z) return 'x';
  if (bounds.y >= bounds.x && bounds.y >= bounds.z) return 'y';
  return 'z';
}

function getAxisAlignmentQuaternion(axis: MeshPrimaryAxis): THREE.Quaternion {
  _tempQuatB.identity();

  if (axis === 'x') {
    _tempQuatB.setFromAxisAngle(_tempVec3A.set(0, 1, 0), Math.PI / 2);
  } else if (axis === 'y') {
    _tempQuatB.setFromAxisAngle(_tempVec3A.set(1, 0, 0), -Math.PI / 2);
  }

  return _tempQuatB;
}

function getDirectionalAlignmentQuaternion(axis: Point3): THREE.Quaternion {
  const normalizedAxis = canonicalizeAxis(axis);
  if (!normalizedAxis) {
    _tempQuatB.identity();
    return _tempQuatB;
  }

  _tempQuatB.setFromUnitVectors(_zAxis, _tempVec3A.set(normalizedAxis.x, normalizedAxis.y, normalizedAxis.z));
  return _tempQuatB;
}

function alignOriginToPrimaryAxis(
  origin: ConversionResult['origin'],
  primaryAxis: MeshPrimaryAxis
): ConversionResult['origin'] {
  if (primaryAxis === 'z') {
    return origin;
  }

  _tempEuler.set(origin.rpy.r, origin.rpy.p, origin.rpy.y);
  _tempQuat.setFromEuler(_tempEuler);
  _tempQuat.multiply(getAxisAlignmentQuaternion(primaryAxis));
  _tempEulerB.setFromQuaternion(_tempQuat, 'ZYX');

  return {
    xyz: {
      x: origin.xyz.x,
      y: origin.xyz.y,
      z: origin.xyz.z,
    },
    rpy: {
      r: _tempEulerB.x,
      p: _tempEulerB.y,
      y: _tempEulerB.z,
    },
  };
}

function alignOriginToAxis(
  origin: ConversionResult['origin'],
  axis: Point3
): ConversionResult['origin'] {
  _tempEuler.set(origin.rpy.r, origin.rpy.p, origin.rpy.y);
  _tempQuat.setFromEuler(_tempEuler);
  _tempQuat.multiply(getDirectionalAlignmentQuaternion(axis));
  _tempEulerB.setFromQuaternion(_tempQuat, 'ZYX');

  return {
    xyz: {
      x: origin.xyz.x,
      y: origin.xyz.y,
      z: origin.xyz.z,
    },
    rpy: {
      r: _tempEulerB.x,
      p: _tempEulerB.y,
      y: _tempEulerB.z,
    },
  };
}

function getCrossSectionDimensions(
  bounds: { x: number; y: number; z: number },
  primaryAxis: MeshPrimaryAxis
): { length: number; crossA: number; crossB: number } {
  if (primaryAxis === 'x') {
    return { length: bounds.x, crossA: bounds.y, crossB: bounds.z };
  }
  if (primaryAxis === 'y') {
    return { length: bounds.y, crossA: bounds.x, crossB: bounds.z };
  }
  return { length: bounds.z, crossA: bounds.x, crossB: bounds.y };
}

function computeBoxVolume(bounds: { x: number; y: number; z: number }): number {
  return Math.max(bounds.x, 1e-8) * Math.max(bounds.y, 1e-8) * Math.max(bounds.z, 1e-8);
}

function computeEquivalentSphereRadius(targetVolume: number): number {
  return Math.cbrt((3 * Math.max(targetVolume, 1e-8)) / (4 * Math.PI));
}

function computeEquivalentCylinderRadius(length: number, targetVolume: number): number {
  if (!Number.isFinite(length) || length <= 1e-8) {
    return 0;
  }
  return Math.sqrt(Math.max(targetVolume, 1e-8) / (Math.PI * length));
}

function computeCapsuleVolume(totalLength: number, radius: number): number {
  if (totalLength <= 0 || radius <= 0) return 0;
  const clampedRadius = Math.min(radius, totalLength / 2);
  return Math.PI * clampedRadius * clampedRadius * totalLength
    - (2 / 3) * Math.PI * clampedRadius * clampedRadius * clampedRadius;
}

function computePrimitiveVolume(type: GeometryType, radius: number, length: number): number {
  if (type === GeometryType.CYLINDER) {
    return Math.PI * radius * radius * Math.max(length, 0);
  }
  if (type === GeometryType.CAPSULE) {
    return computeCapsuleVolume(length, radius);
  }
  return Number.POSITIVE_INFINITY;
}

function selectBestPrimitiveFitCandidate(
  primitiveFits: MeshAnalysis['primitiveFits'] | undefined,
  newType: GeometryType,
  origin: ConversionResult['origin'],
  context?: ConversionContext,
): {
  fit: PrimitiveFit;
  centeredOrigin: ConversionResult['origin'];
  radius: number;
  length: number;
} | null {
  const candidates = newType === GeometryType.CYLINDER
    ? (primitiveFits?.cylinderCandidates ?? (primitiveFits?.cylinder ? [primitiveFits.cylinder] : []))
    : newType === GeometryType.CAPSULE
      ? (primitiveFits?.capsuleCandidates ?? (primitiveFits?.capsule ? [primitiveFits.capsule] : []))
      : [];

  if (candidates.length === 0) {
    return null;
  }

  const evaluated = candidates
    .map((fit) => {
      const centeredOrigin = offsetOriginByLocalVector(origin, fit.center);
      const axisInLinkSpace = rotateLocalVectorByOrigin(origin, fit.axis);
      const clearanceAdjustedSize = applySiblingCollisionClearance(
        fit.radius,
        fit.length,
        axisInLinkSpace,
        newType,
        context?.siblingGeometries,
        centeredOrigin,
        context?.overlapAllowanceRatio,
      );
      const siblingShiftedOrigin = Math.abs(clearanceAdjustedSize.centerShift) > 1e-8
        ? offsetOriginByLocalVector(centeredOrigin, {
            x: fit.axis.x * clearanceAdjustedSize.centerShift,
            y: fit.axis.y * clearanceAdjustedSize.centerShift,
            z: fit.axis.z * clearanceAdjustedSize.centerShift,
          })
        : centeredOrigin;
      const meshAdjustedSize = applyMeshPointCollisionClearance(
        clearanceAdjustedSize.radius,
        clearanceAdjustedSize.length,
        axisInLinkSpace,
        newType,
        context?.meshClearanceObstacles,
        siblingShiftedOrigin,
        context?.overlapAllowanceRatio,
      );
      const shiftedOrigin = Math.abs(meshAdjustedSize.centerShift) > 1e-8
        ? offsetOriginByLocalVector(siblingShiftedOrigin, {
            x: fit.axis.x * meshAdjustedSize.centerShift,
            y: fit.axis.y * meshAdjustedSize.centerShift,
            z: fit.axis.z * meshAdjustedSize.centerShift,
          })
        : siblingShiftedOrigin;
      const radius = toPositive(meshAdjustedSize.radius, 0.05);
      const length = toPositive(
        newType === GeometryType.CAPSULE
          ? Math.max(meshAdjustedSize.length, radius * 2)
          : meshAdjustedSize.length,
        0.1,
      );

      return {
        fit,
        centeredOrigin: shiftedOrigin,
        radius,
        length,
        adjustedVolume: computePrimitiveVolume(newType, radius, length),
        centerShiftMagnitude: Math.abs(clearanceAdjustedSize.centerShift + meshAdjustedSize.centerShift),
      };
    })
    .filter((candidate) => Number.isFinite(candidate.adjustedVolume) && candidate.adjustedVolume > 0);

  if (evaluated.length === 0) {
    return null;
  }

  const minFitVolume = evaluated.reduce(
    (minVolume, candidate) => Math.min(minVolume, candidate.fit.volume),
    Number.POSITIVE_INFINITY,
  );
  const fitVolumeWindowRatio = Math.max(context?.fitVolumeWindowRatio ?? 1.25, 1);
  const finalists = evaluated
    .filter((candidate) => candidate.fit.volume <= minFitVolume * fitVolumeWindowRatio + 1e-8)
    .sort((left, right) =>
      right.adjustedVolume - left.adjustedVolume ||
      left.centerShiftMagnitude - right.centerShiftMagnitude ||
      left.fit.volume - right.fit.volume ||
      left.length - right.length ||
      left.radius - right.radius
    );

  const best = finalists[0] ?? evaluated[0];
  return best ?? null;
}

function computeEquivalentCapsuleRadius(totalLength: number, targetVolume: number): number {
  if (!Number.isFinite(totalLength) || totalLength <= 1e-8) {
    return 0;
  }

  const safeVolume = Math.max(targetVolume, 1e-8);
  const maxRadius = totalLength / 2;
  const maxAchievableVolume = computeCapsuleVolume(totalLength, maxRadius);

  if (safeVolume >= maxAchievableVolume) {
    return maxRadius;
  }

  let low = 0;
  let high = maxRadius;

  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (computeCapsuleVolume(totalLength, mid) < safeVolume) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

/**
 * Convert geometry dimensions when switching between geometry types.
 * Uses stable, deterministic mapping and preserves origin rotation.
 * When meshBounds is supplied (from mesh bounding box), uses it for
 * smart sizing when converting FROM a mesh geometry.
 */
export function convertGeometryType(
  geomData: GeomData,
  newType: GeometryType,
  meshAnalysis?: MeshAnalysis,
  context?: ConversionContext,
): ConversionResult {
  const currentType = geomData.type;
  const currentDims = normalizeDimensions(geomData.dimensions);
  const origin = normalizeOrigin(geomData.origin);

  // ── Smart conversion FROM mesh using actual bounding box ──────────────────
  if (currentType === GeometryType.MESH && meshAnalysis?.bounds) {
    const fittedPrimitive = selectBestPrimitiveFitCandidate(
      meshAnalysis.primitiveFits,
      newType,
      origin,
      context,
    );

    if (fittedPrimitive) {
      return {
        type: newType,
        dimensions: {
          x: fittedPrimitive.radius,
          y: fittedPrimitive.length,
          z: fittedPrimitive.radius,
        },
        origin: alignOriginToAxis(fittedPrimitive.centeredOrigin, fittedPrimitive.fit.axis),
      };
    }

    const { x: bx, y: by, z: bz, cx, cy, cz } = meshAnalysis.bounds;
    const centeredOrigin = offsetOriginByLocalVector(origin, { x: cx, y: cy, z: cz });
    const targetVolume = computeBoxVolume(meshAnalysis.bounds);

    if (newType === GeometryType.BOX) {
      const siblingAdjustedOrigin = context?.siblingGeometries?.length
        ? applySiblingBoxClearance(
            {
              x: toPositive(bx, DEFAULT_DIMENSIONS.x),
              y: toPositive(by, DEFAULT_DIMENSIONS.y),
              z: toPositive(bz, DEFAULT_DIMENSIONS.z),
            },
            centeredOrigin,
            context.siblingGeometries,
          )
        : centeredOrigin;
      const meshAdjustedBox = applyMeshPointBoxClearance(
        {
          x: toPositive(bx, DEFAULT_DIMENSIONS.x),
          y: toPositive(by, DEFAULT_DIMENSIONS.y),
          z: toPositive(bz, DEFAULT_DIMENSIONS.z),
        },
        siblingAdjustedOrigin,
        context?.meshClearanceObstacles,
      );

      return {
        type: newType,
        dimensions: meshAdjustedBox.dimensions,
        origin: meshAdjustedBox.origin,
      };
    }

    if (newType === GeometryType.SPHERE) {
      const sphereRadius = toPositive(computeEquivalentSphereRadius(targetVolume), 0.1);
      return {
        type: newType,
        dimensions: { x: sphereRadius, y: sphereRadius, z: sphereRadius },
        origin: centeredOrigin,
      };
    }

    if (newType === GeometryType.CYLINDER) {
      const primaryAxis = getPrimaryAxis(meshAnalysis.bounds);
      const localAxis = getAxisVectorForPrimaryAxis(primaryAxis);
      const { length } = getCrossSectionDimensions(meshAnalysis.bounds, primaryAxis);
      const rawRadius = computeEquivalentCylinderRadius(length, targetVolume);
      const radius = toPositive(rawRadius, 0.05);
      const safeLength = toPositive(length, 0.5);
      const axisInLinkSpace = rotateLocalVectorByOrigin(origin, localAxis);
      const clearanceAdjustedSize = applySiblingCollisionClearance(
        radius,
        safeLength,
        axisInLinkSpace,
        newType,
        context?.siblingGeometries,
        centeredOrigin,
        context?.overlapAllowanceRatio,
      );
      const siblingShiftedOrigin = Math.abs(clearanceAdjustedSize.centerShift) > 1e-8
        ? offsetOriginByLocalVector(centeredOrigin, {
            x: localAxis.x * clearanceAdjustedSize.centerShift,
            y: localAxis.y * clearanceAdjustedSize.centerShift,
            z: localAxis.z * clearanceAdjustedSize.centerShift,
          })
        : centeredOrigin;
      const meshAdjustedSize = applyMeshPointCollisionClearance(
        clearanceAdjustedSize.radius,
        clearanceAdjustedSize.length,
        axisInLinkSpace,
        newType,
        context?.meshClearanceObstacles,
        siblingShiftedOrigin,
        context?.overlapAllowanceRatio,
      );
      const shiftedOrigin = Math.abs(meshAdjustedSize.centerShift) > 1e-8
        ? offsetOriginByLocalVector(siblingShiftedOrigin, {
            x: localAxis.x * meshAdjustedSize.centerShift,
            y: localAxis.y * meshAdjustedSize.centerShift,
            z: localAxis.z * meshAdjustedSize.centerShift,
          })
        : siblingShiftedOrigin;

      return {
        type: newType,
        dimensions: {
          x: meshAdjustedSize.radius,
          y: meshAdjustedSize.length,
          z: meshAdjustedSize.radius,
        },
        origin: alignOriginToPrimaryAxis(shiftedOrigin, primaryAxis),
      };
    }

    if (newType === GeometryType.CAPSULE) {
      const primaryAxis = getPrimaryAxis(meshAnalysis.bounds);
      const localAxis = getAxisVectorForPrimaryAxis(primaryAxis);
      const { length } = getCrossSectionDimensions(meshAnalysis.bounds, primaryAxis);
      const safeLength = toPositive(length, 0.5);
      const rawRadius = computeEquivalentCapsuleRadius(safeLength, targetVolume);
      const radius = toPositive(rawRadius, 0.05);
      const axisInLinkSpace = rotateLocalVectorByOrigin(origin, localAxis);
      const clearanceAdjustedSize = applySiblingCollisionClearance(
        radius,
        Math.max(safeLength, radius * 2),
        axisInLinkSpace,
        newType,
        context?.siblingGeometries,
        centeredOrigin,
        context?.overlapAllowanceRatio,
      );
      const siblingShiftedOrigin = Math.abs(clearanceAdjustedSize.centerShift) > 1e-8
        ? offsetOriginByLocalVector(centeredOrigin, {
            x: localAxis.x * clearanceAdjustedSize.centerShift,
            y: localAxis.y * clearanceAdjustedSize.centerShift,
            z: localAxis.z * clearanceAdjustedSize.centerShift,
          })
        : centeredOrigin;
      const meshAdjustedSize = applyMeshPointCollisionClearance(
        clearanceAdjustedSize.radius,
        Math.max(clearanceAdjustedSize.length, clearanceAdjustedSize.radius * 2),
        axisInLinkSpace,
        newType,
        context?.meshClearanceObstacles,
        siblingShiftedOrigin,
        context?.overlapAllowanceRatio,
      );
      const shiftedOrigin = Math.abs(meshAdjustedSize.centerShift) > 1e-8
        ? offsetOriginByLocalVector(siblingShiftedOrigin, {
            x: localAxis.x * meshAdjustedSize.centerShift,
            y: localAxis.y * meshAdjustedSize.centerShift,
            z: localAxis.z * meshAdjustedSize.centerShift,
          })
        : siblingShiftedOrigin;

      return {
        type: newType,
        dimensions: {
          x: meshAdjustedSize.radius,
          y: Math.max(meshAdjustedSize.length, meshAdjustedSize.radius * 2),
          z: meshAdjustedSize.radius,
        },
        origin: alignOriginToPrimaryAxis(shiftedOrigin, primaryAxis),
      };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (newType === GeometryType.CYLINDER || newType === GeometryType.CAPSULE) {
    let radius = 0.05;
    let length = 0.5;
    let localAxis: Point3 = { x: 0, y: 0, z: 1 };
    let nextOrigin = origin;
    let primaryAxis: MeshPrimaryAxis | null = null;

    if (currentType === GeometryType.CYLINDER || currentType === GeometryType.CAPSULE) {
      radius = toPositive(currentDims.x, 0.05);
      length = toPositive(currentDims.y, 0.5);
    } else if (currentType === GeometryType.BOX) {
      primaryAxis = getPrimaryAxis(currentDims);
      localAxis = getAxisVectorForPrimaryAxis(primaryAxis);
      const crossSection = getCrossSectionDimensions(currentDims, primaryAxis);
      radius = toPositive(Math.max(crossSection.crossA, crossSection.crossB) / 2, 0.05);
      length = toPositive(crossSection.length, 0.5);
    } else if (currentType === GeometryType.SPHERE) {
      radius = toPositive(currentDims.x, 0.05);
      length = radius * 2;
    }

    if (context?.siblingGeometries?.length) {
      const axisInLinkSpace = rotateLocalVectorByOrigin(origin, localAxis);
      const clearanceAdjustedSize = applySiblingCollisionClearance(
        radius,
        length,
        axisInLinkSpace,
        newType,
        context.siblingGeometries,
        origin,
        context?.overlapAllowanceRatio,
      );
      radius = clearanceAdjustedSize.radius;
      length = clearanceAdjustedSize.length;
      nextOrigin = Math.abs(clearanceAdjustedSize.centerShift) > 1e-8
        ? offsetOriginByLocalVector(origin, {
            x: localAxis.x * clearanceAdjustedSize.centerShift,
            y: localAxis.y * clearanceAdjustedSize.centerShift,
            z: localAxis.z * clearanceAdjustedSize.centerShift,
          })
        : origin;
    }

    if (context?.meshClearanceObstacles?.length) {
      const axisInLinkSpace = rotateLocalVectorByOrigin(origin, localAxis);
      const meshAdjustedSize = applyMeshPointCollisionClearance(
        radius,
        length,
        axisInLinkSpace,
        newType,
        context.meshClearanceObstacles,
        nextOrigin,
        context?.overlapAllowanceRatio,
      );
      radius = meshAdjustedSize.radius;
      length = meshAdjustedSize.length;
      nextOrigin = Math.abs(meshAdjustedSize.centerShift) > 1e-8
        ? offsetOriginByLocalVector(nextOrigin, {
            x: localAxis.x * meshAdjustedSize.centerShift,
            y: localAxis.y * meshAdjustedSize.centerShift,
            z: localAxis.z * meshAdjustedSize.centerShift,
          })
        : nextOrigin;
    }

    if (primaryAxis) {
      nextOrigin = alignOriginToPrimaryAxis(nextOrigin, primaryAxis);
    }

    return {
      type: newType,
      dimensions: {
        x: radius,
        y: newType === GeometryType.CAPSULE ? Math.max(length, radius * 2) : length,
        z: radius,
      },
      origin: nextOrigin,
    };
  }

  if (newType === GeometryType.SPHERE) {
    let sphereRadius = 0.1;
    if (currentType === GeometryType.CYLINDER || currentType === GeometryType.CAPSULE) {
      sphereRadius = Math.max(currentDims.x, currentDims.y / 2);
    } else if (currentType === GeometryType.BOX) {
      sphereRadius = Math.max(currentDims.x, currentDims.y, currentDims.z) / 2;
    } else {
      sphereRadius = currentDims.x;
    }
    sphereRadius = toPositive(sphereRadius, 0.1);

    return {
      type: newType,
      dimensions: { x: sphereRadius, y: sphereRadius, z: sphereRadius },
      origin,
    };
  }

  if (newType === GeometryType.BOX) {
    let newDims = { ...currentDims };
    let nextOrigin = origin;
    if (currentType === GeometryType.CYLINDER || currentType === GeometryType.CAPSULE) {
      newDims = { x: currentDims.x * 2, y: currentDims.x * 2, z: currentDims.y };
    } else if (currentType === GeometryType.SPHERE) {
      const diameter = currentDims.x * 2;
      newDims = { x: diameter, y: diameter, z: diameter };
    }
    if (context?.siblingGeometries?.length) {
      nextOrigin = applySiblingBoxClearance(newDims, origin, context.siblingGeometries);
    }
    const meshAdjustedBox = applyMeshPointBoxClearance(
      newDims,
      nextOrigin,
      context?.meshClearanceObstacles,
    );
    return {
      type: newType,
      dimensions: meshAdjustedBox.dimensions,
      origin: meshAdjustedBox.origin,
    };
  }

  if (newType === GeometryType.MESH) {
    return {
      type: newType,
      dimensions: currentType === GeometryType.MESH
        ? currentDims
        : { x: 1, y: 1, z: 1 },
      origin,
    };
  }

  // NONE, or any other type
  return {
    type: newType,
    dimensions: currentDims,
    origin,
  };
}
