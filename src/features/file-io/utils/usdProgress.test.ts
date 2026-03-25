import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceUsdProgress,
  createUsdProgressTracker,
  normalizeUsdProgressLabel,
} from './usdProgress.ts';

test('normalizeUsdProgressLabel trims values and falls back for blank labels', () => {
  assert.equal(normalizeUsdProgressLabel('  mesh_0  ', 'asset'), 'mesh_0');
  assert.equal(normalizeUsdProgressLabel('   ', 'asset'), 'asset');
  assert.equal(normalizeUsdProgressLabel(undefined, 'asset'), 'asset');
});

test('createUsdProgressTracker emits initial progress and advanceUsdProgress clamps at total', () => {
  const events: Array<{ phase: string; completed: number; total: number; label?: string }> = [];
  const tracker = createUsdProgressTracker('scene', 2, (progress) => {
    events.push(progress);
  });

  advanceUsdProgress(tracker, 'root');
  advanceUsdProgress(tracker, 'looks');
  advanceUsdProgress(tracker, 'overflow');

  assert.deepEqual(events, [
    { phase: 'scene', completed: 0, total: 2 },
    { phase: 'scene', completed: 1, total: 2, label: 'root' },
    { phase: 'scene', completed: 2, total: 2, label: 'looks' },
    { phase: 'scene', completed: 2, total: 2, label: 'overflow' },
  ]);
});
