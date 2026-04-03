import test from 'node:test';
import assert from 'node:assert/strict';

import {
  measureCanvasPointerPosition,
  normalizeCanvasPointerPosition,
} from './pointerNormalization';

test('measureCanvasPointerPosition keeps pointer coordinates aligned to the same DOMRect dimensions', () => {
  const measurement = measureCanvasPointerPosition(460, 245, {
    left: 10,
    top: 20,
    width: 900,
    height: 450,
  });

  assert.deepEqual(measurement, {
    x: 450,
    y: 225,
    width: 900,
    height: 450,
    inside: true,
  });

  assert.deepEqual(normalizeCanvasPointerPosition(measurement), {
    x: 0,
    y: 0,
  });
});

test('measureCanvasPointerPosition marks points outside the rendered canvas bounds', () => {
  const measurement = measureCanvasPointerPosition(1000, 245, {
    left: 10,
    top: 20,
    width: 900,
    height: 450,
  });

  assert.equal(measurement.inside, false);
});

test('normalizeCanvasPointerPosition rejects zero-sized canvases', () => {
  assert.equal(
    normalizeCanvasPointerPosition({
      x: 10,
      y: 20,
      width: 0,
      height: 450,
    }),
    null,
  );
});
