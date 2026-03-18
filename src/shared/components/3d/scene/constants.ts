export const LIGHTING_CONFIG = {
  ambientIntensity: 0.65,
  hemisphereIntensity: 0.5,
  hemisphereSky: '#ffffff',
  hemisphereGround: '#d4d4d8',
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
  cameraKeyPriorityIntensityLight: 0.66,
  cameraKeyPriorityIntensityDark: 0.48,
  cameraFillIntensityLight: 0.12,
  cameraFillIntensityDark: 0.08,
  cameraSoftFrontIntensityLight: 0.22,
  cameraSoftFrontIntensityDark: 0.18,
} as const;

export const WORKSPACE_CANVAS_BACKGROUND = {
  light: '#e7ecf1',
  dark: '#171b20',
} as const;
