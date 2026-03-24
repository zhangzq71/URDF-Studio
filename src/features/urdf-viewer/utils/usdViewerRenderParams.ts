import { WORKSPACE_DEFAULT_CAMERA_POSITION } from '../../../shared/components/3d/scene/constants.ts';

export function createEmbeddedUsdViewerLoadParams(threadCount: number): URLSearchParams {
  const params = new URLSearchParams();

  params.set('threads', String(threadCount));
  params.set('fastLoad', '1');
  params.set('nonBlockingLoad', '0');
  params.set('aggressiveInitialDraw', '1');
  params.set('strictOneShot', '1');
  params.set('resolveRobotMetadataBeforeReady', '1');
  params.set('requireCompleteRobotMetadata', '1');
  params.set('warmupRuntimeBridge', '1');

  // Keep embedded USD framing aligned with the URDF/MJCF workspace viewer.
  params.set('cameraX', String(WORKSPACE_DEFAULT_CAMERA_POSITION[0]));
  params.set('cameraY', String(WORKSPACE_DEFAULT_CAMERA_POSITION[1]));
  params.set('cameraZ', String(WORKSPACE_DEFAULT_CAMERA_POSITION[2]));

  return params;
}
