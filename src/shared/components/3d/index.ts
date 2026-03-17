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
  LIGHTING_CONFIG,
  WORKSPACE_CANVAS_BACKGROUND
} from './SceneUtilities';
export { UnifiedTransformControls, VISUALIZER_UNIFIED_GIZMO_SIZE } from './UnifiedTransformControls';

// Visualization Helpers
export * from './helpers';

export { UsageGuide } from './UsageGuide';
export { TransformConfirmOverlay } from './TransformConfirmOverlay';
