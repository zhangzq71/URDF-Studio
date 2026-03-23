import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRevoluteDragDelta } from './drag-delta.js';

test('prefers the projected plane delta when the camera is facing the joint plane', () => {
  assert.equal(
    resolveRevoluteDragDelta({
      worldDeltaDeg: 14,
      tangentDeltaDeg: -6,
      planeFacingRatio: 0.88,
    }),
    14,
  );
});

test('keeps trusting the projected plane delta when the plane is nearly edge-on', () => {
  assert.equal(
    resolveRevoluteDragDelta({
      worldDeltaDeg: 3,
      tangentDeltaDeg: -11,
      planeFacingRatio: 0.05,
    }),
    3,
  );
});

test('falls back to the projected delta when tangent dragging is unavailable', () => {
  assert.equal(
    resolveRevoluteDragDelta({
      worldDeltaDeg: -9,
      tangentDeltaDeg: 0,
      planeFacingRatio: 0.02,
    }),
    -9,
  );
});
