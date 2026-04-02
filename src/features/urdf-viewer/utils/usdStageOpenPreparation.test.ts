import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCriticalUsdDependencyPaths,
  prepareUsdStageOpenDataCore,
  resolveUsdStageOpenPreparationConcurrency,
} from './usdStageOpenPreparationCore.ts';

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

test('buildCriticalUsdDependencyPaths preserves usda configuration layers for Isaac-style roots', () => {
  assert.deepEqual(
    buildCriticalUsdDependencyPaths('/test/unitree_ros_usda/go2_description/urdf/go2_description.usda'),
    [
      '/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_base.usda',
      '/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_physics.usda',
      '/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_sensor.usda',
      '/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_robot.usda',
    ],
  );
});

test('resolveUsdStageOpenPreparationConcurrency caps worker preload fan-out at 10', () => {
  assert.equal(resolveUsdStageOpenPreparationConcurrency(64), 10);
  assert.equal(resolveUsdStageOpenPreparationConcurrency(1), 2);
});

test('prepareUsdStageOpenDataCore materializes preload blobs and keeps optional failures soft', async () => {
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
    const result = await prepareUsdStageOpenDataCore(
      {
        name: 'Go2/usd/go2.usd',
        content: '#usda 1.0\n(\n  subLayers = [@./configuration/go2_description_base.usd@, @./configuration/go2_description_sensor.usd@]\n)\n',
        blobUrl: undefined,
      },
      [
        {
          name: 'Go2/usd/go2.usd',
          content: '#usda 1.0\n(\n  subLayers = [@./configuration/go2_description_base.usd@, @./configuration/go2_description_sensor.usd@]\n)\n',
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
        'Go2/usd/configuration/go2_description_base.usd': 'blob:go2-base',
        'Go2/usd/configuration/go2_description_sensor.usd': 'blob:missing-texture',
        'Go2/textures/body.png': 'blob:go2-texture',
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
        { path: '/Go2/usd/configuration/go2_description_base.usd', hasBlob: true, hasError: false },
        { path: '/Go2/usd/configuration/go2_description_sensor.usd', hasBlob: false, hasError: true },
        { path: '/Go2/usd/go2.usd', hasBlob: true, hasError: false },
      ],
    );
    assert.deepEqual(fetchCalls.sort(), [
      'blob:go2-base',
      'blob:missing-texture',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('prepareUsdStageOpenDataCore keeps Isaac-style USDA sidecars as critical dependencies', async () => {
  const result = await prepareUsdStageOpenDataCore(
    {
      name: 'test/unitree_ros_usda/go2_description/urdf/go2_description.usda',
      content: '#usda 1.0\n',
      blobUrl: undefined,
    },
    [
      {
        name: 'test/unitree_ros_usda/go2_description/urdf/go2_description.usda',
        content: '#usda 1.0\n',
        blobUrl: undefined,
        format: 'usd',
      },
      {
        name: 'test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_base.usda',
        content: '#usda 1.0\n',
        blobUrl: undefined,
        format: 'usd',
      },
      {
        name: 'test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_physics.usda',
        content: '#usda 1.0\n',
        blobUrl: undefined,
        format: 'usd',
      },
      {
        name: 'test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_sensor.usda',
        content: '#usda 1.0\n',
        blobUrl: undefined,
        format: 'usd',
      },
      {
        name: 'test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_robot.usda',
        content: '#usda 1.0\n',
        blobUrl: undefined,
        format: 'usd',
      },
    ],
    {},
  );

  assert.equal(result.stageSourcePath, '/test/unitree_ros_usda/go2_description/urdf/go2_description.usda');
  assert.deepEqual(result.criticalDependencyPaths, [
    '/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_base.usda',
    '/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_physics.usda',
    '/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_sensor.usda',
    '/test/unitree_ros_usda/go2_description/urdf/configuration/go2_description_robot.usda',
  ]);
});
