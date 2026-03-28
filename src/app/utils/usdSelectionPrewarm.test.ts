import test from 'node:test';
import assert from 'node:assert/strict';

import type { RobotFile } from '@/types';
import { createUsdSelectionPrewarmHandler } from './usdSelectionPrewarm.ts';

test('USD selection prewarm is a no-op for non-USD files', () => {
  let runtimePrewarmCalls = 0;
  let stageOpenPrewarmCalls = 0;

  const prewarm = createUsdSelectionPrewarmHandler({
    prewarmRuntime: () => {
      runtimePrewarmCalls += 1;
    },
    prewarmStageOpen: () => {
      stageOpenPrewarmCalls += 1;
    },
  });

  prewarm(
    {
      name: 'robots/demo/robot.urdf',
      format: 'urdf',
      content: '<robot />',
    },
    [],
    {},
  );

  assert.equal(runtimePrewarmCalls, 0);
  assert.equal(stageOpenPrewarmCalls, 0);
});

test('USD selection prewarm warms runtime and stage-open data together', () => {
  let runtimePrewarmCalls = 0;
  const stageOpenCalls: Array<{
    file: Pick<RobotFile, 'name' | 'format'>;
    availableFiles: number;
    assetKeys: string[];
  }> = [];

  const prewarm = createUsdSelectionPrewarmHandler({
    prewarmRuntime: () => {
      runtimePrewarmCalls += 1;
    },
    prewarmStageOpen: (file, availableFiles, assets) => {
      stageOpenCalls.push({
        file: { name: file.name, format: file.format },
        availableFiles: availableFiles.length,
        assetKeys: Object.keys(assets).sort(),
      });
    },
  });

  prewarm(
    {
      name: 'robots/go2/usd/go2.usd',
      format: 'usd',
      content: '#usda 1.0',
      blobUrl: 'blob:go2-root',
    },
    [{
      name: 'robots/go2/usd/go2.usd',
      format: 'usd',
      content: '#usda 1.0',
      blobUrl: 'blob:go2-root',
    }],
    {
      'robots/go2/textures/body.png': 'blob:body',
    },
  );

  assert.equal(runtimePrewarmCalls, 1);
  assert.deepEqual(stageOpenCalls, [{
    file: {
      name: 'robots/go2/usd/go2.usd',
      format: 'usd',
    },
    availableFiles: 1,
    assetKeys: ['robots/go2/textures/body.png'],
  }]);
});
