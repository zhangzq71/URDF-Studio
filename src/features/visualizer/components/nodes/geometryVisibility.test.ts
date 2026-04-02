import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGeometryVisibilityState } from './geometryVisibility.ts';

test('appMode `editor` keeps visual geometry visible and interactive', () => {
  const state = resolveGeometryVisibilityState({
    mode: 'editor',
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

test('editor mode ignores the legacy geometry toggle for visual bodies', () => {
  const state = resolveGeometryVisibilityState({
    mode: 'editor',
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

test('collision geometry renders when enabled', () => {
  const state = resolveGeometryVisibilityState({
    mode: 'editor',
    isCollision: true,
    showGeometry: true,
    showCollision: true,
  });

  assert.deepEqual(state, {
    shouldRender: true,
    visible: true,
    interactive: true,
  });
});

test('collision geometry stays hidden when the unified collision toggle is off', () => {
  const state = resolveGeometryVisibilityState({
    mode: 'editor',
    isCollision: true,
    showGeometry: true,
    showCollision: false,
  });

  assert.deepEqual(state, {
    shouldRender: false,
    visible: false,
    interactive: false,
  });
});
