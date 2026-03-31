import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldUseUsdOffscreenStage } from './usdOffscreenStagePolicy';

test('uses offscreen USD stage only for worker-capable pure view mode', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'view',
    workerRendererSupported: true,
  }), true);
});

test('keeps interactive USD selection modes on the main-thread stage', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'select',
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'translate',
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'measure',
    workerRendererSupported: true,
  }), false);
});

test('keeps focus and active selection flows on the main-thread stage', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'view',
    selection: { type: 'link', id: 'base' },
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'view',
    hoveredSelection: { type: 'link', id: 'hip' },
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'view',
    focusTarget: 'hip_joint',
    workerRendererSupported: true,
  }), false);
});

test('falls back when offscreen worker rendering is unavailable', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'view',
    workerRendererSupported: false,
  }), false);
});
