import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  LIGHTING_CONFIG,
  STUDIO_ENVIRONMENT_INTENSITY,
} from '../../../shared/components/3d/scene/constants.ts';

type SceneWithEnvironmentIntensity = THREE.Scene & {
  environmentIntensity?: number;
};

type DisposableObject3D = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

const OFFSCREEN_CAMERA_FOLLOW_LIGHTING = Object.freeze({
  ambientIntensity: 0.37,
  hemisphereIntensity: 0.43,
  cameraKeyIntensity: LIGHTING_CONFIG.cameraKeyPriorityIntensityLight,
  cameraFillIntensity: LIGHTING_CONFIG.cameraFillIntensityLight,
  cameraSoftFrontIntensity: LIGHTING_CONFIG.cameraSoftFrontIntensityLight,
  staticDirectionalScale: 0.76,
  rimDirectionalScale: 0.38,
  targetDistance: 10,
  softFrontUpOffset: 1.0,
  softFrontForwardOffset: 0.35,
  fillRightOffset: 2.8,
  fillUpOffset: 1.7,
  fillForwardOffset: 0.6,
});

export interface UsdOffscreenLightRig {
  ambientLight: THREE.AmbientLight;
  hemisphereLight: THREE.HemisphereLight;
  mainLight: THREE.DirectionalLight;
  fillLightLeft: THREE.DirectionalLight;
  fillLightLeftSide: THREE.DirectionalLight;
  fillLightRight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  cameraKeyLight: THREE.DirectionalLight;
  cameraSoftFrontLight: THREE.DirectionalLight;
  cameraFillRightLight: THREE.DirectionalLight;
  cameraFillLeftLight: THREE.DirectionalLight;
  lights: THREE.Light[];
  targets: THREE.Object3D[];
  cameraDirection: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  cameraRight: THREE.Vector3;
  cameraUp: THREE.Vector3;
}

export interface UsdOffscreenStudioEnvironmentHandle {
  dispose: () => void;
}

function createDirectionalLight(
  name: string,
  color: THREE.ColorRepresentation,
  intensity: number,
  position: readonly [number, number, number],
): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(color, intensity);
  light.name = name;
  light.position.fromArray(position as [number, number, number]);
  light.castShadow = false;
  return light;
}

export function createUsdOffscreenLightRig(scene: THREE.Scene): UsdOffscreenLightRig {
  const ambientLight = new THREE.AmbientLight(
    0xffffff,
    OFFSCREEN_CAMERA_FOLLOW_LIGHTING.ambientIntensity,
  );
  ambientLight.name = 'OffscreenViewerAmbientLight';

  const hemisphereLight = new THREE.HemisphereLight(
    LIGHTING_CONFIG.hemisphereSky,
    LIGHTING_CONFIG.hemisphereGround,
    OFFSCREEN_CAMERA_FOLLOW_LIGHTING.hemisphereIntensity,
  );
  hemisphereLight.name = 'OffscreenViewerHemisphereLight';
  hemisphereLight.position.set(0, 1, 0);

  const mainLight = createDirectionalLight(
    'OffscreenViewerMainLight',
    '#ffffff',
    LIGHTING_CONFIG.mainLightIntensity * OFFSCREEN_CAMERA_FOLLOW_LIGHTING.staticDirectionalScale,
    LIGHTING_CONFIG.mainLightPosition,
  );

  const fillLightLeft = createDirectionalLight(
    'OffscreenViewerFillLightLeft',
    '#ffffff',
    LIGHTING_CONFIG.leftFillIntensity * OFFSCREEN_CAMERA_FOLLOW_LIGHTING.staticDirectionalScale,
    LIGHTING_CONFIG.leftFillPosition,
  );

  const fillLightLeftSide = createDirectionalLight(
    'OffscreenViewerFillLightLeftSide',
    '#ffffff',
    LIGHTING_CONFIG.leftSideIntensity * OFFSCREEN_CAMERA_FOLLOW_LIGHTING.staticDirectionalScale,
    LIGHTING_CONFIG.leftSidePosition,
  );

  const fillLightRight = createDirectionalLight(
    'OffscreenViewerFillLightRight',
    '#ffffff',
    LIGHTING_CONFIG.rightFillIntensity * OFFSCREEN_CAMERA_FOLLOW_LIGHTING.staticDirectionalScale,
    LIGHTING_CONFIG.rightFillPosition,
  );

  const rimLight = createDirectionalLight(
    'OffscreenViewerRimLight',
    '#ffffff',
    LIGHTING_CONFIG.rimLightIntensity * OFFSCREEN_CAMERA_FOLLOW_LIGHTING.rimDirectionalScale,
    LIGHTING_CONFIG.rimLightPosition,
  );

  const cameraKeyLight = createDirectionalLight(
    'OffscreenViewerCameraKeyLight',
    '#ffffff',
    OFFSCREEN_CAMERA_FOLLOW_LIGHTING.cameraKeyIntensity,
    [0, 0, 0],
  );

  const cameraSoftFrontLight = createDirectionalLight(
    'OffscreenViewerCameraSoftFrontLight',
    '#ffffff',
    OFFSCREEN_CAMERA_FOLLOW_LIGHTING.cameraSoftFrontIntensity,
    [0, 0, 0],
  );

  const cameraFillRightLight = createDirectionalLight(
    'OffscreenViewerCameraFillLightRight',
    '#ffffff',
    OFFSCREEN_CAMERA_FOLLOW_LIGHTING.cameraFillIntensity,
    [0, 0, 0],
  );

  const cameraFillLeftLight = createDirectionalLight(
    'OffscreenViewerCameraFillLightLeft',
    '#ffffff',
    OFFSCREEN_CAMERA_FOLLOW_LIGHTING.cameraFillIntensity,
    [0, 0, 0],
  );

  const lights: THREE.Light[] = [
    ambientLight,
    hemisphereLight,
    mainLight,
    fillLightLeft,
    fillLightLeftSide,
    fillLightRight,
    rimLight,
    cameraKeyLight,
    cameraSoftFrontLight,
    cameraFillRightLight,
    cameraFillLeftLight,
  ];

  const targets = [
    cameraKeyLight.target,
    cameraSoftFrontLight.target,
    cameraFillRightLight.target,
    cameraFillLeftLight.target,
  ];

  lights.forEach((light) => scene.add(light));
  targets.forEach((target) => scene.add(target));

  return {
    ambientLight,
    hemisphereLight,
    mainLight,
    fillLightLeft,
    fillLightLeftSide,
    fillLightRight,
    rimLight,
    cameraKeyLight,
    cameraSoftFrontLight,
    cameraFillRightLight,
    cameraFillLeftLight,
    lights,
    targets,
    cameraDirection: new THREE.Vector3(),
    cameraTarget: new THREE.Vector3(),
    cameraRight: new THREE.Vector3(),
    cameraUp: new THREE.Vector3(),
  };
}

