import test from 'node:test';
import assert from 'node:assert/strict';

import { WORKSPACE_DEFAULT_CAMERA_POSITION } from '../../../shared/components/3d/scene/constants.ts';

import { createEmbeddedUsdViewerLoadParams } from './usdViewerRenderParams.ts';

test('createEmbeddedUsdViewerLoadParams keeps USD auto-fit aligned with the workspace camera defaults', () => {
  const params = createEmbeddedUsdViewerLoadParams(4);

  assert.equal(params.get('threads'), '4');
  assert.equal(params.get('fastLoad'), '1');
  assert.equal(params.get('nonBlockingLoad'), '0');
  assert.equal(params.get('aggressiveInitialDraw'), '1');
  assert.equal(params.get('strictOneShot'), '1');
  assert.equal(params.get('resolveRobotMetadataBeforeReady'), '1');
  assert.equal(params.get('requireCompleteRobotMetadata'), '1');
  assert.equal(params.get('warmupRuntimeBridge'), '1');
  assert.equal(params.get('cameraX'), String(WORKSPACE_DEFAULT_CAMERA_POSITION[0]));
  assert.equal(params.get('cameraY'), String(WORKSPACE_DEFAULT_CAMERA_POSITION[1]));
  assert.equal(params.get('cameraZ'), String(WORKSPACE_DEFAULT_CAMERA_POSITION[2]));
});
