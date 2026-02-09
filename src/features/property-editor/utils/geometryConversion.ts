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
  if (_tempVec3C.y === 0 && _tempVec3C.x === 0 && _tempVec3C.z === -1) {
    _tempQuat.setFromAxisAngle(_tempVec3A.set(1, 0, 0), Math.PI);
  } else {
    _tempQuat.setFromUnitVectors(_zAxis, _tempVec3C);
  }

  _tempEuler.setFromQuaternion(_tempQuat);

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

/**
 * Convert geometry dimensions when switching between geometry types.
 * Performs smart conversion (e.g. rotating cylinder to match dominant axis).
 */
export function convertGeometryType(geomData: GeomData, newType: GeometryType): ConversionResult {
  const currentDims = geomData.dimensions || { x: 0.1, y: 0.5, z: 0.1 };
  const defaultOrigin = geomData.origin || { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } };

  if (newType === GeometryType.CYLINDER || newType === GeometryType.CAPSULE) {
    const { x, y, z } = currentDims;
    const maxDim = Math.max(x, y, z);

    let length = maxDim;
    let radius = 0.1;

    const currentRpy = geomData.origin?.rpy || { r: 0, p: 0, y: 0 };
    const currentQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(currentRpy.r, currentRpy.p, currentRpy.y, 'XYZ')
    );

    const zAxis = new THREE.Vector3(0, 0, 1);
    const targetAxis = new THREE.Vector3(0, 0, 1);

    if (x === maxDim) {
      length = x;
      radius = Math.max(y, z) / 2;
      targetAxis.set(1, 0, 0);
    } else if (y === maxDim) {
      length = y;
      radius = Math.max(x, z) / 2;
      targetAxis.set(0, 1, 0);
    } else {
      length = z;
      radius = Math.max(x, y) / 2;
      targetAxis.set(0, 0, 1);
    }

    const alignQuat = new THREE.Quaternion().setFromUnitVectors(zAxis, targetAxis);
    currentQuat.multiply(alignQuat);

    const newEuler = new THREE.Euler().setFromQuaternion(currentQuat, 'XYZ');
    const newRpy = { r: newEuler.x, p: newEuler.y, y: newEuler.z };

    return {
      type: newType,
      dimensions: { x: radius, y: length, z: radius },
      origin: { ...(geomData.origin || { xyz: { x: 0, y: 0, z: 0 } }), rpy: newRpy } as ConversionResult['origin']
    };
  }

  if (newType === GeometryType.SPHERE) {
    const sphereRadius = Math.max(0.05, (currentDims.x + currentDims.y + currentDims.z) / 3);
    return {
      type: newType,
      dimensions: { x: sphereRadius, y: sphereRadius, z: sphereRadius },
      origin: defaultOrigin
    };
  }

  if (newType === GeometryType.BOX) {
    let newDims = { ...currentDims };
    if (geomData.type === GeometryType.CYLINDER || geomData.type === GeometryType.CAPSULE) {
      newDims = { x: currentDims.x * 2, y: currentDims.x * 2, z: currentDims.y };
    } else if (geomData.type === GeometryType.SPHERE) {
      const diameter = currentDims.x * 2;
      newDims = { x: diameter, y: diameter, z: diameter };
    }
    return {
      type: newType,
      dimensions: newDims,
      origin: defaultOrigin
    };
  }

  // MESH, NONE, or any other type
  return {
    type: newType,
    dimensions: currentDims,
    origin: defaultOrigin
  };
}
