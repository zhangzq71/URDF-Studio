import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLinkRotationCursor } from './link-rotation-cursor.js';

test('keeps the default cursor while idle so USD matches the URDF/MJCF viewer', () => {
  assert.equal(resolveLinkRotationCursor({ enabled: true, dragging: false }), '');
});

test('keeps the default cursor during active USD joint dragging so it matches URDF/MJCF', () => {
  assert.equal(resolveLinkRotationCursor({ enabled: true, dragging: true }), '');
});

test('clears the cursor when the interaction controller is disabled', () => {
  assert.equal(resolveLinkRotationCursor({ enabled: false, dragging: true }), '');
});
