import * as THREE from 'three';

export const DEFAULT_WORKSPACE_ORBIT_CLIPPING = {
  minDistance: 0.002,
  nearFactor: 0.001,
  minNear: 0.001,
  maxNear: 0.02,
  farFactor: 260,
  minFar: 80,
  maxFar: 8000,
} as const;

export interface WorkspaceOrbitClippingOptions {
  minDistance?: number;
  nearFactor?: number;
  minNear?: number;
  maxNear?: number;
  farFactor?: number;
  minFar?: number;
  maxFar?: number;
}

type OrbitTargetLike = {
  target: THREE.Vector3;
};

export function syncWorkspacePerspectiveClipPlanes(
  camera: THREE.Camera,
  controls: OrbitTargetLike,
  options: WorkspaceOrbitClippingOptions = {},
): boolean {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return false;
  }

  const config = {
    ...DEFAULT_WORKSPACE_ORBIT_CLIPPING,
    ...options,
  };

  const distance = Math.max(
    camera.position.distanceTo(controls.target),
    config.minDistance,
  );
  const nextNear = THREE.MathUtils.clamp(
    distance * config.nearFactor,
    config.minNear,
    config.maxNear,
  );
  const nextFar = Math.max(
    nextNear + 10,
    THREE.MathUtils.clamp(
      distance * config.farFactor,
      config.minFar,
      config.maxFar,
    ),
  );

  if (
    Math.abs(camera.near - nextNear) < 1e-5
    && Math.abs(camera.far - nextFar) < 1e-2
  ) {
    return false;
  }

  camera.near = nextNear;
  camera.far = nextFar;
  camera.updateProjectionMatrix();
  return true;
}
