import {
  DEFAULT_LINK,
  GeometryType,
  type UrdfVisual,
  type UsdSceneMeshDescriptor,
} from '@/types';

function getDefaultPrimitiveDimensions(type: GeometryType): UrdfVisual['dimensions'] {
  switch (type) {
    case GeometryType.BOX:
      return { x: 1, y: 1, z: 1 };
    case GeometryType.SPHERE:
      return { x: 0.5, y: 0, z: 0 };
    case GeometryType.CYLINDER:
    case GeometryType.CAPSULE:
      return {
        x: DEFAULT_LINK.collision.dimensions.x,
        y: DEFAULT_LINK.collision.dimensions.y,
        z: 0,
      };
    default:
      return { x: 1, y: 1, z: 1 };
  }
}

function normalizeFinitePositiveNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 1e-9) {
    return null;
  }
  return numeric;
}

export function getUsdDescriptorPrimitiveType(
  descriptor: UsdSceneMeshDescriptor,
): GeometryType | null {
  const normalized = String(descriptor.primType || '').trim().toLowerCase();

  switch (normalized) {
    case 'box':
    case 'cube':
      return GeometryType.BOX;
    case 'sphere':
      return GeometryType.SPHERE;
    case 'cylinder':
      return GeometryType.CYLINDER;
    case 'capsule':
      return GeometryType.CAPSULE;
    default:
      return null;
  }
}

function getUsdDescriptorAxis(descriptor: UsdSceneMeshDescriptor): 'X' | 'Y' | 'Z' {
  const normalized = String(descriptor.axis || '').trim().toUpperCase();
  if (normalized === 'X' || normalized === 'Y' || normalized === 'Z') {
    return normalized;
  }
  return 'Z';
}

function getUsdDescriptorExtentDimensions(
  descriptor: UsdSceneMeshDescriptor,
): [number, number, number] | null {
  const source = descriptor.extentSize;
  if (!source || typeof source.length !== 'number' || source.length < 3) {
    return null;
  }

  const dimensions = [
    Math.abs(Number(source[0] ?? 0)),
    Math.abs(Number(source[1] ?? 0)),
    Math.abs(Number(source[2] ?? 0)),
  ];

  if (dimensions.some((value) => !Number.isFinite(value) || value <= 1e-9)) {
    return null;
  }

  return [
    Math.max(dimensions[0], 1e-6),
    Math.max(dimensions[1], 1e-6),
    Math.max(dimensions[2], 1e-6),
  ];
}

export function resolveUsdPrimitiveGeometryFromDescriptor(
  descriptor: UsdSceneMeshDescriptor,
  current: UrdfVisual | null | undefined,
): Pick<UrdfVisual, 'type' | 'dimensions'> | null {
  const primitiveType = getUsdDescriptorPrimitiveType(descriptor);
  if (!primitiveType) {
    return null;
  }

  const existing = current && current.type === primitiveType
    ? current.dimensions
    : null;
  const fallback = existing || getDefaultPrimitiveDimensions(primitiveType);
  const extentDimensions = getUsdDescriptorExtentDimensions(descriptor);
  const size = normalizeFinitePositiveNumber(descriptor.size);
  const radius = normalizeFinitePositiveNumber(descriptor.radius);
  const height = normalizeFinitePositiveNumber(descriptor.height);
  const axis = getUsdDescriptorAxis(descriptor);

  if (primitiveType === GeometryType.BOX) {
    return {
      type: GeometryType.BOX,
      dimensions: {
        x: extentDimensions?.[0] ?? size ?? fallback.x,
        y: extentDimensions?.[1] ?? size ?? fallback.y,
        z: extentDimensions?.[2] ?? size ?? fallback.z,
      },
    };
  }

  if (primitiveType === GeometryType.SPHERE) {
    const radiusFromExtent = extentDimensions
      ? Math.max(extentDimensions[0], extentDimensions[1], extentDimensions[2]) * 0.5
      : null;

    return {
      type: GeometryType.SPHERE,
      dimensions: {
        x: radius ?? radiusFromExtent ?? fallback.x,
        y: 0,
        z: 0,
      },
    };
  }

  let radiusFromExtent: number | null = null;
  let heightFromExtent: number | null = null;
  if (extentDimensions) {
    if (axis === 'X') {
      heightFromExtent = extentDimensions[0];
      radiusFromExtent = Math.max(extentDimensions[1], extentDimensions[2]) * 0.5;
    } else if (axis === 'Y') {
      heightFromExtent = extentDimensions[1];
      radiusFromExtent = Math.max(extentDimensions[0], extentDimensions[2]) * 0.5;
    } else {
      heightFromExtent = extentDimensions[2];
      radiusFromExtent = Math.max(extentDimensions[0], extentDimensions[1]) * 0.5;
    }
  }

  return {
    type: primitiveType,
    dimensions: {
      x: radius ?? radiusFromExtent ?? fallback.x,
      y: height ?? heightFromExtent ?? fallback.y,
      z: 0,
    },
  };
}
