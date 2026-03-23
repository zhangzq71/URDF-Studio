import * as THREE from 'three';

import { MathUtils } from './math.ts';

type GeometryTypeValue = 'box' | 'cylinder' | 'sphere' | 'capsule' | 'mesh' | 'none';

interface Vector3Like {
  x?: number;
  y?: number;
  z?: number;
}

interface GeometryLike {
  type?: GeometryTypeValue;
  dimensions?: Vector3Like;
}

interface InertiaLike {
  ixx?: number;
  ixy?: number;
  ixz?: number;
  iyy?: number;
  iyz?: number;
  izz?: number;
}

interface InertialLike {
  mass?: number;
  inertia?: InertiaLike;
}

interface LinkLike {
  visual?: GeometryLike;
  collision?: GeometryLike;
  collisionBodies?: GeometryLike[];
  inertial?: InertialLike;
}

export interface PrincipalAxisVector {
  x: number;
  y: number;
  z: number;
}

export interface InertialDerivedValues {
  diagonalInertia: [number, number, number];
  principalAxes: [PrincipalAxisVector, PrincipalAxisVector, PrincipalAxisVector];
}

export interface LinkDensityResult {
  value: number | null;
  volume: number | null;
  source: 'collision' | 'visual' | null;
}

const MIN_VOLUME = 1e-8;

function toFiniteDimension(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function computeCapsuleVolume(totalLength: number, radius: number): number {
  if (totalLength <= 0 || radius <= 0) return 0;
  const clampedRadius = Math.min(radius, totalLength / 2);
  return Math.PI * clampedRadius * clampedRadius * totalLength
    - (2 / 3) * Math.PI * clampedRadius * clampedRadius * clampedRadius;
}

function normalizeAxis(axis: PrincipalAxisVector): PrincipalAxisVector {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length <= 1e-12) {
    return { x: 1, y: 0, z: 0 };
  }

  let normalized = {
    x: axis.x / length,
    y: axis.y / length,
    z: axis.z / length,
  };

  const rankedComponents = [
    { key: 'x' as const, value: Math.abs(normalized.x) },
    { key: 'y' as const, value: Math.abs(normalized.y) },
    { key: 'z' as const, value: Math.abs(normalized.z) },
  ].sort((left, right) => right.value - left.value);

  const dominantKey = rankedComponents[0]?.key;
  const dominantValue = dominantKey ? normalized[dominantKey] : 1;

  if (dominantValue < 0) {
    normalized = {
      x: -normalized.x,
      y: -normalized.y,
      z: -normalized.z,
    };
  }

  return normalized;
}

export function computeGeometryVolume(geometry: GeometryLike | undefined): number | null {
  if (!geometry?.type || geometry.type === 'none' || geometry.type === 'mesh') {
    return null;
  }

  const x = Math.max(toFiniteDimension(geometry.dimensions?.x), 0);
  const y = Math.max(toFiniteDimension(geometry.dimensions?.y), 0);
  const z = Math.max(toFiniteDimension(geometry.dimensions?.z, x), 0);

  if (geometry.type === 'box') {
    return Math.max(x * y * z, 0);
  }

  if (geometry.type === 'cylinder') {
    return Math.PI * x * x * y;
  }

  if (geometry.type === 'sphere') {
    return (4 / 3) * Math.PI * x * Math.max(y, x) * Math.max(z, x);
  }

  if (geometry.type === 'capsule') {
    return computeCapsuleVolume(y, x);
  }

  return null;
}

function computeDensityFromGeometries(
  mass: number,
  geometries: GeometryLike[],
): { value: number | null; volume: number | null } {
  const volumes = geometries.map((geometry) => computeGeometryVolume(geometry));
  if (volumes.some((volume) => volume === null)) {
    return { value: null, volume: null };
  }

  const totalVolume = volumes.reduce((sum, volume) => sum + (volume ?? 0), 0);
  if (!Number.isFinite(totalVolume) || totalVolume < MIN_VOLUME || mass <= 0) {
    return { value: null, volume: totalVolume || null };
  }

  return {
    value: mass / totalVolume,
    volume: totalVolume,
  };
}

export function computeLinkDensity(link: LinkLike | undefined): LinkDensityResult {
  const mass = Number(link?.inertial?.mass ?? 0);
  const collisionGeometries = [link?.collision, ...(link?.collisionBodies ?? [])]
    .filter((geometry): geometry is GeometryLike => Boolean(geometry?.type && geometry.type !== 'none'));

  if (collisionGeometries.length > 0) {
    const density = computeDensityFromGeometries(mass, collisionGeometries);
    return {
      ...density,
      source: 'collision',
    };
  }

  if (link?.visual?.type && link.visual.type !== 'none') {
    const density = computeDensityFromGeometries(mass, [link.visual]);
    return {
      ...density,
      source: 'visual',
    };
  }

  return {
    value: null,
    volume: null,
    source: null,
  };
}

export function computeInertialDerivedValues(inertial: InertialLike | undefined): InertialDerivedValues | null {
  if (!inertial?.inertia) {
    return null;
  }

  const matrix = new THREE.Matrix3();
  matrix.set(
    Number(inertial.inertia.ixx ?? 0),
    Number(inertial.inertia.ixy ?? 0),
    Number(inertial.inertia.ixz ?? 0),
    Number(inertial.inertia.ixy ?? 0),
    Number(inertial.inertia.iyy ?? 0),
    Number(inertial.inertia.iyz ?? 0),
    Number(inertial.inertia.ixz ?? 0),
    Number(inertial.inertia.iyz ?? 0),
    Number(inertial.inertia.izz ?? 0),
  );

  const decomposition = MathUtils.computeEigenDecomposition3x3(matrix);
  const principalPairs = decomposition.eigenvalues
    .map((value, index) => ({
      value,
      axis: normalizeAxis({
        x: decomposition.eigenvectors[0][index],
        y: decomposition.eigenvectors[1][index],
        z: decomposition.eigenvectors[2][index],
      }),
    }))
    .sort((left, right) => left.value - right.value);

  if (principalPairs.some((entry) => !Number.isFinite(entry.value))) {
    return null;
  }

  return {
    diagonalInertia: [
      principalPairs[0].value,
      principalPairs[1].value,
      principalPairs[2].value,
    ],
    principalAxes: [
      principalPairs[0].axis,
      principalPairs[1].axis,
      principalPairs[2].axis,
    ],
  };
}
