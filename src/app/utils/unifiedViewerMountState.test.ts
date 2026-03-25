import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialUnifiedViewerMountState,
  resolveUnifiedViewerMountState,
} from './unifiedViewerMountState.ts';

test('starts with only the visualizer mounted in skeleton mode', () => {
  assert.deepEqual(
    createInitialUnifiedViewerMountState({
      mode: 'skeleton',
      isPreviewing: false,
    }),
    {
      viewerMounted: false,
      visualizerMounted: true,
    },
  );
});

test('keeps the viewer mounted after visiting detail mode and switching back to skeleton', () => {
  const initialState = createInitialUnifiedViewerMountState({
    mode: 'skeleton',
    isPreviewing: false,
  });
  const detailState = resolveUnifiedViewerMountState(initialState, {
    mode: 'detail',
    isPreviewing: false,
  });
  const backToSkeleton = resolveUnifiedViewerMountState(detailState, {
    mode: 'skeleton',
    isPreviewing: false,
  });

  assert.deepEqual(detailState, {
    viewerMounted: true,
    visualizerMounted: true,
  });
  assert.deepEqual(backToSkeleton, {
    viewerMounted: true,
    visualizerMounted: true,
  });
});

test('treats standalone file preview as a viewer session for keep-alive purposes', () => {
  const initialState = createInitialUnifiedViewerMountState({
    mode: 'skeleton',
    isPreviewing: false,
  });

  assert.deepEqual(
    resolveUnifiedViewerMountState(initialState, {
      mode: 'skeleton',
      isPreviewing: true,
    }),
    {
      viewerMounted: true,
      visualizerMounted: true,
    },
  );
});
