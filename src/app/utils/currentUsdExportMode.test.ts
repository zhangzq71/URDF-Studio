import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCurrentUsdExportMode } from './currentUsdExportMode.ts';

test('prefers live-stage export when the USD viewer bridge is ready even if hydration is still pending', () => {
  assert.equal(
    resolveCurrentUsdExportMode({
      isHydrating: true,
      hasLiveStageExportHandler: true,
      hasPreparedExportCache: false,
      hasSceneSnapshot: false,
    }),
    'live-stage',
  );
});

test('falls back to cached bundle export once USD hydration is finished', () => {
  assert.equal(
    resolveCurrentUsdExportMode({
      isHydrating: false,
      hasLiveStageExportHandler: false,
      hasPreparedExportCache: true,
      hasSceneSnapshot: false,
    }),
    'bundle',
  );
});

test('reports USD export unavailable when neither the live bridge nor cached export data exist', () => {
  assert.equal(
    resolveCurrentUsdExportMode({
      isHydrating: true,
      hasLiveStageExportHandler: false,
      hasPreparedExportCache: false,
      hasSceneSnapshot: false,
    }),
    'unavailable',
  );
});
