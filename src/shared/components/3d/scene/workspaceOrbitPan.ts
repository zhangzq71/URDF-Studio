import * as THREE from 'three';

export const DEFAULT_WORKSPACE_ORBIT_PAN_TUNING = {
  closeRangeDistanceFactor: 0.18,
  minDistanceFloorFactor: 4,
  maxBoost: 3,
  largeSceneBoostFactor: 0.4,
  maxLargeSceneBoost: 24,
} as const;

interface ResolveWorkspaceOrbitPanSpeedOptions {
  basePanSpeed: number;
  camera: THREE.Camera;
  target: THREE.Vector3;
  sceneBounds?: THREE.Box3 | null;
  minDistance?: number;
  maxBoost?: number;
}

function resolveWorkspaceOrbitPanDistanceFloor(
  sceneBounds: THREE.Box3 | null | undefined,
  minDistance: number | undefined,
) {
  const sceneDiagonal = sceneBounds?.getSize(new THREE.Vector3()).length() ?? 0;
  const distanceFromScene =
    sceneDiagonal * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.closeRangeDistanceFactor;
  const distanceFromControls = Number.isFinite(minDistance)
    ? Math.max(0, Number(minDistance)) * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.minDistanceFloorFactor
    : 0;

  return Math.max(distanceFromScene, distanceFromControls);
}

function resolveWorkspaceOrbitPanMaxBoost(
  sceneBounds: THREE.Box3 | null | undefined,
  fallbackMaxBoost: number,
) {
  const sceneDiagonal = sceneBounds?.getSize(new THREE.Vector3()).length() ?? 0;
  if (!Number.isFinite(sceneDiagonal) || sceneDiagonal <= 0) {
    return fallbackMaxBoost;
  }

  // Long serial joint chains can keep the camera very close to one link while
  // the scene remains meters long overall. Allow larger boosts for those
  // elongated scenes so perspective panning does not feel glued in place.
  return THREE.MathUtils.clamp(
    sceneDiagonal * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.largeSceneBoostFactor,
    fallbackMaxBoost,
    DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.maxLargeSceneBoost,
  );
}

export function resolveWorkspaceOrbitPanSpeed({
  basePanSpeed,
  camera,
  target,
  sceneBounds,
  minDistance,
  maxBoost = DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.maxBoost,
}: ResolveWorkspaceOrbitPanSpeedOptions) {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return basePanSpeed;
  }

  const distance = camera.position.distanceTo(target);
  if (!Number.isFinite(distance) || distance <= 0) {
    return basePanSpeed;
  }

  const distanceFloor = resolveWorkspaceOrbitPanDistanceFloor(sceneBounds, minDistance);
  if (distance >= distanceFloor || distanceFloor <= 0) {
    return basePanSpeed;
  }

  // OrbitControls scales perspective panning with camera-target distance. When
  // zooming in very close this makes drag feel sticky, so keep a bounded
  // minimum effective distance for panning only.
  const resolvedMaxBoost = resolveWorkspaceOrbitPanMaxBoost(sceneBounds, maxBoost);
  const boost = THREE.MathUtils.clamp(distanceFloor / distance, 1, resolvedMaxBoost);
  return basePanSpeed * boost;
}
