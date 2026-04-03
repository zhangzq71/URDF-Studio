import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveUnifiedViewerLoadReleaseState } from './unifiedViewerLoadReleaseState';

test('resolveUnifiedViewerLoadReleaseState clears the matching pending scope on release', () => {
  assert.deepEqual(
    resolveUnifiedViewerLoadReleaseState({
      pendingViewerLoadScopeKey: 'robot.urdf:1',
      viewerLoadScopeKey: 'robot.urdf:1',
    }),
    {
      canReleaseViewerLoadScope: true,
      pendingViewerLoadScopeKey: null,
      releasedViewerLoadScopeKey: 'robot.urdf:1',
      viewerSceneReady: true,
    },
  );
});

test('resolveUnifiedViewerLoadReleaseState releases the current scope when no pending scope exists', () => {
  assert.deepEqual(
    resolveUnifiedViewerLoadReleaseState({
      pendingViewerLoadScopeKey: null,
      viewerLoadScopeKey: 'robot.urdf:2',
    }),
    {
      canReleaseViewerLoadScope: true,
      pendingViewerLoadScopeKey: null,
      releasedViewerLoadScopeKey: 'robot.urdf:2',
      viewerSceneReady: true,
    },
  );
});

test('resolveUnifiedViewerLoadReleaseState blocks release while another scope is still pending', () => {
  assert.deepEqual(
    resolveUnifiedViewerLoadReleaseState({
      pendingViewerLoadScopeKey: 'robot.urdf:3',
      viewerLoadScopeKey: 'robot.urdf:4',
    }),
    {
      canReleaseViewerLoadScope: false,
      pendingViewerLoadScopeKey: 'robot.urdf:3',
      releasedViewerLoadScopeKey: null,
      viewerSceneReady: false,
    },
  );
});
