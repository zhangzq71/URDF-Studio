import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCriticalUsdDependencyPaths,
  prepareUsdStageOpenData,
  resolveUsdStageOpenPreparationConcurrency,
} from './usdStageOpenPreparation.ts';

test('buildCriticalUsdDependencyPaths infers configuration sublayers for Unitree roots', () => {
  assert.deepEqual(
    buildCriticalUsdDependencyPaths('/Go2/usd/go2.usd'),
    [
      '/Go2/usd/configuration/go2_description_base.usd',
      '/Go2/usd/configuration/go2_description_physics.usd',
      '/Go2/usd/configuration/go2_description_sensor.usd',
    ],
  );
});

test('buildCriticalUsdDependencyPaths prefers robot config for h1_2_handless', () => {
  assert.deepEqual(
    buildCriticalUsdDependencyPaths('/robots/h1_2_handless/usd/h1_2_handless.usd'),
    [
      '/robots/h1_2_handless/usd/configuration/h1_2_handless_base.usd',
      '/robots/h1_2_handless/usd/configuration/h1_2_handless_physics.usd',
      '/robots/h1_2_handless/usd/configuration/h1_2_handless_robot.usd',
    ],
  );
});

test('resolveUsdStageOpenPreparationConcurrency caps worker preload fan-out at 10', () => {
  assert.equal(resolveUsdStageOpenPreparationConcurrency(64), 10);
  assert.equal(resolveUsdStageOpenPreparationConcurrency(1), 2);
});

test('prepareUsdStageOpenData materializes preload blobs and keeps optional failures soft', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchCalls.push(url);

    if (url === 'blob:go2-root') {
      return new Response(new Blob(['root-binary'], { type: 'application/octet-stream' }), { status: 200 });
    }

    if (url === 'blob:go2-base') {
      return new Response(new Blob(['base-binary'], { type: 'application/octet-stream' }), { status: 200 });
    }

    return new Response('missing', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await prepareUsdStageOpenData(
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
      ],
      {
        'Go2/usd/go2.usd': 'blob:go2-root',
        'Go2/usd/configuration/go2_description_base.usd': 'blob:go2-base',
        'Go2/textures/body.png': 'blob:missing-texture',
      },
    );

    assert.equal(result.stageSourcePath, '/Go2/usd/go2.usd');
    assert.deepEqual(result.criticalDependencyPaths, [
      '/Go2/usd/configuration/go2_description_base.usd',
      '/Go2/usd/configuration/go2_description_physics.usd',
      '/Go2/usd/configuration/go2_description_sensor.usd',
    ]);
    assert.deepEqual(
      result.preloadFiles.map((entry) => ({
        path: entry.path,
        hasBlob: !!entry.blob,
        hasError: !!entry.error,
      })),
      [
        { path: '/Go2/textures/body.png', hasBlob: false, hasError: true },
        { path: '/Go2/usd/configuration/go2_description_base.usd', hasBlob: true, hasError: false },
        { path: '/Go2/usd/go2.usd', hasBlob: true, hasError: false },
      ],
    );
    assert.deepEqual(fetchCalls, [
      'blob:missing-texture',
      'blob:go2-base',
      'blob:go2-root',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
