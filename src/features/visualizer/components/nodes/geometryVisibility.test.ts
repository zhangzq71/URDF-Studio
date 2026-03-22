import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGeometryVisibilityState } from './geometryVisibility.ts';

test('skeleton mode keeps hidden visual geometry mounted for ground alignment', () => {
  const state = resolveGeometryVisibilityState({
    mode: 'skeleton',
    isCollision: false,
    showGeometry: false,
    showCollision: false,
  });

  assert.deepEqual(state, {
    shouldRender: true,
    visible: false,
    interactive: false,
  });
});

test('detail mode still renders visible interactive visual geometry', () => {
  const state = resolveGeometryVisibilityState({
    mode: 'detail',
    isCollision: false,
    showGeometry: false,
    showCollision: false,
  });

  assert.deepEqual(state, {
    shouldRender: true,
    visible: true,
    interactive: true,
  });
});

test('non-detail collision geometry remains unmounted', () => {
  const state = resolveGeometryVisibilityState({
    mode: 'hardware',
    isCollision: true,
    showGeometry: true,
    showCollision: true,
  });

  assert.deepEqual(state, {
    shouldRender: false,
    visible: false,
    interactive: false,
  });
});
