import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUsdBindingsAssetPath, buildUsdBindingsScriptUrl } from './usdBindingsAssetPaths.ts';

test('buildUsdBindingsScriptUrl keeps the root public path by default', () => {
  assert.equal(
    buildUsdBindingsScriptUrl('20260318a', { baseUrl: '/' }),
    '/usd/bindings/emHdBindings.js?v=20260318a',
  );
});

test('buildUsdBindingsScriptUrl respects non-root Vite base paths', () => {
  assert.equal(
    buildUsdBindingsScriptUrl('20260318a', { baseUrl: '/urdf-studio/' }),
    '/urdf-studio/usd/bindings/emHdBindings.js?v=20260318a',
  );
});

test('buildUsdBindingsAssetPath normalizes already-prefixed binding asset paths', () => {
  assert.equal(
    buildUsdBindingsAssetPath('/usd/bindings/emHdBindings.wasm', {
      baseUrl: '/urdf-studio/',
      cacheKey: '20260318a',
    }),
    '/urdf-studio/usd/bindings/emHdBindings.wasm?v=20260318a',
  );
});
