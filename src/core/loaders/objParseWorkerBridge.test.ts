import test from 'node:test';
import assert from 'node:assert/strict';

import { createObjParseWorkerPoolClient } from './objParseWorkerBridge.ts';

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

test('OBJ parse worker failures reject instead of silently reparsing on the main thread', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  const fakeWorker = new FakeWorker();

  globalThis.fetch = (async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n',
    } as Response;
  }) as typeof fetch;

  try {
    const client = createObjParseWorkerPoolClient({
      canUseWorker: () => true,
      createWorker: () => fakeWorker as unknown as Worker,
      getWorkerCount: () => 1,
    });

    const resultPromise = client.load('/demo.obj');
    assert.equal(fakeWorker.postedMessages.length, 1);

    fakeWorker.emitError(new Error('obj worker exploded'));

    await assert.rejects(resultPromise, /obj worker exploded/i);
    await assert.rejects(client.load('/demo.obj'), /OBJ parse worker is unavailable/);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
