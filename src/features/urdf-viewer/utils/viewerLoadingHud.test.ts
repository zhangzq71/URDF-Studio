import assert from 'node:assert/strict';
import test from 'node:test';

import { buildViewerLoadingHudState } from './viewerLoadingHud';

test('buildViewerLoadingHudState prefers normalized resource counts when available', () => {
  assert.deepEqual(
    buildViewerLoadingHudState({
      loadedCount: 3,
      totalCount: 8,
      fallbackDetail: 'Preparing scene…',
    }),
    {
      detail: '3 / 8',
      progress: 0.375,
      statusLabel: '3 / 8',
    },
  );
});

test('buildViewerLoadingHudState falls back to a clamped percent when resource counts are unavailable', () => {
  assert.deepEqual(
    buildViewerLoadingHudState({
      progressPercent: 160,
      fallbackDetail: 'Preparing scene…',
    }),
    {
      detail: '100%',
      progress: 1,
      statusLabel: '100%',
    },
  );
});

test('buildViewerLoadingHudState keeps the fallback detail when no determinate progress is available', () => {
  assert.deepEqual(
    buildViewerLoadingHudState({
      loadedCount: 0,
      totalCount: 0,
      fallbackDetail: 'Preparing scene…',
    }),
    {
      detail: 'Preparing scene…',
      progress: null,
      statusLabel: null,
    },
  );
});
