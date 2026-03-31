import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveUnifiedViewerHandoffReadyState } from './unifiedViewerHandoffReadyState';

test('resolveUnifiedViewerHandoffReadyState resets to ready outside viewer handoff conditions', () => {
  assert.deepEqual(
    resolveUnifiedViewerHandoffReadyState({
      isViewerMode: false,
      isPreviewing: false,
      visualizerAvailableForViewportHandoff: true,
      viewerLoadScopeKey: 'robot.urdf:1',
      pendingViewerLoadScopeKey: 'robot.urdf:1',
      releasedViewerLoadScopeKey: null,
      startViewerViewportHandoff: false,
      continueViewerViewportHandoff: false,
      keepExistingViewerViewportHandoff: false,
      hasPendingViewerHandoffForScope: true,
    }),
    {
      pendingViewerLoadScopeKey: null,
      viewerSceneReady: true,
    },
  );
});

test('resolveUnifiedViewerHandoffReadyState starts a new pending handoff scope', () => {
  assert.deepEqual(
    resolveUnifiedViewerHandoffReadyState({
      isViewerMode: true,
      isPreviewing: false,
      visualizerAvailableForViewportHandoff: true,
      viewerLoadScopeKey: 'robot.urdf:2',
      pendingViewerLoadScopeKey: null,
      releasedViewerLoadScopeKey: null,
      startViewerViewportHandoff: true,
      continueViewerViewportHandoff: false,
      keepExistingViewerViewportHandoff: true,
      hasPendingViewerHandoffForScope: false,
    }),
    {
      pendingViewerLoadScopeKey: 'robot.urdf:2',
      viewerSceneReady: false,
    },
  );
});

test('resolveUnifiedViewerHandoffReadyState preserves an in-flight pending scope', () => {
  assert.deepEqual(
    resolveUnifiedViewerHandoffReadyState({
      isViewerMode: true,
      isPreviewing: false,
      visualizerAvailableForViewportHandoff: true,
      viewerLoadScopeKey: 'robot.urdf:3',
      pendingViewerLoadScopeKey: 'robot.urdf:3',
      releasedViewerLoadScopeKey: null,
      startViewerViewportHandoff: false,
      continueViewerViewportHandoff: true,
      keepExistingViewerViewportHandoff: true,
      hasPendingViewerHandoffForScope: true,
    }),
    {
      pendingViewerLoadScopeKey: 'robot.urdf:3',
      viewerSceneReady: false,
    },
  );
});

test('resolveUnifiedViewerHandoffReadyState clears pending scope once released scope matches', () => {
  assert.deepEqual(
    resolveUnifiedViewerHandoffReadyState({
      isViewerMode: true,
      isPreviewing: false,
      visualizerAvailableForViewportHandoff: true,
      viewerLoadScopeKey: 'robot.urdf:4',
      pendingViewerLoadScopeKey: 'robot.urdf:4',
      releasedViewerLoadScopeKey: 'robot.urdf:4',
      startViewerViewportHandoff: false,
      continueViewerViewportHandoff: false,
      keepExistingViewerViewportHandoff: false,
      hasPendingViewerHandoffForScope: true,
    }),
    {
      pendingViewerLoadScopeKey: null,
      viewerSceneReady: true,
    },
  );
});

test('resolveUnifiedViewerHandoffReadyState keeps viewer blocked when a pending scope remains unresolved', () => {
  assert.deepEqual(
    resolveUnifiedViewerHandoffReadyState({
      isViewerMode: true,
      isPreviewing: false,
      visualizerAvailableForViewportHandoff: true,
      viewerLoadScopeKey: 'robot.urdf:5',
      pendingViewerLoadScopeKey: 'robot.urdf:5',
      releasedViewerLoadScopeKey: null,
      startViewerViewportHandoff: false,
      continueViewerViewportHandoff: false,
      keepExistingViewerViewportHandoff: false,
      hasPendingViewerHandoffForScope: true,
    }),
    {
      pendingViewerLoadScopeKey: 'robot.urdf:5',
      viewerSceneReady: false,
    },
  );
});
