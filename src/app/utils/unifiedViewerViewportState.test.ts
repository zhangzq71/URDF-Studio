import test from 'node:test';
import assert from 'node:assert/strict';

import type { DocumentLoadState } from '@/store/assetsStore';
import { resolveUnifiedViewerViewportState } from './unifiedViewerViewportState';

function createDocumentLoadState(overrides: Partial<DocumentLoadState> = {}): DocumentLoadState {
  return {
    status: 'idle',
    fileName: null,
    format: null,
    error: null,
    ...overrides,
  };
}

test('resolveUnifiedViewerViewportState follows direct viewer ownership when handoff is disabled', () => {
  const state = resolveUnifiedViewerViewportState({
    mode: 'editor',
    isViewerMode: true,
    isPreviewing: false,
    mountState: {
      viewerMounted: true,
      visualizerMounted: false,
    },
    previousIsViewerMode: true,
    viewerSceneReady: true,
    activeViewportFileName: 'robots/go2/urdf/go2.urdf',
    viewerReloadKey: 4,
    pendingViewerLoadScopeKey: null,
    releasedViewerLoadScopeKey: null,
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: 'robots/go2/urdf/go2.urdf',
      format: 'urdf',
    }),
    shouldUseVisualizerViewportHandoff: false,
  });

  assert.equal(state.activeViewerDocumentStillLoading, true);
  assert.equal(state.viewerLoadScopeKey, 'robots/go2/urdf/go2.urdf:4');
  assert.equal(state.displayVisualizerWhileViewerLoads, false);
  assert.equal(state.viewerVisible, true);
  assert.equal(state.visualizerVisible, false);
  assert.equal(state.shouldRenderViewerScene, true);
  assert.equal(state.shouldRenderVisualizerScene, false);
  assert.equal(state.activeScene, 'viewer');
  assert.equal(state.useViewerCanvasPresentation, true);
  assert.equal(state.visualizerRuntimeMode, 'editor');
});

test('resolveUnifiedViewerViewportState keeps visualizer presentation during active handoff when enabled', () => {
  const state = resolveUnifiedViewerViewportState({
    mode: 'editor',
    isViewerMode: true,
    isPreviewing: false,
    mountState: {
      viewerMounted: true,
      visualizerMounted: true,
    },
    previousIsViewerMode: false,
    viewerSceneReady: false,
    activeViewportFileName: 'robots/go2/urdf/go2.urdf',
    viewerReloadKey: 1,
    pendingViewerLoadScopeKey: null,
    releasedViewerLoadScopeKey: null,
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: 'robots/go2/urdf/go2.urdf',
      format: 'urdf',
    }),
    shouldUseVisualizerViewportHandoff: true,
  });

  assert.equal(state.startViewerViewportHandoff, true);
  assert.equal(state.keepExistingViewerViewportHandoff, true);
  assert.equal(state.displayVisualizerWhileViewerLoads, true);
  assert.equal(state.keepViewerMountedDuringHandoff, true);
  assert.equal(state.viewerVisible, false);
  assert.equal(state.visualizerVisible, true);
  assert.equal(state.shouldRenderViewerScene, true);
  assert.equal(state.shouldRenderVisualizerScene, true);
  assert.equal(state.activeScene, 'visualizer');
  assert.equal(state.useViewerCanvasPresentation, true);
  assert.equal(state.visualizerRuntimeMode, 'editor');
});

test('resolveUnifiedViewerViewportState falls back to visualizer ownership outside viewer mode', () => {
  const state = resolveUnifiedViewerViewportState({
    mode: 'editor',
    isViewerMode: false,
    isPreviewing: false,
    mountState: {
      viewerMounted: false,
      visualizerMounted: true,
    },
    previousIsViewerMode: false,
    viewerSceneReady: true,
    activeViewportFileName: null,
    viewerReloadKey: 2,
    pendingViewerLoadScopeKey: null,
    releasedViewerLoadScopeKey: null,
    documentLoadState: createDocumentLoadState(),
  });

  assert.equal(state.viewerVisible, false);
  assert.equal(state.visualizerVisible, true);
  assert.equal(state.shouldRenderViewerScene, false);
  assert.equal(state.shouldRenderVisualizerScene, true);
  assert.equal(state.activeScene, 'visualizer');
  assert.equal(state.useViewerCanvasPresentation, false);
  assert.equal(state.visualizerRuntimeMode, 'editor');
});
