/**
 * Geometry type conversion utilities.
 * Handles smart dimension/rotation conversion between geometry types,
 * and auto-align computation for cylinders.
 */
import * as THREE from 'three';
import type { RobotState } from '@/types';
import { GeometryType } from '@/types';
import { disposeObject3D } from '@/features/urdf-viewer/utils/dispose';

// Reusable THREE objects - avoid allocation in render/compute paths
const _tempVec3A = new THREE.Vector3();
const _tempVec3B = new THREE.Vector3();
const _tempVec3C = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempQuatB = new THREE.Quaternion();
const _tempEuler = new THREE.Euler();
const _tempEulerB = new THREE.Euler();
const _zAxis = new THREE.Vector3(0, 0, 1);

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

export interface MeshAnalysis {
  bounds: MeshBounds;
  representativeColor?: string;
  primitiveFits?: {
    cylinder?: PrimitiveFit;
    capsule?: PrimitiveFit;
  };
}

interface PrimitiveFit {
  axis: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  radius: number;
  length: number;
  volume: number;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

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
  meshScale?: { x: number; y: number; z: number }
): Promise<MeshAnalysis | null> {
  try {
    const { createLoadingManager, createMeshLoader } = await import('@/core/loaders/meshLoader');
    const manager = createLoadingManager(assets);
    const meshLoader = createMeshLoader(assets, manager);

    return await new Promise<MeshAnalysis | null>((resolve) => {
      meshLoader(meshPath, manager, (obj: THREE.Object3D) => {
        if (!obj || (obj as THREE.Object3D & { userData: { isPlaceholder?: boolean } }).userData?.isPlaceholder) {
          resolve(null);
          return;
        }
        const normalizedScale = normalizeMeshScale(meshScale);
        obj.scale.set(normalizedScale.x, normalizedScale.y, normalizedScale.z);
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const representativeColor = getRepresentativeMeshColor(obj);
        if (box.isEmpty()) {
          disposeObject3D(obj, true);
          resolve(null);
          return;
        }
        const points = collectMeshPoints(obj);
        const primitiveFits = computeBestPrimitiveFits(points);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
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
  const analysis = await computeMeshAnalysisFromAssets(meshPath, assets, meshScale);
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

function collectMeshPoints(object: THREE.Object3D): Point3[] {
  const points: Point3[] = [];
  const vertex = new THREE.Vector3();

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    if (!position) return;

    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      points.push({ x: vertex.x, y: vertex.y, z: vertex.z });
    }
  });

  return points;
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

  candidateAxes.forEach((axis) => {
    const fit = computePrimitiveFitsForAxis(points, axis);
    if (!fit) return;

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
  _tempEulerB.setFromQuaternion(_tempQuat, 'XYZ');

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
  _tempEulerB.setFromQuaternion(_tempQuat, 'XYZ');

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
  meshAnalysis?: MeshAnalysis
): ConversionResult {
  const currentType = geomData.type;
  const currentDims = normalizeDimensions(geomData.dimensions);
  const origin = normalizeOrigin(geomData.origin);

  // ── Smart conversion FROM mesh using actual bounding box ──────────────────
  if (currentType === GeometryType.MESH && meshAnalysis?.bounds) {
    const fittedPrimitive = newType === GeometryType.CYLINDER
      ? meshAnalysis.primitiveFits?.cylinder
      : newType === GeometryType.CAPSULE
        ? meshAnalysis.primitiveFits?.capsule
        : undefined;

    if (fittedPrimitive) {
      const centeredOrigin = offsetOriginByLocalVector(origin, fittedPrimitive.center);
      return {
        type: newType,
        dimensions: {
          x: toPositive(fittedPrimitive.radius, 0.05),
          y: toPositive(
            newType === GeometryType.CAPSULE
              ? Math.max(fittedPrimitive.length, fittedPrimitive.radius * 2)
              : fittedPrimitive.length,
            0.1
          ),
          z: toPositive(fittedPrimitive.radius, 0.05),
        },
        origin: alignOriginToAxis(centeredOrigin, fittedPrimitive.axis),
      };
    }

    const { x: bx, y: by, z: bz, cx, cy, cz } = meshAnalysis.bounds;
    const centeredOrigin = offsetOriginByLocalVector(origin, { x: cx, y: cy, z: cz });
    const targetVolume = computeBoxVolume(meshAnalysis.bounds);

    if (newType === GeometryType.BOX) {
      return {
        type: newType,
        dimensions: {
          x: toPositive(bx, DEFAULT_DIMENSIONS.x),
          y: toPositive(by, DEFAULT_DIMENSIONS.y),
          z: toPositive(bz, DEFAULT_DIMENSIONS.z),
        },
        origin: centeredOrigin,
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
      const { length } = getCrossSectionDimensions(meshAnalysis.bounds, primaryAxis);
      const rawRadius = computeEquivalentCylinderRadius(length, targetVolume);
      const radius = toPositive(rawRadius, 0.05);
      const safeLength = toPositive(length, 0.5);
      return {
        type: newType,
        dimensions: { x: radius, y: safeLength, z: radius },
        origin: alignOriginToPrimaryAxis(centeredOrigin, primaryAxis),
      };
    }

    if (newType === GeometryType.CAPSULE) {
      const primaryAxis = getPrimaryAxis(meshAnalysis.bounds);
      const { length } = getCrossSectionDimensions(meshAnalysis.bounds, primaryAxis);
      const safeLength = toPositive(length, 0.5);
      const rawRadius = computeEquivalentCapsuleRadius(safeLength, targetVolume);
      const radius = toPositive(rawRadius, 0.05);
      return {
        type: newType,
        dimensions: { x: radius, y: Math.max(safeLength, radius * 2), z: radius },
        origin: alignOriginToPrimaryAxis(centeredOrigin, primaryAxis),
      };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (newType === GeometryType.CYLINDER || newType === GeometryType.CAPSULE) {
    let radius = 0.05;
    let length = 0.5;

    if (currentType === GeometryType.CYLINDER || currentType === GeometryType.CAPSULE) {
      radius = toPositive(currentDims.x, 0.05);
      length = toPositive(currentDims.y, 0.5);
    } else if (currentType === GeometryType.BOX) {
      radius = toPositive(Math.max(currentDims.x, currentDims.y) / 2, 0.05);
      length = toPositive(currentDims.z, 0.5);
    } else if (currentType === GeometryType.SPHERE) {
      radius = toPositive(currentDims.x, 0.05);
      length = radius * 2;
    }

    return {
      type: newType,
      dimensions: { x: radius, y: length, z: radius },
      origin,
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
    if (currentType === GeometryType.CYLINDER || currentType === GeometryType.CAPSULE) {
      newDims = { x: currentDims.x * 2, y: currentDims.x * 2, z: currentDims.y };
    } else if (currentType === GeometryType.SPHERE) {
      const diameter = currentDims.x * 2;
      newDims = { x: diameter, y: diameter, z: diameter };
    }
    return {
      type: newType,
      dimensions: newDims,
      origin,
    };
  }

  // MESH, NONE, or any other type
  return {
    type: newType,
    dimensions: currentDims,
    origin,
  };
}
