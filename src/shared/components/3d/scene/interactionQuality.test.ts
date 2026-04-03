import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESTING_DPR_CAP,
  resolveCanvasDpr,
} from './interactionQuality.ts';

test('resolveCanvasDpr keeps resting canvases crisp up to the resting cap', () => {
  assert.equal(
    resolveCanvasDpr({ devicePixelRatio: 2.5, isInteracting: false }),
    RESTING_DPR_CAP,
  );
});

test('resolveCanvasDpr keeps interactive canvases at the resting DPR cap to avoid grid thickness shifts', () => {
  assert.equal(
    resolveCanvasDpr({ devicePixelRatio: 2.5, isInteracting: true }),
    RESTING_DPR_CAP,
  );
});

test('resolveCanvasDpr does not upscale low-DPR displays while interacting', () => {
  assert.equal(
    resolveCanvasDpr({ devicePixelRatio: 0.9, isInteracting: true }),
    0.9,
  );
});

test('resolveCanvasDpr falls back to a safe DPR when the device ratio is invalid', () => {
  assert.equal(
    resolveCanvasDpr({ devicePixelRatio: Number.NaN, isInteracting: false }),
    1,
  );
});
