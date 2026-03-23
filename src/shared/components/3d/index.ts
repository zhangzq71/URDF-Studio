/**
 * Shared 3D Components
 * Components for 3D rendering shared between Visualizer and URDFViewer
 */

// Mesh Renderers
export {
  STLRenderer,
  OBJRenderer,
  DAERenderer,
  useLoadingManager
} from './MeshRenderers';

// Scene Utilities
export {
  HoverInvalidator,
  CanvasResizeSync,
  SnapshotManager,
  NeutralStudioEnvironment,
  SceneLighting,
  GroundShadowPlane,
  ReferenceGrid,
  WorkspaceOrbitControls,
  LIGHTING_CONFIG,
  WORKSPACE_CANVAS_BACKGROUND,
  WORKSPACE_DEFAULT_CAMERA_FOV,
  WORKSPACE_DEFAULT_CAMERA_POSITION,
  WORKSPACE_DEFAULT_CAMERA_UP,
} from './SceneUtilities';
export { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from './UnifiedTransformControls';

// Visualization Helpers
export * from './helpers';

export { UsageGuide } from './UsageGuide';
export { ViewModeBadge } from './ViewModeBadge';
export { TransformConfirmOverlay } from './TransformConfirmOverlay';
