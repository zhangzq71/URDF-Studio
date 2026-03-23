import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUsdHydrationPersistencePlan } from './usdHydrationPersistence.ts';

test('buildUsdHydrationPersistencePlan seeds missing USD export fallbacks from the first hydration result', () => {
  const usdSceneSnapshot = {
    stageSourcePath: '/robots/demo/demo.usd',
  };

  const plan = buildUsdHydrationPersistencePlan({
    resolution: {
      usdSceneSnapshot,
    },
    existingSceneSnapshot: null,
    existingPreparedExportCache: null,
  });

  assert.equal(plan.sceneSnapshot, usdSceneSnapshot);
  assert.equal(plan.shouldSeedSceneSnapshot, true);
  assert.equal(plan.shouldSeedPreparedExportCache, true);
});

test('buildUsdHydrationPersistencePlan preserves any existing USD export fallbacks', () => {
  const existingSceneSnapshot = {
    stageSourcePath: '/robots/demo/demo.usd',
  };
  const existingPreparedExportCache = {
    stageSourcePath: '/robots/demo/demo.usd',
    robotData: {
      name: 'prepared_robot',
      rootLinkId: 'base_link',
      links: {},
      joints: {},
    },
    meshFiles: {},
  };

  const plan = buildUsdHydrationPersistencePlan({
    resolution: {
      usdSceneSnapshot: null,
    },
    existingSceneSnapshot,
    existingPreparedExportCache,
  });

  assert.equal(plan.sceneSnapshot, existingSceneSnapshot);
  assert.equal(plan.shouldSeedSceneSnapshot, false);
  assert.equal(plan.shouldSeedPreparedExportCache, false);
});
