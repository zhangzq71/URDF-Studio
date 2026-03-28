/**
 * Shared Scene Utilities
 * Public barrel for reusable scene infrastructure.
 */

export {
  HoverInvalidator,
  CanvasResizeSync,
  SnapshotManager,
  NeutralStudioEnvironment,
  SceneLighting,
  GroundShadowPlane,
  ReferenceGrid,
  AdaptiveGroundPlane,
  SceneCompileWarmup,
  INTERACTION_DPR_CAP,
  INTERACTION_RECOVERY_DELAY_MS,
  RESTING_DPR_CAP,
  resolveCanvasDpr,
  useAdaptiveInteractionQuality,
  WorkspaceOrbitControls,
  LIGHTING_CONFIG,
  STUDIO_ENVIRONMENT_INTENSITY,
  WORKSPACE_CANVAS_BACKGROUND,
  WORKSPACE_DEFAULT_CAMERA_FOV,
  WORKSPACE_DEFAULT_CAMERA_POSITION,
  WORKSPACE_DEFAULT_CAMERA_UP,
} from './scene';