export function syncUsdOffscreenLightRigWithCamera(
  rig: UsdOffscreenLightRig,
  camera: THREE.Camera,
): void {
  camera.getWorldDirection(rig.cameraDirection);
  rig.cameraTarget
    .copy(camera.position)
    .addScaledVector(rig.cameraDirection, OFFSCREEN_CAMERA_FOLLOW_LIGHTING.targetDistance);

  rig.cameraKeyLight.position.copy(camera.position);
  rig.cameraKeyLight.target.position.copy(rig.cameraTarget);
  rig.cameraKeyLight.target.updateMatrixWorld();

  rig.cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  rig.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();

  rig.cameraSoftFrontLight.position
    .copy(camera.position)
    .addScaledVector(rig.cameraUp, OFFSCREEN_CAMERA_FOLLOW_LIGHTING.softFrontUpOffset)
    .addScaledVector(rig.cameraDirection, OFFSCREEN_CAMERA_FOLLOW_LIGHTING.softFrontForwardOffset);
  rig.cameraSoftFrontLight.target.position.copy(rig.cameraTarget);
  rig.cameraSoftFrontLight.target.updateMatrixWorld();

  rig.cameraFillRightLight.position
    .copy(camera.position)
    .addScaledVector(rig.cameraRight, OFFSCREEN_CAMERA_FOLLOW_LIGHTING.fillRightOffset)
    .addScaledVector(rig.cameraUp, OFFSCREEN_CAMERA_FOLLOW_LIGHTING.fillUpOffset)
    .addScaledVector(rig.cameraDirection, OFFSCREEN_CAMERA_FOLLOW_LIGHTING.fillForwardOffset);
  rig.cameraFillRightLight.target.position.copy(rig.cameraTarget);
  rig.cameraFillRightLight.target.updateMatrixWorld();

  rig.cameraFillLeftLight.position
    .copy(camera.position)
    .addScaledVector(rig.cameraRight, -OFFSCREEN_CAMERA_FOLLOW_LIGHTING.fillRightOffset)
    .addScaledVector(rig.cameraUp, OFFSCREEN_CAMERA_FOLLOW_LIGHTING.fillUpOffset)
    .addScaledVector(rig.cameraDirection, OFFSCREEN_CAMERA_FOLLOW_LIGHTING.fillForwardOffset);
  rig.cameraFillLeftLight.target.position.copy(rig.cameraTarget);
  rig.cameraFillLeftLight.target.updateMatrixWorld();
}

export function disposeUsdOffscreenLightRig(
  scene: THREE.Scene | null | undefined,
  rig: UsdOffscreenLightRig | null | undefined,
): void {
  if (!scene || !rig) {
    return;
  }

  rig.lights.forEach((light) => scene.remove(light));
  rig.targets.forEach((target) => scene.remove(target));
}

export function createUsdOffscreenStudioEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  intensity = STUDIO_ENVIRONMENT_INTENSITY.viewer.light,
): UsdOffscreenStudioEnvironmentHandle {
  const sceneWithEnvironmentIntensity = scene as SceneWithEnvironmentIntensity;
  const previousEnvironment = scene.environment;
  const previousEnvironmentIntensity = sceneWithEnvironmentIntensity.environmentIntensity;
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const renderTarget = pmremGenerator.fromScene(envScene, 0.04);

  scene.environment = renderTarget.texture;
  sceneWithEnvironmentIntensity.environmentIntensity = intensity;

  return {
    dispose: () => {
      scene.environment = previousEnvironment;
      sceneWithEnvironmentIntensity.environmentIntensity = previousEnvironmentIntensity;
      renderTarget.dispose();
      envScene.traverse((child) => {
        const disposableChild = child as DisposableObject3D;
        disposableChild.geometry?.dispose();
        if (Array.isArray(disposableChild.material)) {
          disposableChild.material.forEach((material) => material.dispose());
        } else {
          disposableChild.material?.dispose();
        }
      });
      pmremGenerator.dispose();
    },
  };
}
