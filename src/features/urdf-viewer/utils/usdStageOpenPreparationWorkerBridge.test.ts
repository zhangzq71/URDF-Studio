import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  UsdStageOpenPreparationWorkerResponse,
} from './usdStageOpenPreparationWorker.ts';
import { createUsdStageOpenPreparationWorkerClient } from './usdStageOpenPreparationWorkerBridge.ts';
import { serializePreparedUsdStageOpenDataForWorker } from './usdStageOpenPreparationTransfer.ts';

type WorkerEventHandler = (event: { data?: unknown; error?: unknown; message?: string }) => void;

class FakeWorker {
  private readonly listeners = new Map<string, Set<WorkerEventHandler>>();

  public readonly postedMessages: unknown[] = [];

  public terminated = false;

  addEventListener(type: string, handler: WorkerEventHandler): void {
    const handlers = this.listeners.get(type) ?? new Set<WorkerEventHandler>();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type: string, handler: WorkerEventHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(message: UsdStageOpenPreparationWorkerResponse): void {
    this.listeners.get('message')?.forEach((handler) => {
      handler({ data: message });
    });
  }
}

test('USD stage open preparation worker client resolves successful worker responses', async () => {
  const fakeWorker = new FakeWorker();
  const client = createUsdStageOpenPreparationWorkerClient({
    canUseWorker: () => true,
    createWorker: () => fakeWorker as unknown as Worker,
  });

  const resultPromise = client.prepare(
    {
      name: 'robots/go2/usd/go2.usd',
      content: '#usda 1.0',
      blobUrl: undefined,
    },
    [],
    {},
  );

  assert.equal(fakeWorker.postedMessages.length, 1);
  const postedRequest = fakeWorker.postedMessages[0] as { requestId: number };

  const serialized = await serializePreparedUsdStageOpenDataForWorker({
    stageSourcePath: '/robots/go2/usd/go2.usd',
    criticalDependencyPaths: [],
    preloadFiles: [{
      path: '/robots/go2/usd/go2.usd',
      blob: new Blob(['go2-root'], { type: 'application/octet-stream' }),
      error: null,
    }],
  });

  fakeWorker.emitMessage({
    type: 'prepare-usd-stage-open-result',
    requestId: postedRequest.requestId,
    result: serialized.payload,
  });

  const result = await resultPromise;
  assert.equal(result.stageSourcePath, '/robots/go2/usd/go2.usd');
  assert.equal(result.preloadFiles[0]?.blob, null);
  assert.deepEqual(
    Array.from(new Uint8Array(result.preloadFiles[0]!.bytes!)),
    Array.from(new TextEncoder().encode('go2-root')),
  );
});

test('USD stage open preparation worker client syncs pruned context once and reuses the context id', async () => {
  const fakeWorker = new FakeWorker();
  const client = createUsdStageOpenPreparationWorkerClient({
    canUseWorker: () => true,
    createWorker: () => fakeWorker as unknown as Worker,
  });

  const sourceFile = {
    name: 'robots/go2/usd/go2.usd',
    content: '#usda 1.0',
    blobUrl: undefined,
  };
  const availableFiles = [
    {
      name: 'robots/go2/usd/go2.usd',
      content: '#usda 1.0',
      blobUrl: undefined,
      format: 'usd' as const,
    },
    {
      name: 'robots/go2/usd/configuration/go2_description_base.usd',
      content: '#usda 1.0',
      blobUrl: undefined,
      format: 'usd' as const,
    },
    {
      name: 'robots/go2/meshes/base.stl',
      content: 'solid go2',
      blobUrl: undefined,
      format: 'mesh' as const,
    },
    {
      name: 'robots/alien/usd/alien.usd',
      content: '#usda 1.0',
      blobUrl: undefined,
      format: 'usd' as const,
    },
  ];
  const assets = {
    'robots/go2/textures/body.png': 'blob:go2-texture',
    'robots/alien/textures/alien.png': 'blob:alien-texture',
  };

  const firstPromise = client.prepare(sourceFile, availableFiles, assets);

  assert.equal(fakeWorker.postedMessages.length, 2);
  const syncContextRequest = fakeWorker.postedMessages[0] as {
    type: string;
    context: {
      availableFiles?: Array<{ name: string; format: string; content?: string; blobUrl?: string }>;
      assets?: Record<string, string>;
    };
  };
  const firstPrepareRequest = fakeWorker.postedMessages[1] as {
    requestId: number;
    contextId?: string;
    availableFiles?: unknown;
    assets?: unknown;
  };

  assert.equal(syncContextRequest.type, 'sync-context');
  assert.deepEqual(
    (syncContextRequest.context.availableFiles ?? []).map((file) => ({
      name: file.name,
      format: file.format,
    })),
    [
      {
        name: 'robots/go2/usd/configuration/go2_description_base.usd',
        format: 'usd',
      },
    ],
  );
  assert.deepEqual(syncContextRequest.context.assets, {
    'robots/go2/textures/body.png': 'blob:go2-texture',
  });
  assert.equal(typeof firstPrepareRequest.contextId, 'string');
  assert.equal(firstPrepareRequest.availableFiles, undefined);
  assert.equal(firstPrepareRequest.assets, undefined);

  const secondPromise = client.prepare(sourceFile, availableFiles, assets);

  assert.equal(fakeWorker.postedMessages.length, 3);
  const secondPrepareRequest = fakeWorker.postedMessages[2] as {
    requestId: number;
    contextId?: string;
  };
  assert.equal(secondPrepareRequest.contextId, firstPrepareRequest.contextId);

  fakeWorker.emitMessage({
    type: 'prepare-usd-stage-open-result',
    requestId: firstPrepareRequest.requestId,
    result: {
      stageSourcePath: '/robots/go2/usd/go2.usd',
      criticalDependencyPaths: [],
      preloadFiles: [],
    },
  });
  fakeWorker.emitMessage({
    type: 'prepare-usd-stage-open-result',
    requestId: secondPrepareRequest.requestId,
    result: {
      stageSourcePath: '/robots/go2/usd/go2.usd',
      criticalDependencyPaths: [],
      preloadFiles: [],
    },
  });

  const firstResult = await firstPromise;
  const secondResult = await secondPromise;
  assert.equal(firstResult.stageSourcePath, '/robots/go2/usd/go2.usd');
  assert.equal(secondResult.stageSourcePath, '/robots/go2/usd/go2.usd');
});
