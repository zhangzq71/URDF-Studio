import * as THREE from 'three';

const DEFAULT_MIN_PADDING = 0.012;
const DEFAULT_PADDING_RATIO = 0.16;

export interface HoverBoundsCandidate<TMeta> {
  mesh: THREE.Mesh;
  meta: TMeta;
}

export interface HoverMatch<TMeta> {
  meta: TMeta;
  distance: number;
  padding?: number;
}

interface LinkBoundsEntry<TMeta> {
  meta: TMeta;
  bounds: THREE.Box3;
  maxExtent: number;
}

const pooledGeometryBounds = new THREE.Box3();
const pooledWorldBounds = new THREE.Box3();
const pooledExpandedBounds = new THREE.Box3();
const pooledHitPoint = new THREE.Vector3();
const pooledBoundsSize = new THREE.Vector3();

export function findNearestExpandedBoundsHit<TMeta>(
  ray: THREE.Ray,
  candidates: Iterable<HoverBoundsCandidate<TMeta>>,
  getLinkKey: (meta: TMeta) => string,
  options: {
    minPadding?: number;
    paddingRatio?: number;
  } = {},
): HoverMatch<TMeta> | null {
  const minPadding = options.minPadding ?? DEFAULT_MIN_PADDING;
  const paddingRatio = options.paddingRatio ?? DEFAULT_PADDING_RATIO;
  const boundsByLink = new Map<string, LinkBoundsEntry<TMeta>>();

  for (const candidate of candidates) {
    const geometry = candidate.mesh.geometry;
    if (!geometry) {
      continue;
    }

    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingBox) {
      continue;
    }

    const linkKey = getLinkKey(candidate.meta);
    if (!linkKey) {
      continue;
    }

    const entry = boundsByLink.get(linkKey);
    pooledWorldBounds.copy(pooledGeometryBounds.copy(geometry.boundingBox).applyMatrix4(candidate.mesh.matrixWorld));
    pooledWorldBounds.getSize(pooledBoundsSize);
    const meshMaxExtent = Math.max(pooledBoundsSize.x, pooledBoundsSize.y, pooledBoundsSize.z);

    if (entry) {
      entry.bounds.union(pooledWorldBounds);
      entry.maxExtent = Math.max(entry.maxExtent, meshMaxExtent);
      continue;
    }

    boundsByLink.set(linkKey, {
      meta: candidate.meta,
      bounds: pooledWorldBounds.clone(),
      maxExtent: meshMaxExtent,
    });
  }

  let bestHit: HoverMatch<TMeta> | null = null;

  boundsByLink.forEach((entry) => {
    const padding = Math.max(entry.maxExtent * paddingRatio, minPadding);
    pooledExpandedBounds.copy(entry.bounds).expandByScalar(padding);

    const hitPoint = ray.intersectBox(pooledExpandedBounds, pooledHitPoint);
    if (!hitPoint) {
      return;
    }

    const distance = ray.origin.distanceTo(hitPoint);
    if (!bestHit || distance < bestHit.distance) {
      bestHit = {
        meta: entry.meta,
        distance,
        padding,
      };
    }
  });

  return bestHit;
}

export function choosePreferredHoverMatch<TMeta>(
  exactMatch: HoverMatch<TMeta> | null,
  boundsMatch: HoverMatch<TMeta> | null,
  getLinkKey: (meta: TMeta) => string,
): HoverMatch<TMeta> | null {
  if (!boundsMatch) {
    return exactMatch;
  }

  if (!exactMatch) {
    return boundsMatch;
  }

  if (getLinkKey(exactMatch.meta) === getLinkKey(boundsMatch.meta)) {
    return exactMatch;
  }

  const padding = boundsMatch.padding ?? 0;
  return boundsMatch.distance + padding < exactMatch.distance
    ? boundsMatch
    : exactMatch;
}
