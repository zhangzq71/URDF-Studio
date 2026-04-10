import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createColladaParseWorkerPoolClient } from './colladaParseWorkerBridge.ts';

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

  emitMessage(data: unknown): void {
    this.listeners.get('message')?.forEach((handler) => {
      handler({ data });
    });
  }

  emitError(error: Error): void {
    this.listeners.get('error')?.forEach((handler) => {
      handler({ error, message: error.message });
    });
  }
}

test('Collada parse worker failures reject instead of silently reparsing on the main thread', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  let fetchCount = 0;
  const fakeWorker = new FakeWorker();
  const consoleErrors: unknown[][] = [];

  globalThis.fetch = (async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<COLLADA></COLLADA>',
    } as Response;
  }) as typeof fetch;
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args);
  };

  try {
    const client = createColladaParseWorkerPoolClient({
      canUseWorker: () => true,
      createWorker: () => fakeWorker as unknown as Worker,
      getWorkerCount: () => 1,
    });

    const resultPromise = client.load('/demo.dae', new THREE.LoadingManager());
    assert.equal(fakeWorker.postedMessages.length, 1);

    fakeWorker.emitError(new Error('collada worker exploded'));

    await assert.rejects(resultPromise, /collada worker exploded/i);
    await assert.rejects(
      client.load('/demo.dae', new THREE.LoadingManager()),
      /Collada parse worker is unavailable/i,
    );
    assert.equal(fetchCount, 0);
    assert.equal(consoleErrors.length, 1);
    assert.match(String(consoleErrors[0]?.[0] || ''), /Collada parse worker crashed/i);
    assert.match(String(consoleErrors[0]?.[1] || ''), /collada worker exploded/i);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test('Collada parse worker bridge fails fast when Worker is unavailable instead of using an inline fallback', async () => {
  const originalWorker = globalThis.Worker;
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error('fetch should not run');
  }) as typeof fetch;

  try {
    const client = createColladaParseWorkerPoolClient();
    await assert.rejects(
      client.load('/demo.dae', new THREE.LoadingManager()),
      /Collada parse worker is unavailable in this environment/i,
    );
    assert.equal(fetchCount, 0);
  } finally {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      writable: true,
      value: originalWorker,
    });
    globalThis.fetch = originalFetch;
  }
});

test('Collada parse worker cache can be cleared explicitly', async () => {
  const fakeWorker = new FakeWorker();
  const client = createColladaParseWorkerPoolClient({
    canUseWorker: () => true,
    createWorker: () => fakeWorker as unknown as Worker,
    getWorkerCount: () => 1,
  });

  const serializedResult = {
    resourcePath: '',
    sceneJson: new THREE.Group().toJSON() as unknown as Record<string, unknown>,
  };

  const firstLoad = client.load('/demo.dae', new THREE.LoadingManager());
  assert.equal(fakeWorker.postedMessages.length, 1);
  fakeWorker.emitMessage({
    type: 'parse-collada-result',
    requestId: 1,
    result: serializedResult,
  });
  await assert.doesNotReject(firstLoad);

  await assert.doesNotReject(client.load('/demo.dae', new THREE.LoadingManager()));
  assert.equal(fakeWorker.postedMessages.length, 1);

  client.clearCache();

  const secondLoad = client.load('/demo.dae', new THREE.LoadingManager());
  assert.equal(fakeWorker.postedMessages.length, 2);
  fakeWorker.emitMessage({
    type: 'parse-collada-result',
    requestId: 2,
    result: serializedResult,
  });
  await assert.doesNotReject(secondLoad);
});

test('Collada parse worker pool can be disposed and recreated on demand', async () => {
  const workers: FakeWorker[] = [];
  const client = createColladaParseWorkerPoolClient({
    canUseWorker: () => true,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    getWorkerCount: () => 1,
  });

  const serializedResult = {
    resourcePath: '',
    sceneJson: new THREE.Group().toJSON() as unknown as Record<string, unknown>,
  };

  const firstLoad = client.load('/demo.dae', new THREE.LoadingManager());
  assert.equal(workers.length, 1);
  assert.equal(workers[0]?.postedMessages.length, 1);
  workers[0]?.emitMessage({
    type: 'parse-collada-result',
    requestId: 1,
    result: serializedResult,
  });
  await assert.doesNotReject(firstLoad);

  client.dispose();

  const secondLoad = client.load('/second.dae', new THREE.LoadingManager());
  assert.equal(workers.length, 2);
  assert.equal(workers[0]?.postedMessages.length, 1);
  assert.equal(workers[1]?.postedMessages.length, 1);
  workers[1]?.emitMessage({
    type: 'parse-collada-result',
    requestId: 2,
    result: serializedResult,
  });
  await assert.doesNotReject(secondLoad);
});
