import test from 'node:test';
import assert from 'node:assert/strict';

import { getUrdfValidationDebounceMs } from './editorPerformance.ts';

test('keeps small URDF documents responsive with a short validation debounce', () => {
  assert.equal(getUrdfValidationDebounceMs(512), 120);
});

test('backs off validation a bit for medium and large URDF documents', () => {
  assert.equal(getUrdfValidationDebounceMs(8_000), 180);
  assert.equal(getUrdfValidationDebounceMs(30_000), 320);
});
