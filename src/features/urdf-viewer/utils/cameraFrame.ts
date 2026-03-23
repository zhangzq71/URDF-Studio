import * as THREE from 'three';

export interface CameraFrameResult {
  focusTarget: THREE.Vector3;
  cameraPosition: THREE.Vector3;
}

export function computeVisibleBounds(root: THREE.Object3D): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  let hasBounds = false;

  root.updateWorldMatrix(true, true);

  root.traverseVisible((child) => {
    if (child.userData?.isHelper || child.userData?.isGizmo || child.name?.startsWith('__')) {
      return;
    }

    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }

    const geometryBounds = mesh.geometry.boundingBox;
    if (!geometryBounds) return;

    meshBounds.copy(geometryBounds).applyMatrix4(mesh.matrixWorld);
    if (
      !Number.isFinite(meshBounds.min.x) || !Number.isFinite(meshBounds.min.y) || !Number.isFinite(meshBounds.min.z)
      || !Number.isFinite(meshBounds.max.x) || !Number.isFinite(meshBounds.max.y) || !Number.isFinite(meshBounds.max.z)
    ) {
      return;
    }

    if (!hasBounds) {
      bounds.copy(meshBounds);
      hasBounds = true;
    } else {
      bounds.union(meshBounds);
    }
  });

  return hasBounds ? bounds : null;
}

export function createCameraFrameStabilityKey(bounds: THREE.Box3 | null): string | null {
  if (!bounds || bounds.isEmpty()) {
    return null;
  }

  const values = [
    bounds.min.x,
    bounds.min.y,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z,
  ];
  if (!values.every((value) => Number.isFinite(value))) {
    return null;
  }

  return values.map((value) => value.toFixed(4)).join('|');
}

export function computeCameraFrame(
  targetObject: THREE.Object3D,
  camera: THREE.Camera,
  currentOrbitTarget: THREE.Vector3,
  bounds?: THREE.Box3 | null,
): CameraFrameResult | null {
  const box = bounds ?? computeVisibleBounds(targetObject);
  if (!box || box.isEmpty()) return null;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 0.25;
  const direction = new THREE.Vector3().subVectors(camera.position, currentOrbitTarget);

  if (direction.lengthSq() < 0.001) {
    direction.set(1, 1, 1);
  }
  direction.normalize();

  const verticalFov = camera instanceof THREE.PerspectiveCamera
    ? THREE.MathUtils.degToRad(camera.fov)
    : THREE.MathUtils.degToRad(50);
  const distance = Math.max(radius / Math.sin(Math.max(verticalFov * 0.5, 0.35)), 0.85);

  return {
    focusTarget: sphere.center.clone(),
    cameraPosition: sphere.center.clone().add(direction.multiplyScalar(distance * 1.15)),
  };
}
