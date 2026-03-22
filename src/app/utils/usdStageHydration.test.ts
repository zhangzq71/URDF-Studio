import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldApplyUsdStageHydration } from './usdStageHydration.ts';

test('applies USD stage hydration only for the pending selected file', () => {
  assert.equal(shouldApplyUsdStageHydration({
    pendingFileName: 'robots/demo/scene.usd',
    selectedFileName: 'robots/demo/scene.usd',
    stageSourcePath: '/robots/demo/scene.usd',
  }), true);
});

test('skips USD stage hydration when the resolved stage no longer matches the selected file', () => {
  assert.equal(shouldApplyUsdStageHydration({
    pendingFileName: 'robots/demo/scene.usd',
    selectedFileName: 'robots/demo/other.usd',
    stageSourcePath: '/robots/demo/scene.usd',
  }), false);
});

test('skips USD stage hydration after the initial pending file marker is cleared', () => {
  assert.equal(shouldApplyUsdStageHydration({
    pendingFileName: null,
    selectedFileName: 'robots/demo/scene.usd',
    stageSourcePath: '/robots/demo/scene.usd',
  }), false);
});
