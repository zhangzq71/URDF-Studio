import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeMeshBatchWithWorker } from './meshAnalysisWorkerBridge.ts';

test('analyzeMeshBatchWithWorker rejects instead of silently falling back to main-thread analysis', async () => {
  const originalWorker = globalThis.Worker;

  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: undefined,
  });

  try {
    await assert.rejects(
      analyzeMeshBatchWithWorker({
        assets: {},
        tasks: [{
          targetId: 'mesh-target',
          cacheKey: 'mesh-target',
          meshPath: 'meshes/demo.stl',
        }],
      }),
      /Web Worker is not available in this environment/i,
    );
  } finally {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      writable: true,
      value: originalWorker,
    });
  }
});
