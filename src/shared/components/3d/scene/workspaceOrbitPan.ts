import * as THREE from 'three';

export const DEFAULT_WORKSPACE_ORBIT_PAN_TUNING = {
  closeRangeDistanceFactor: 0.18,
  minDistanceFloorFactor: 4,
  maxBoost: 4,
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
  const distanceFromScene = sceneDiagonal * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.closeRangeDistanceFactor;
  const distanceFromControls = Number.isFinite(minDistance)
    ? Math.max(0, Number(minDistance)) * DEFAULT_WORKSPACE_ORBIT_PAN_TUNING.minDistanceFloorFactor
    : 0;

  return Math.max(distanceFromScene, distanceFromControls);
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
  const boost = THREE.MathUtils.clamp(distanceFloor / distance, 1, maxBoost);
  return basePanSpeed * boost;
}
