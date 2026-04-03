import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveVisualizerMaterialOpacity } from './materialOpacity';

test('visual material opacity follows the shared model opacity in detail mode', () => {
  assert.equal(resolveVisualizerMaterialOpacity({
    isCollision: false,
    isHovered: false,
    isSelected: false,
    modelOpacity: 0.42,
  }), 0.42);
});

test('visual material opacity no longer depends on legacy skeleton semantics', () => {
  assert.equal(resolveVisualizerMaterialOpacity({
    isCollision: false,
    isHovered: false,
    isSelected: false,
    modelOpacity: 0.42,
  }), 0.42);
});

test('collision material opacity remains unchanged by the shared model opacity control', () => {
  assert.equal(resolveVisualizerMaterialOpacity({
    isCollision: true,
    isHovered: false,
    isSelected: false,
    modelOpacity: 0.42,
  }), 0.3);

  assert.equal(resolveVisualizerMaterialOpacity({
    isCollision: true,
    isHovered: true,
    isSelected: false,
    modelOpacity: 0.42,
  }), 0.6);
});
