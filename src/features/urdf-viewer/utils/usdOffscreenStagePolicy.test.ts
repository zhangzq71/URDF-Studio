import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldBootstrapUsdOffscreenStage,
  shouldUseUsdOffscreenStage,
} from './usdOffscreenStagePolicy.ts';

test('uses offscreen USD stage for worker-capable view and select modes', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'view',
    workerRendererSupported: true,
  }), true);
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'select',
    workerRendererSupported: true,
  }), true);
});

test('keeps transform-heavy USD modes on the main-thread stage', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'translate',
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'measure',
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'select',
    showOrigins: true,
    workerRendererSupported: true,
  }), false);
});

test('keeps articulated hand USD bundles on the main-thread stage', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'select',
    sourceFile: {
      name: 'h1_2/h1_2.usd',
      format: 'usd',
    },
    availableFiles: [
      {
        name: 'h1_2/configuration/h1_2_base.usd',
        format: 'usd',
      },
    ],
    workerRendererSupported: true,
  }), false);
});

test('allows handless humanoid USD bundles to keep using offscreen rendering', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'select',
    sourceFile: {
      name: 'h1_2_handless/h1_2_handless.usd',
      format: 'usd',
      content: '#usda 1.0',
    },
    availableFiles: [
      {
        name: 'h1_2_handless/configuration/h1_2_handless_base.usd',
        format: 'usd',
        content: 'def PhysicsRevoluteJoint "left_shoulder_pitch_joint" {}',
      },
    ],
    workerRendererSupported: true,
  }), true);
});

test('keeps textual articulated hand USDA bundles on the main-thread stage', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'select',
    sourceFile: {
      name: 'custom_hands/root.usda',
      format: 'usd',
      content: '#usda 1.0',
    },
    availableFiles: [
      {
        name: 'custom_hands/config/robot_base.usda',
        format: 'usd',
        content: 'def PhysicsRevoluteJoint "R_thumb_proximal_yaw_joint" {}',
      },
    ],
    workerRendererSupported: true,
  }), false);
});

test('keeps default select-mode USD loads on the single interactive stage path', () => {
  assert.equal(shouldBootstrapUsdOffscreenStage({
    toolMode: 'select',
    workerRendererSupported: true,
  }), false);
});

test('keeps explicit selection, hover, focus and non-select tools off the bootstrap handoff path', () => {
  assert.equal(shouldBootstrapUsdOffscreenStage({
    toolMode: 'measure',
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldBootstrapUsdOffscreenStage({
    toolMode: 'select',
    selection: { type: 'link', id: 'base' },
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldBootstrapUsdOffscreenStage({
    toolMode: 'select',
    hoveredSelection: { type: 'link', id: 'hip' },
    workerRendererSupported: true,
  }), false);
  assert.equal(shouldBootstrapUsdOffscreenStage({
    toolMode: 'select',
    focusTarget: 'hip_joint',
    workerRendererSupported: true,
  }), false);
});

test('keeps focus flows on the main-thread stage but allows normal select state inside offscreen mode', () => {
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'view',
    selection: { type: 'link', id: 'base' },
    workerRendererSupported: true,
  }), true);
  assert.equal(shouldUseUsdOffscreenStage({
    toolMode: 'select',
    hoveredSelection: { type: 'link', id: 'hip' },
    workerRendererSupported: true,
  }), true);
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
