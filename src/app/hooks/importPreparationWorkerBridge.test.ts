import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareImportPayloadWithWorker } from './importPreparationWorkerBridge.ts';

test('import preparation worker bridge rejects immediately when Worker is unavailable', async () => {
  const originalWorker = globalThis.Worker;

  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: undefined,
  });

  try {
    await assert.rejects(
      prepareImportPayloadWithWorker({
        files: [],
        existingPaths: [],
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
