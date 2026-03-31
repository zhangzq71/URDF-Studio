import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialUnifiedViewerMountState,
  resolveUnifiedViewerMountState,
  resolveUnifiedViewerSessionState,
} from './unifiedViewerMountState.ts';

test('starts with only the visualizer mounted when appMode is `skeleton`', () => {
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

test('keeps the viewer mounted after visiting `detail` and switching back to `skeleton`', () => {
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

test('treats a forced viewer session as viewer mode even when appMode stays `skeleton`', () => {
  assert.deepEqual(
    resolveUnifiedViewerSessionState({
      mode: 'skeleton',
      forceViewerSession: true,
    }),
    {
      activePreview: undefined,
      isPreviewing: false,
      isViewerMode: true,
      viewerSceneMode: 'detail',
    },
  );
});

test('keeps both scenes mounted when a skeleton session forces the viewer open', () => {
  const initialState = createInitialUnifiedViewerMountState({
    mode: 'skeleton',
    isPreviewing: false,
  });

  assert.deepEqual(
    resolveUnifiedViewerMountState(initialState, {
      mode: 'skeleton',
      isPreviewing: false,
      forceViewerSession: true,
    }),
    {
      viewerMounted: true,
      visualizerMounted: true,
    },
  );
});

test('keeps file preview active even when appMode is `skeleton`', () => {
  const preview = {
    urdfContent: '<robot name="preview" />',
    fileName: 'preview/demo.urdf',
  };

  assert.deepEqual(
    resolveUnifiedViewerSessionState({
      mode: 'skeleton',
      filePreview: preview,
    }),
    {
      activePreview: preview,
      isPreviewing: true,
      isViewerMode: true,
      viewerSceneMode: 'detail',
    },
  );
});
