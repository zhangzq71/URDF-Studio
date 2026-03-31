import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldCommitResolvedRobotSelection,
  shouldIgnoreStaleViewerDocumentLoadEvent,
} from './documentLoadFlow.ts';

test('shouldCommitResolvedRobotSelection only commits once import data can preserve the current viewport', () => {
  assert.equal(
    shouldCommitResolvedRobotSelection({
      status: 'ready',
    }),
    true,
  );

  assert.equal(
    shouldCommitResolvedRobotSelection({
      status: 'needs_hydration',
    }),
    true,
  );

  assert.equal(
    shouldCommitResolvedRobotSelection({
      status: 'error',
      reason: 'source_only_fragment',
    }),
    true,
  );

  assert.equal(
    shouldCommitResolvedRobotSelection({
      status: 'error',
      reason: 'parse_failed',
    }),
    false,
  );
});

test('shouldIgnoreStaleViewerDocumentLoadEvent ignores old scene progress while a different file is staged', () => {
  assert.equal(
    shouldIgnoreStaleViewerDocumentLoadEvent({
      isPreviewing: false,
      activeDocumentFileName: 'robots/current.urdf',
      documentLoadState: {
        status: 'loading',
        fileName: 'robots/next.urdf',
      },
    }),
    true,
  );

  assert.equal(
    shouldIgnoreStaleViewerDocumentLoadEvent({
      isPreviewing: false,
      activeDocumentFileName: 'robots/current.urdf',
      documentLoadState: {
        status: 'hydrating',
        fileName: 'robots/next.usd',
      },
    }),
    true,
  );

  assert.equal(
    shouldIgnoreStaleViewerDocumentLoadEvent({
      isPreviewing: false,
      activeDocumentFileName: 'robots/current.urdf',
      documentLoadState: {
        status: 'loading',
        fileName: 'robots/current.urdf',
      },
    }),
    false,
  );

  assert.equal(
    shouldIgnoreStaleViewerDocumentLoadEvent({
      isPreviewing: true,
      activeDocumentFileName: 'robots/current.urdf',
      documentLoadState: {
        status: 'loading',
        fileName: 'robots/next.urdf',
      },
    }),
    false,
  );

  assert.equal(
    shouldIgnoreStaleViewerDocumentLoadEvent({
      isPreviewing: false,
      activeDocumentFileName: null,
      documentLoadState: {
        status: 'loading',
        fileName: 'robots/next.urdf',
      },
    }),
    false,
  );

  assert.equal(
    shouldIgnoreStaleViewerDocumentLoadEvent({
      isPreviewing: false,
      activeDocumentFileName: 'robots/current.urdf',
      documentLoadState: {
        status: 'ready',
        fileName: 'robots/next.urdf',
      },
    }),
    false,
  );
});
