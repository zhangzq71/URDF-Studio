import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveUsdStageInteractionPolicy,
  resolveUsdStageJointRotationRuntime,
} from './usdInteractionPolicy.ts';

test('uses direct mesh selection in detail mode so USD matches URDF/MJCF picking behavior', () => {
  assert.deepEqual(resolveUsdStageInteractionPolicy('detail'), {
    enableContinuousHover: true,
    enableJointRotation: false,
    enableMeshSelection: true,
  });
});

test('keeps joint rotation interaction in hardware mode', () => {
  assert.deepEqual(resolveUsdStageInteractionPolicy('hardware'), {
    enableContinuousHover: true,
    enableJointRotation: true,
    enableMeshSelection: false,
  });
});

test('disables continuous hover in pure view mode so pointer browsing stays read-only', () => {
  assert.deepEqual(resolveUsdStageInteractionPolicy('detail', 'view'), {
    enableContinuousHover: false,
    enableJointRotation: false,
    enableMeshSelection: false,
  });
});

test('disables USD joint rotation in pure view mode so clicking stays read-only', () => {
  assert.deepEqual(resolveUsdStageJointRotationRuntime({
    mode: 'detail',
    highlightMode: 'link',
    showVisual: true,
    showCollision: false,
    toolMode: 'view',
  }), {
    enabled: false,
    pickSubType: null,
  });
});

test('enables USD joint rotation in detail when visual meshes are the active interaction target', () => {
  assert.deepEqual(resolveUsdStageJointRotationRuntime({
    mode: 'detail',
    highlightMode: 'link',
    showVisual: true,
    showCollision: true,
    toolMode: 'select',
  }), {
    enabled: true,
    pickSubType: 'visual',
  });
});

test('disables USD joint rotation when collision meshes are the active interaction target', () => {
  assert.deepEqual(resolveUsdStageJointRotationRuntime({
    mode: 'hardware',
    highlightMode: 'collision',
    showVisual: true,
    showCollision: true,
    toolMode: 'select',
  }), {
    enabled: false,
    pickSubType: 'collision',
  });
});

test('disables USD joint rotation while the measure tool is active', () => {
  assert.deepEqual(resolveUsdStageJointRotationRuntime({
    mode: 'detail',
    highlightMode: 'link',
    showVisual: true,
    showCollision: false,
    toolMode: 'measure',
  }), {
    enabled: false,
    pickSubType: null,
  });
});
