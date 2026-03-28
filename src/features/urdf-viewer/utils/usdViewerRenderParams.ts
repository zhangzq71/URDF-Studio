import { WORKSPACE_DEFAULT_CAMERA_POSITION } from '../../../shared/components/3d/scene/constants.ts';

const EMBEDDED_USD_VIEWER_SAFE_LOAD_FLAGS = {
  fastLoad: '1',
  nonBlockingLoad: '1',
  aggressiveInitialDraw: '1',
  strictOneShot: '0',
  // Keep the viewer blocked until the runtime has authored joint/dynamics
  // metadata for the stage. Large quadrupeds such as Unitree B2 collapse into
  // a zero-pose fallback if interactive mode begins before this data is ready.
  resolveRobotMetadataBeforeReady: '1',
  requireCompleteRobotMetadata: '1',
  warmupRuntimeBridge: '0',
} as const;

export function createEmbeddedUsdViewerLoadParams(threadCount: number): URLSearchParams {
  const params = new URLSearchParams();

  params.set('threads', String(threadCount));
  // Keep non-blocking mesh streaming enabled, but require stable robot metadata
  // before the embedded viewer promotes the scene to interactive.
  Object.entries(EMBEDDED_USD_VIEWER_SAFE_LOAD_FLAGS).forEach(([key, value]) => {
    params.set(key, value);
  });

  // Keep embedded USD framing aligned with the URDF/MJCF workspace viewer.
  params.set('cameraX', String(WORKSPACE_DEFAULT_CAMERA_POSITION[0]));
  params.set('cameraY', String(WORKSPACE_DEFAULT_CAMERA_POSITION[1]));
  params.set('cameraZ', String(WORKSPACE_DEFAULT_CAMERA_POSITION[2]));

  return params;
}
