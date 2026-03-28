import test from 'node:test';
import assert from 'node:assert/strict';

import { createStlParseWorkerPoolClient } from './stlParseWorkerBridge.ts';

type WorkerEventHandler = (event: { data?: unknown; error?: unknown; message?: string }) => void;

class FakeWorker {
  private readonly listeners = new Map<string, Set<WorkerEventHandler>>();

  public readonly postedMessages: unknown[] = [];

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

  terminate(): void {}

  emitError(error: Error): void {
    this.listeners.get('error')?.forEach((handler) => {
      handler({ error, message: error.message });
    });
  }
}

test('STL parse worker failures reject instead of silently reparsing on the main thread', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  const fakeWorker = new FakeWorker();

  globalThis.fetch = (async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => new ArrayBuffer(32),
    } as Response;
  }) as typeof fetch;

  try {
    const client = createStlParseWorkerPoolClient({
      canUseWorker: () => true,
      createWorker: () => fakeWorker as unknown as Worker,
      getWorkerCount: () => 1,
    });

    const resultPromise = client.load('/demo.stl');
    assert.equal(fakeWorker.postedMessages.length, 1);

    fakeWorker.emitError(new Error('stl worker exploded'));

    await assert.rejects(resultPromise, /stl worker exploded/i);
    await assert.rejects(client.load('/demo.stl'), /STL parse worker is unavailable/);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
