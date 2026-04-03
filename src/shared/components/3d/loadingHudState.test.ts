import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLoadingHudState,
  shouldUseIndeterminateStreamingMeshProgress,
} from './loadingHudState.ts';

test('shouldUseIndeterminateStreamingMeshProgress only treats zero-of-total mesh streaming as indeterminate', () => {
  assert.equal(shouldUseIndeterminateStreamingMeshProgress({
    phase: 'streaming-meshes',
    loadedCount: 0,
    totalCount: 41,
  }), true);

  assert.equal(shouldUseIndeterminateStreamingMeshProgress({
    phase: 'streaming-meshes',
    loadedCount: 1,
    totalCount: 41,
  }), false);

  assert.equal(shouldUseIndeterminateStreamingMeshProgress({
    phase: 'preparing-scene',
    loadedCount: 0,
    totalCount: 41,
  }), false);
});

test('buildLoadingHudState falls back to detail text for indeterminate streaming warmup', () => {
  const loadingHudState = buildLoadingHudState({
    loadedCount: null,
    totalCount: null,
    progressPercent: null,
    fallbackDetail: 'Parsing initial mesh batch...',
  });

  assert.deepEqual(loadingHudState, {
    detail: 'Parsing initial mesh batch...',
    progress: null,
    statusLabel: null,
  });
});
