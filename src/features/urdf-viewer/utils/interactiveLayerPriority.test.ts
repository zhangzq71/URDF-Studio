import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveInteractiveLayerPriority } from './interactiveLayerPriority.ts';

test('resolveInteractiveLayerPriority prefers the most recently activated visible layer', () => {
  const priority = resolveInteractiveLayerPriority({
    showVisual: true,
    showCollision: true,
    showCollisionAlwaysOnTop: false,
    showOrigins: false,
    showOriginsOverlay: false,
    showJointAxes: false,
    showJointAxesOverlay: false,
    showCenterOfMass: true,
    showCoMOverlay: false,
    showInertia: false,
    showInertiaOverlay: false,
    activationOrder: {
      visual: 1,
      collision: 3,
      'origin-axes': 0,
      'joint-axis': 0,
      'center-of-mass': 2,
      inertia: 0,
    },
  });

  assert.deepEqual(priority, ['collision', 'center-of-mass', 'visual']);
});

test('resolveInteractiveLayerPriority promotes overlay layers ahead of newer non-overlay layers', () => {
  const priority = resolveInteractiveLayerPriority({
    showVisual: true,
    showCollision: true,
    showCollisionAlwaysOnTop: false,
    showOrigins: true,
    showOriginsOverlay: true,
    showJointAxes: false,
    showJointAxesOverlay: false,
    showCenterOfMass: false,
    showCoMOverlay: false,
    showInertia: false,
    showInertiaOverlay: false,
    activationOrder: {
      visual: 1,
      collision: 3,
      'origin-axes': 2,
      'joint-axis': 0,
      'center-of-mass': 0,
      inertia: 0,
    },
  });

  assert.deepEqual(priority, ['origin-axes', 'collision', 'visual']);
});
