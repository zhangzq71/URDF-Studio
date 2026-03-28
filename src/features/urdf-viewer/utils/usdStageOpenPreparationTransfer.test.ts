import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hydratePreparedUsdStageOpenDataFromWorker,
  serializePreparedUsdStageOpenDataForWorker,
} from './usdStageOpenPreparationTransfer.ts';
import type { PreparedUsdStageOpenData } from './usdStageOpenPreparation.ts';

test('usdStageOpenPreparation transfer serialization preserves preload blobs across worker boundaries', async () => {
  const payload: PreparedUsdStageOpenData = {
    stageSourcePath: '/robots/go2/usd/go2.usd',
    criticalDependencyPaths: [
      '/robots/go2/usd/configuration/go2_description_base.usd',
    ],
    preloadFiles: [
      {
        path: '/robots/go2/textures/body.png',
        blob: null,
        error: 'missing-texture',
      },
      {
        path: '/robots/go2/usd/go2.usd',
        blob: new Blob([new Uint8Array([80, 88, 82, 45])], { type: 'application/octet-stream' }),
        error: null,
      },
    ],
  };

  const serialized = await serializePreparedUsdStageOpenDataForWorker(payload);

  assert.equal(serialized.payload.preloadFiles[0]?.bytes, null);
  assert.equal(serialized.payload.preloadFiles[1]?.mimeType, 'application/octet-stream');
  assert.equal(serialized.transferables.length, 1);

  const hydrated = hydratePreparedUsdStageOpenDataFromWorker(serialized.payload);

  assert.equal(hydrated.preloadFiles[0]?.blob, null);
  assert.equal(hydrated.preloadFiles[0]?.bytes, null);
  assert.equal(hydrated.preloadFiles[0]?.error, 'missing-texture');
  assert.deepEqual(
    Array.from(new Uint8Array(hydrated.preloadFiles[1]!.bytes!)),
    [80, 88, 82, 45],
  );
  assert.equal(hydrated.preloadFiles[1]?.blob, null);
  assert.deepEqual(hydrated.criticalDependencyPaths, payload.criticalDependencyPaths);
  assert.equal(hydrated.stageSourcePath, payload.stageSourcePath);
});
