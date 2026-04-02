import * as THREE from 'three';
import type { AssemblyComponent, AssemblyTransform, RobotData, UrdfVisual } from '@/types';
import { GeometryType } from '@/types';
import { computeLinkWorldMatrices } from './kinematics';
import { cloneAssemblyTransform, IDENTITY_ASSEMBLY_TRANSFORM } from './assemblyTransforms';
import { getVisualGeometryEntries } from './visualBodies';

const DEFAULT_ASSEMBLY_COMPONENT_PLACEMENT_GAP = 0.12;
const DEFAULT_ASSEMBLY_COMPONENT_HALF_WIDTH = 0.45;

const UNIT_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const UNIT_CYLINDER_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
const UNIT_SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 12, 12);
const UNIT_MESH_FALLBACK_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const IDENTITY_MATRIX = new THREE.Matrix4().identity();

type GeometryBoundsDescriptor = {
  geometry: THREE.BufferGeometry;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  disposeAfterUse?: boolean;
};

function toFiniteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function createGeometryBoundsDescriptor(geometry: UrdfVisual): GeometryBoundsDescriptor | null {
  switch (geometry.type) {
    case GeometryType.BOX:
      return {
        geometry: UNIT_BOX_GEOMETRY,
        scale: new THREE.Vector3(
          toFiniteOr(geometry.dimensions.x, 0),
          toFiniteOr(geometry.dimensions.y, 0),
          toFiniteOr(geometry.dimensions.z, 0),
        ),
        rotation: new THREE.Euler(0, 0, 0, 'ZYX'),
      };
    case GeometryType.PLANE:
      return {
        geometry: UNIT_PLANE_GEOMETRY,
        scale: new THREE.Vector3(
          Math.max(toFiniteOr(geometry.dimensions.x, 1), 1e-6),
          Math.max(toFiniteOr(geometry.dimensions.y, 1), 1e-6),
          1,
        ),
        rotation: new THREE.Euler(0, 0, 0, 'ZYX'),
      };
    case GeometryType.CYLINDER:
      return {
        geometry: UNIT_CYLINDER_GEOMETRY,
        scale: new THREE.Vector3(
          Math.max(toFiniteOr(geometry.dimensions.x, 0), 0),
          Math.max(toFiniteOr(geometry.dimensions.y, 0), 0),
          Math.max(toFiniteOr(geometry.dimensions.z, geometry.dimensions.x), 0),
        ),
        rotation: new THREE.Euler(-Math.PI / 2, 0, 0, 'ZYX'),
      };
    case GeometryType.SPHERE:
    case GeometryType.ELLIPSOID:
      return {
        geometry: UNIT_SPHERE_GEOMETRY,
        scale: new THREE.Vector3(
          Math.max(toFiniteOr(geometry.dimensions.x, 0), 0),
          Math.max(toFiniteOr(geometry.dimensions.y, geometry.dimensions.x), 0),
          Math.max(toFiniteOr(geometry.dimensions.z, geometry.dimensions.x), 0),
        ),
        rotation: new THREE.Euler(0, 0, 0, 'ZYX'),
      };
    case GeometryType.CAPSULE: {
      const radius = Math.max(toFiniteOr(geometry.dimensions.x, 0), 0);
      const totalLength = Math.max(toFiniteOr(geometry.dimensions.y, 0), 0);
      const cylinderLength = Math.max(0, totalLength - 2 * radius);
      return {
        geometry: new THREE.CapsuleGeometry(radius, cylinderLength, 4, 8),
        scale: new THREE.Vector3(1, 1, 1),
        rotation: new THREE.Euler(-Math.PI / 2, 0, 0, 'ZYX'),
        disposeAfterUse: true,
      };
    }
    case GeometryType.MESH:
      return {
        geometry: UNIT_MESH_FALLBACK_GEOMETRY,
        scale: new THREE.Vector3(
          Math.max(toFiniteOr(geometry.dimensions.x, 1), 1e-6),
          Math.max(toFiniteOr(geometry.dimensions.y, 1), 1e-6),
          Math.max(toFiniteOr(geometry.dimensions.z, 1), 1e-6),
        ),
        rotation: new THREE.Euler(0, 0, 0, 'ZYX'),
      };
    default:
      return null;
  }
}

