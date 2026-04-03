import test from 'node:test';
import assert from 'node:assert/strict';

import type { DocumentLoadState } from '@/store/assetsStore';
import {
  isViewerDocumentLoadingForScope,
  shouldKeepExistingViewerViewportHandoff,
  shouldContinueViewerViewportHandoff,
  shouldStartViewerViewportHandoff,
} from './viewerViewportHandoff';

function createDocumentLoadState(overrides: Partial<DocumentLoadState> = {}): DocumentLoadState {
  return {
    status: 'idle',
    fileName: null,
    format: null,
    error: null,
    ...overrides,
  };
}

test('isViewerDocumentLoadingForScope tolerates path-shape differences', () => {
  assert.equal(
    isViewerDocumentLoadingForScope(
      'anybotics_anymal_c/scene.xml',
      createDocumentLoadState({
        status: 'loading',
        fileName: 'scene.xml',
      }),
    ),
    true,
  );

  assert.equal(
    isViewerDocumentLoadingForScope(
      'anybotics_anymal_c/scene.xml',
      createDocumentLoadState({
        status: 'ready',
        fileName: 'scene.xml',
      }),
    ),
    false,
  );
});

test('shouldStartViewerViewportHandoff starts for viewer entry and fresh viewer reloads', () => {
  assert.equal(shouldStartViewerViewportHandoff({
    wasViewerMode: false,
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    viewerSceneReady: false,
    hasPendingHandoffForScope: false,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: 'g1_description/g1_29dof.urdf',
      format: 'urdf',
    }),
  }), true);

  assert.equal(shouldStartViewerViewportHandoff({
    wasViewerMode: true,
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    viewerSceneReady: true,
    hasPendingHandoffForScope: false,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: 'g1_description/g1_29dof.urdf',
      format: 'urdf',
    }),
  }), true);

  assert.equal(shouldStartViewerViewportHandoff({
    wasViewerMode: true,
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    viewerSceneReady: false,
    hasPendingHandoffForScope: false,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: 'g1_description/g1_29dof.urdf',
      format: 'urdf',
    }),
  }), false);

  assert.equal(shouldStartViewerViewportHandoff({
    wasViewerMode: true,
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    viewerSceneReady: true,
    hasPendingHandoffForScope: true,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: 'g1_description/g1_29dof.urdf',
      format: 'urdf',
    }),
  }), false);

  assert.equal(shouldStartViewerViewportHandoff({
    wasViewerMode: false,
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    viewerSceneReady: false,
    hasPendingHandoffForScope: false,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'ready',
      fileName: 'g1_description/g1_29dof.urdf',
      format: 'urdf',
    }),
  }), true);
});

test('shouldContinueViewerViewportHandoff clears once the active document stops loading', () => {
  assert.equal(shouldContinueViewerViewportHandoff({
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'hydrating',
      fileName: 'g1_description/g1_29dof.urdf',
      format: 'usd',
    }),
  }), true);

  assert.equal(shouldContinueViewerViewportHandoff({
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'error',
      fileName: 'g1_description/g1_29dof.urdf',
      format: 'urdf',
      error: 'failed',
    }),
  }), false);

  assert.equal(shouldContinueViewerViewportHandoff({
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: 'g1_description/g1_dual_arm.urdf',
      format: 'urdf',
    }),
  }), false);

  assert.equal(shouldContinueViewerViewportHandoff({
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: 'g1_29dof.urdf',
      format: 'urdf',
    }),
  }), true);

  assert.equal(shouldContinueViewerViewportHandoff({
    isViewerMode: true,
    isPreviewing: false,
    visualizerMounted: true,
    activeFileName: 'g1_description/g1_29dof.urdf',
    documentLoadState: createDocumentLoadState({
      status: 'loading',
      fileName: null,
      format: 'urdf',
    }),
  }), true);
});

test('shouldKeepExistingViewerViewportHandoff only extends an already-started handoff', () => {
  assert.equal(shouldKeepExistingViewerViewportHandoff({
    startHandoff: true,
    continueHandoff: false,
    hasPendingHandoffForScope: false,
  }), true);

  assert.equal(shouldKeepExistingViewerViewportHandoff({
    startHandoff: false,
    continueHandoff: true,
    hasPendingHandoffForScope: true,
  }), true);

  assert.equal(shouldKeepExistingViewerViewportHandoff({
    startHandoff: false,
    continueHandoff: true,
    hasPendingHandoffForScope: false,
  }), false);
});
