import * as THREE from 'three';

const EPSILON = 1e-4;

export interface UsdWorkerOrbitState {
  target: THREE.Vector3;
  radius: number;
  azimuth: number;
  polar: number;
}

export function createUsdWorkerOrbitState(
  cameraPosition: THREE.Vector3,
  target = new THREE.Vector3(0, 0, 0),
): UsdWorkerOrbitState {
  const offset = cameraPosition.clone().sub(target);
  const radius = Math.max(EPSILON, offset.length());
  const azimuth = Math.atan2(offset.y, offset.x);
  const polar = Math.acos(Math.max(-1, Math.min(1, offset.z / radius)));

  return {
    target: target.clone(),
    radius,
    azimuth,
    polar,
  };
}

export function applyUsdWorkerOrbitPointerDelta(
  orbit: UsdWorkerOrbitState,
  deltaX: number,
  deltaY: number,
  options: {
    rotationSpeed?: number;
  } = {},
): UsdWorkerOrbitState {
  const rotationSpeed = Number.isFinite(options.rotationSpeed)
    ? Number(options.rotationSpeed)
    : 0.005;

  orbit.azimuth -= deltaX * rotationSpeed;
  orbit.polar = Math.max(EPSILON, Math.min(Math.PI - EPSILON, orbit.polar + deltaY * rotationSpeed));
  return orbit;
}

export function applyUsdWorkerOrbitZoomDelta(
  orbit: UsdWorkerOrbitState,
  deltaY: number,
  options: {
    zoomSpeed?: number;
    minRadius?: number;
    maxRadius?: number;
  } = {},
): UsdWorkerOrbitState {
  const zoomSpeed = Number.isFinite(options.zoomSpeed)
    ? Number(options.zoomSpeed)
    : 0.0015;
  const minRadius = Number.isFinite(options.minRadius)
    ? Number(options.minRadius)
    : 0.2;
  const maxRadius = Number.isFinite(options.maxRadius)
    ? Number(options.maxRadius)
    : 2000;

  orbit.radius = Math.max(minRadius, Math.min(maxRadius, orbit.radius * Math.exp(deltaY * zoomSpeed)));
  return orbit;
}

export function applyUsdWorkerOrbitToCamera(
  orbit: UsdWorkerOrbitState,
  camera: THREE.PerspectiveCamera | THREE.Camera,
): void {
  const sinPolar = Math.sin(orbit.polar);
  const x = orbit.radius * sinPolar * Math.cos(orbit.azimuth);
  const y = orbit.radius * sinPolar * Math.sin(orbit.azimuth);
  const z = orbit.radius * Math.cos(orbit.polar);

  camera.position.set(
    orbit.target.x + x,
    orbit.target.y + y,
    orbit.target.z + z,
  );
  camera.lookAt(orbit.target);
  camera.updateMatrixWorld(true);
}
