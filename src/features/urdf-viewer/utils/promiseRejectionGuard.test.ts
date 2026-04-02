import test from 'node:test';
import assert from 'node:assert/strict';

import { guardPromiseRejection } from './promiseRejectionGuard.ts';

function waitForNextMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

test('guardPromiseRejection preserves fulfilled results', async () => {
  const promise = guardPromiseRejection(Promise.resolve('ready'));

  await assert.doesNotReject(async () => {
    assert.equal(await promise, 'ready');
  });
});

test('guardPromiseRejection prevents transient unhandled rejections before the caller awaits the promise', async () => {
  const unhandledReasons: unknown[] = [];
  const handleUnhandledRejection = (reason: unknown) => {
    unhandledReasons.push(reason);
  };
  process.on('unhandledRejection', handleUnhandledRejection);

  const expectedError = new Error('USD stage load disposed for "unitree_model/B2/usd/b2.usd".');

  try {
    const promise = guardPromiseRejection(new Promise<never>((_, reject) => {
      queueMicrotask(() => reject(expectedError));
    }));

    await waitForNextMacrotask();
    assert.deepEqual(unhandledReasons, []);

    await assert.rejects(promise, expectedError);
  } finally {
    process.removeListener('unhandledRejection', handleUnhandledRejection);
  }
});
