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

export interface MeshBounds {
  x: number;
  y: number;
  z: number;
  cx: number; // bounding box center x (mesh-local, scaled to meters)
  cy: number; // bounding box center y
  cz: number; // bounding box center z
}

/**
 * Asynchronously compute the bounding box size of a mesh from asset storage.
 * Returns null if the mesh cannot be found, loaded, or has an empty bounding box.
 */
export async function computeMeshBoundsFromAssets(
  meshPath: string,
  assets: Record<string, string>
): Promise<MeshBounds | null> {
  try {
    const { createLoadingManager, createMeshLoader } = await import('@/core/loaders/meshLoader');
    const manager = createLoadingManager(assets);
    const meshLoader = createMeshLoader(assets, manager);

    return await new Promise<MeshBounds | null>((resolve) => {
      meshLoader(meshPath, manager, (obj: THREE.Object3D) => {
        if (!obj || (obj as THREE.Object3D & { userData: { isPlaceholder?: boolean } }).userData?.isPlaceholder) {
          resolve(null);
          return;
        }
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        disposeObject3D(obj, true);
        if (box.isEmpty()) { resolve(null); return; }
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        resolve({
          x: Math.abs(size.x),
          y: Math.abs(size.y),
          z: Math.abs(size.z),
          cx: center.x,
          cy: center.y,
          cz: center.z,
        });
      });
    });
  } catch {
    return null;
  }
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
 * When converting FROM a mesh, pick the best axis ordering:
 * - longest axis → dims.y (length/height for cylinder/capsule)
 * - max of remaining two → dims.x = dims.z (radius)
 */
function boundsToRadiusLength(bounds: { x: number; y: number; z: number }): { radius: number; length: number } {
  const allDims: [number, number, number] = [bounds.x, bounds.y, bounds.z];
  const maxVal = Math.max(...allDims);
  const maxIdx = allDims.indexOf(maxVal);
  const others = allDims.filter((_, i) => i !== maxIdx);
  const rawRadius = Math.max(others[0], others[1]) / 2;
  return { radius: rawRadius, length: maxVal };
}

/**
 * Convert geometry dimensions when switching between geometry types.
 * Uses stable, deterministic mapping and preserves origin rotation.
 * When meshBounds is supplied (from mesh bounding box), uses it for
 * smart sizing when converting FROM a mesh geometry.
 */
export function convertGeometryType(geomData: GeomData, newType: GeometryType, meshBounds?: MeshBounds): ConversionResult {
  const currentType = geomData.type;
  const currentDims = normalizeDimensions(geomData.dimensions);
  const origin = normalizeOrigin(geomData.origin);

  // ── Smart conversion FROM mesh using actual bounding box ──────────────────
  if (currentType === GeometryType.MESH && meshBounds) {
    const { x: bx, y: by, z: bz, cx, cy, cz } = meshBounds;

    // Center the primitive at the mesh's bounding box center.
    // origin.xyz already places the mesh frame relative to link frame;
    // adding the bb center moves the primitive to match the mesh's visual center.
    const centeredOrigin: ConversionResult['origin'] = {
      xyz: {
        x: origin.xyz.x + cx,
        y: origin.xyz.y + cy,
        z: origin.xyz.z + cz,
      },
      rpy: origin.rpy,
    };

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
      const sphereRadius = toPositive(Math.max(bx, by, bz) / 2, 0.1);
      return {
        type: newType,
        dimensions: { x: sphereRadius, y: sphereRadius, z: sphereRadius },
        origin: centeredOrigin,
      };
    }

    if (newType === GeometryType.CYLINDER) {
      const { radius: rawRadius, length } = boundsToRadiusLength({ x: bx, y: by, z: bz });
      const radius = toPositive(rawRadius, 0.05);
      const safeLength = toPositive(length, 0.5);
      return {
        type: newType,
        dimensions: { x: radius, y: safeLength, z: radius },
        origin: centeredOrigin,
      };
    }

    if (newType === GeometryType.CAPSULE) {
      const { radius: rawRadius, length } = boundsToRadiusLength({ x: bx, y: by, z: bz });
      // Clamp radius so at least 1/3 of total length is cylindrical body
      // (body = totalLength - 2*radius, want body >= totalLength/3)
      const maxRadius = length / 3;
      const radius = toPositive(Math.min(rawRadius, maxRadius), 0.05);
      const safeLength = toPositive(Math.max(length, radius * 2), 0.5);
      return {
        type: newType,
        dimensions: { x: radius, y: safeLength, z: radius },
        origin: centeredOrigin,
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
