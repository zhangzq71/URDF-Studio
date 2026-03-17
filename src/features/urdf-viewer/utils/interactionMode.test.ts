import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEffectiveInteractionSubType } from './interactionMode.ts';

test('keeps visual interaction when link mode visuals are visible', () => {
  assert.deepEqual(
    resolveEffectiveInteractionSubType('link', true, true),
    { subType: 'visual', didFallback: false },
  );
});

test('falls back to collision interaction when link mode visuals are hidden but collisions are visible', () => {
  assert.deepEqual(
    resolveEffectiveInteractionSubType('link', false, true),
    { subType: 'collision', didFallback: true },
  );
});

test('falls back to visual interaction when collision mode colliders are hidden but visuals are visible', () => {
  assert.deepEqual(
    resolveEffectiveInteractionSubType('collision', true, false),
    { subType: 'visual', didFallback: true },
  );
});

test('returns null when neither visuals nor collisions are visible', () => {
  assert.deepEqual(
    resolveEffectiveInteractionSubType('collision', false, false),
    { subType: null, didFallback: false },
  );
});
