import { DEFAULT_LINK, GeometryType } from '@/types';
import type { UrdfLink } from '@/types';

const ZERO_VECTOR = { x: 0, y: 0, z: 0 } as const;
const ZERO_RPY = { r: 0, p: 0, y: 0 } as const;

function buildCollisionGeometryFromParent(parentLink: UrdfLink): UrdfLink['collision'] {
  const sourceGeometry = parentLink.visual.type !== GeometryType.NONE
    ? parentLink.visual
    : parentLink.collision.type !== GeometryType.NONE
      ? parentLink.collision
      : DEFAULT_LINK.collision;

  return {
    ...DEFAULT_LINK.collision,
    ...sourceGeometry,
    color: DEFAULT_LINK.collision.color,
    materialSource: undefined,
  };
}

function getCollisionBodyCount(link: UrdfLink): number {
  const primary = link.collision.type !== GeometryType.NONE ? 1 : 0;
  const extras = (link.collisionBodies || []).filter((body) => body.type !== GeometryType.NONE).length;
  return primary + extras;
}

function createCollisionBodyFromLink(link: UrdfLink): UrdfLink['collision'] {
  const source = buildCollisionGeometryFromParent(link);
  const count = getCollisionBodyCount(link);
  const offset = count * 0.08;
  const origin = source.origin || { xyz: { ...ZERO_VECTOR }, rpy: { ...ZERO_RPY } };

  return {
    ...source,
    visible: true,
    origin: {
      xyz: {
        x: origin.xyz.x,
        y: origin.xyz.y + offset,
        z: origin.xyz.z,
      },
      rpy: { ...origin.rpy },
    },
  };
}

export function appendCollisionBody(link: UrdfLink): UrdfLink {
  const newBody = createCollisionBodyFromLink(link);
  const hasPrimary = link.collision.type !== GeometryType.NONE;

  if (!hasPrimary) {
    return {
      ...link,
      collision: newBody,
      collisionBodies: link.collisionBodies || [],
    };
  }

  return {
    ...link,
    collisionBodies: [...(link.collisionBodies || []), newBody],
  };
}

export function optimizeCylinderCollisionsToCapsules(link: UrdfLink): { link: UrdfLink; optimizedCount: number } {
  let optimizedCount = 0;
  let nextCollision = link.collision;
  let nextCollisionBodies = link.collisionBodies;

  if (link.collision.type === GeometryType.CYLINDER) {
    nextCollision = {
      ...link.collision,
      type: GeometryType.CAPSULE,
    };
    optimizedCount += 1;
  }

  if (link.collisionBodies?.length) {
    let collisionBodiesChanged = false;
    nextCollisionBodies = link.collisionBodies.map((body) => {
      if (body.type !== GeometryType.CYLINDER) return body;
      collisionBodiesChanged = true;
      optimizedCount += 1;
      return {
        ...body,
        type: GeometryType.CAPSULE,
      };
    });

    if (!collisionBodiesChanged) {
      nextCollisionBodies = link.collisionBodies;
    }
  }

  if (optimizedCount === 0) {
    return { link, optimizedCount: 0 };
  }

  return {
    link: {
      ...link,
      collision: nextCollision,
      collisionBodies: nextCollisionBodies,
    },
    optimizedCount,
  };
}
