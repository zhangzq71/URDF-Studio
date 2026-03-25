import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createUsdAssetRegistry,
  createUsdTextureLoadingManager,
  resolveUsdAssetUrl,
} from './usdAssetRegistry.ts';

test('createUsdAssetRegistry resolves package-prefixed extra mesh files through stable aliases', () => {
  const extraMeshFiles = new Map([
    ['package://go2_description/dae/base.dae', new Blob(['<dae />'], { type: 'model/vnd.collada+xml' })],
  ]);

  const { registry, tempObjectUrls } = createUsdAssetRegistry({}, extraMeshFiles);

  assert.equal(tempObjectUrls.length, 1);

  const [objectUrl] = tempObjectUrls;
  assert.match(objectUrl, /^blob:/);
  assert.equal(resolveUsdAssetUrl('package://go2_description/dae/base.dae', registry), objectUrl);
  assert.equal(resolveUsdAssetUrl('dae/base.dae', registry), objectUrl);
  assert.equal(resolveUsdAssetUrl('base.dae', registry), objectUrl);

  URL.revokeObjectURL(objectUrl);
});

test('resolveUsdAssetUrl matches texture assets case-insensitively and preserves direct URLs', () => {
  const dataUrl = 'data:image/png;base64,AAAA';
  const { registry } = createUsdAssetRegistry({
    'Textures/Checker.PNG': dataUrl,
  });

  assert.equal(resolveUsdAssetUrl('textures/checker.png', registry), dataUrl);
  assert.equal(resolveUsdAssetUrl('checker.png', registry), dataUrl);
  assert.equal(resolveUsdAssetUrl('blob:temporary-asset', registry), 'blob:temporary-asset');
  assert.equal(
    resolveUsdAssetUrl('https://example.com/assets/checker.png', registry),
    'https://example.com/assets/checker.png',
  );
});

test('createUsdTextureLoadingManager rewrites mapped URLs and leaves unknown URLs untouched', () => {
  const dataUrl = 'data:image/png;base64,BBBB';
  const { registry } = createUsdAssetRegistry({
    'textures/checker.png': dataUrl,
  });

  const manager = createUsdTextureLoadingManager(registry);

  assert.equal(manager.resolveURL('textures/checker.png'), dataUrl);
  assert.equal(manager.resolveURL('missing.png'), 'missing.png');
});
