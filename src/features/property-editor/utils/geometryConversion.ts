/**
 * Geometry type conversion utilities.
 * Handles smart dimension/rotation conversion between geometry types,
 * and auto-align computation for cylinders.
 */
import * as THREE from 'three';
import type { RobotState } from '@/types';
import { GeometryType } from '@/types';

// Reusable THREE objects - avoid allocation in render/compute paths
const _tempVec3A = new THREE.Vector3();
const _tempVec3B = new THREE.Vector3();
const _tempVec3C = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
const _tempEuler = new THREE.Euler();
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

/**
 * Convert geometry dimensions when switching between geometry types.
 * Uses stable, deterministic mapping and preserves origin rotation.
 */
export function convertGeometryType(geomData: GeomData, newType: GeometryType): ConversionResult {
  const currentType = geomData.type;
  const currentDims = normalizeDimensions(geomData.dimensions);
  const origin = normalizeOrigin(geomData.origin);

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