function unionGeometryBounds(
  bounds: THREE.Box3,
  hasBounds: { current: boolean },
  linkMatrix: THREE.Matrix4,
  geometry: UrdfVisual,
): void {
  const descriptor = createGeometryBoundsDescriptor(geometry);
  if (!descriptor) {
    return;
  }

  if (!descriptor.geometry.boundingBox) {
    descriptor.geometry.computeBoundingBox();
  }

  const geometryBox = descriptor.geometry.boundingBox;
  if (!geometryBox) {
    if (descriptor.disposeAfterUse) {
      descriptor.geometry.dispose();
    }
    return;
  }

  const origin = geometry.origin ?? {
    xyz: { x: 0, y: 0, z: 0 },
    rpy: { r: 0, p: 0, y: 0 },
  };
  const originMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(
      toFiniteOr(origin.xyz?.x, 0),
      toFiniteOr(origin.xyz?.y, 0),
      toFiniteOr(origin.xyz?.z, 0),
    ),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      toFiniteOr(origin.rpy?.r, 0),
      toFiniteOr(origin.rpy?.p, 0),
      toFiniteOr(origin.rpy?.y, 0),
      'ZYX',
    )),
    new THREE.Vector3(1, 1, 1),
  );
  const childMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion().setFromEuler(descriptor.rotation),
    descriptor.scale,
  );
  const worldMatrix = linkMatrix.clone().multiply(originMatrix).multiply(childMatrix);
  const worldBox = geometryBox.clone().applyMatrix4(worldMatrix);

  if (!hasBounds.current) {
    bounds.copy(worldBox);
    hasBounds.current = true;
  } else {
    bounds.union(worldBox);
  }

  if (descriptor.disposeAfterUse) {
    descriptor.geometry.dispose();
  }
}

function estimateRobotRenderableBounds(robot: RobotData): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  const hasBounds = { current: false };
  const linkWorldMatrices = computeLinkWorldMatrices(robot);

  Object.entries(robot.links).forEach(([linkId, link]) => {
    const linkMatrix = linkWorldMatrices[linkId] ?? IDENTITY_MATRIX;

    getVisualGeometryEntries(link).forEach((entry) => {
      unionGeometryBounds(bounds, hasBounds, linkMatrix, entry.geometry);
    });

    if (!hasBounds.current && link.collision.type !== GeometryType.NONE) {
      unionGeometryBounds(bounds, hasBounds, linkMatrix, link.collision);
    }

    if (!hasBounds.current) {
      (link.collisionBodies ?? []).forEach((body) => {
        if (body.type !== GeometryType.NONE) {
          unionGeometryBounds(bounds, hasBounds, linkMatrix, body);
        }
      });
    }
  });

  return hasBounds.current ? bounds : null;
}

function transformBounds(bounds: THREE.Box3, transform?: AssemblyTransform | null): THREE.Box3 {
  const normalized = cloneAssemblyTransform(transform);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(
      normalized.position.x,
      normalized.position.y,
      normalized.position.z,
    ),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      normalized.rotation.r,
      normalized.rotation.p,
      normalized.rotation.y,
      'ZYX',
    )),
    new THREE.Vector3(1, 1, 1),
  );

  return bounds.clone().applyMatrix4(matrix);
}

function buildFallbackBounds(): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(
      -DEFAULT_ASSEMBLY_COMPONENT_HALF_WIDTH,
      -DEFAULT_ASSEMBLY_COMPONENT_HALF_WIDTH,
      0,
    ),
    new THREE.Vector3(
      DEFAULT_ASSEMBLY_COMPONENT_HALF_WIDTH,
      DEFAULT_ASSEMBLY_COMPONENT_HALF_WIDTH,
      0,
    ),
  );
}

export function buildDefaultAssemblyComponentPlacementTransform({
  robot,
  existingComponents,
  gap = DEFAULT_ASSEMBLY_COMPONENT_PLACEMENT_GAP,
}: {
  robot: RobotData;
  existingComponents: AssemblyComponent[];
  gap?: number;
}): AssemblyTransform {
  if (existingComponents.length === 0) {
    return cloneAssemblyTransform(IDENTITY_ASSEMBLY_TRANSFORM);
  }

  const nextBounds = estimateRobotRenderableBounds(robot) ?? buildFallbackBounds();
  let maxExistingX = Number.NEGATIVE_INFINITY;

  existingComponents.forEach((component) => {
    const componentBounds = estimateRobotRenderableBounds(component.robot) ?? buildFallbackBounds();
    maxExistingX = Math.max(
      maxExistingX,
      transformBounds(componentBounds, component.transform).max.x,
    );
  });

  if (!Number.isFinite(maxExistingX)) {
    maxExistingX = 0;
  }

  return cloneAssemblyTransform({
    position: {
      x: maxExistingX + gap - nextBounds.min.x,
      y: 0,
      z: Number.isFinite(nextBounds.min.z) ? -nextBounds.min.z : 0,
    },
    rotation: { ...IDENTITY_ASSEMBLY_TRANSFORM.rotation },
  });
}
