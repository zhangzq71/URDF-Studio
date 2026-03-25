import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureUsdWasmRuntime } from './usdWasmRuntime';

test('ensureUsdWasmRuntime rejects early when the page is not cross-origin isolated', async () => {
  const previousWindow = globalThis.window;
  const previousCrossOriginIsolated = globalThis.crossOriginIsolated;

  Object.defineProperty(globalThis, 'window', {
    value: {} as Window & typeof globalThis,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: false,
    configurable: true,
    writable: true,
  });

  await assert.rejects(
    () => ensureUsdWasmRuntime(),
    /cross-origin isolated page|SharedArrayBuffer/,
  );

  if (previousWindow === undefined) {
    delete (globalThis as { window?: Window & typeof globalThis }).window;
  } else {
    Object.defineProperty(globalThis, 'window', {
      value: previousWindow,
      configurable: true,
      writable: true,
    });
  }

  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: previousCrossOriginIsolated,
    configurable: true,
    writable: true,
  });
});
