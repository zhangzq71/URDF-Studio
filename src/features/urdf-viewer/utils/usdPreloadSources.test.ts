import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUsdBundlePreloadEntries,
  createUsdPreloadSource,
  inferUsdBundleVirtualDirectory,
  isUsdPathWithinBundleDirectory,
  resolveUsdBlobUrl,
} from './usdPreloadSources.ts';

test('resolveUsdBlobUrl falls back to the assets map when binary USD placeholders lose blobUrl', () => {
  const resolved = resolveUsdBlobUrl(
    'Go2/usd/configuration/go2_description_base.usd',
    undefined,
    {
      'Go2/usd/configuration/go2_description_base.usd': 'blob:go2-base',
    },
  );

  assert.equal(resolved, 'blob:go2-base');
});

test('resolveUsdBlobUrl supports leading-slash virtual paths', () => {
  const resolved = resolveUsdBlobUrl(
    '/Go2 (1)/usd/go2.usd',
    undefined,
    {
      'Go2 (1)/usd/go2.usd': 'blob:go2-root',
    },
  );

  assert.equal(resolved, 'blob:go2-root');
});

test('createUsdPreloadSource prefers a blob-backed source over empty text content', () => {
  const preloadSource = createUsdPreloadSource(
    {
      name: 'Go2/usd/go2.usd',
      content: '',
      blobUrl: undefined,
    },
    {
      'Go2/usd/go2.usd': 'blob:go2-root',
    },
  );

  assert.equal(preloadSource.kind, 'blob-url');
});

test('createUsdPreloadSource falls back to text content for textual USDA files', () => {
  const preloadSource = createUsdPreloadSource(
    {
      name: 'robot.usda',
      content: '#usda 1.0',
      blobUrl: undefined,
    },
    {},
  );

  assert.equal(preloadSource.kind, 'text-content');
});

test('createUsdPreloadSource prefers inline text content for textual USD files even when blob URLs exist', () => {
  const preloadSource = createUsdPreloadSource(
    {
      name: 'unitree_model/B2/usd/b2.usd',
      content: '#usda 1.0',
      blobUrl: 'blob:b2-root',
    },
    {
      'unitree_model/B2/usd/b2.usd': 'blob:b2-root',
    },
  );

  assert.equal(preloadSource.kind, 'text-content');
});

test('inferUsdBundleVirtualDirectory scopes to the package root before /usd/ when available', () => {
  const bundleDirectory = inferUsdBundleVirtualDirectory(
    'robots/unitree/go2/usd/go2.usd',
  );

  assert.equal(bundleDirectory, '/robots/unitree/go2/');
});

test('isUsdPathWithinBundleDirectory includes only files from the same USD package directory', () => {
  const bundleDirectory = inferUsdBundleVirtualDirectory(
    'Go2/usd/go2.usd',
  );

  assert.equal(
    isUsdPathWithinBundleDirectory('Go2/usd/configuration/go2_description_base.usd', bundleDirectory),
    true,
  );
  assert.equal(
    isUsdPathWithinBundleDirectory('Go2/meshes/base_link.STL', bundleDirectory),
    true,
  );
  assert.equal(
    isUsdPathWithinBundleDirectory('H1/usd/h1.usd', bundleDirectory),
    false,
  );
  assert.equal(
    isUsdPathWithinBundleDirectory('/configuration/go2_description_base.usd', bundleDirectory),
    false,
  );
});

test('buildUsdBundlePreloadEntries only preloads files from the current USD package bundle', () => {
  const preloadEntries = buildUsdBundlePreloadEntries(
    {
      name: 'Go2/usd/go2.usd',
      content: '',
      blobUrl: undefined,
    },
    [
      {
        name: 'Go2/usd/go2.usd',
        content: '',
        blobUrl: undefined,
        format: 'usd',
      },
      {
        name: 'Go2/usd/configuration/go2_description_base.usd',
        content: '',
        blobUrl: undefined,
        format: 'usd',
      },
      {
        name: 'Go2/meshes/base_link.stl',
        content: '',
        blobUrl: undefined,
        format: 'mesh',
      },
      {
        name: 'H1/usd/h1.usd',
        content: '',
        blobUrl: undefined,
        format: 'usd',
      },
    ],
    {
      'Go2/usd/go2.usd': 'blob:go2-root',
      'Go2/usd/configuration/go2_description_base.usd': 'blob:go2-base',
      'Go2/textures/body.png': 'blob:go2-texture',
      'H1/textures/body.png': 'blob:h1-texture',
    },
  );

  assert.deepEqual(
    preloadEntries.map((entry) => entry.path),
    [
      '/Go2/textures/body.png',
      '/Go2/usd/configuration/go2_description_base.usd',
      '/Go2/usd/go2.usd',
    ],
  );
});
