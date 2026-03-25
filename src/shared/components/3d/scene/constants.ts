export const LIGHTING_CONFIG = {
  ambientIntensity: 0.65,
  hemisphereIntensity: 0.5,
  hemisphereSky: '#ffffff',
  hemisphereGround: '#888888',
  mainLightIntensity: 0.6,
  mainLightPosition: [5, 5, 5] as [number, number, number],
  leftFillIntensity: 0.5,
  leftFillPosition: [-5, 5, 5] as [number, number, number],
  leftSideIntensity: 0.3,
  leftSidePosition: [-6, 3, 0] as [number, number, number],
  rightFillIntensity: 0.3,
  rightFillPosition: [5, 3, -3] as [number, number, number],
  rimLightIntensity: 0.3,
  rimLightPosition: [0, 5, -5] as [number, number, number],
  cameraKeyIntensityLight: 0.52,
  cameraKeyIntensityDark: 0.35,
  cameraKeyPriorityIntensityLight: 0.78,
  cameraKeyPriorityIntensityDark: 0.58,
  cameraFillIntensityLight: 0.22,
  cameraFillIntensityDark: 0.14,
  cameraSoftFrontIntensityLight: 0.34,
  cameraSoftFrontIntensityDark: 0.26,
} as const;

export const WORKSPACE_CANVAS_BACKGROUND = {
  light: '#f3f4f6',
  dark: '#1f1f1f',
} as const;

// Match robot_viewer's +Z presentation while preserving URDF Studio's internal Z-up world.
export const WORKSPACE_DEFAULT_CAMERA_POSITION: [number, number, number] = [2, -2, 2];
export const WORKSPACE_DEFAULT_CAMERA_UP: [number, number, number] = [0, 0, 1];
export const WORKSPACE_DEFAULT_CAMERA_FOV = 60;
