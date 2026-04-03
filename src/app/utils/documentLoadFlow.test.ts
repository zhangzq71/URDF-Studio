import assert from 'node:assert/strict';
import test from 'node:test';

import {
  preserveDocumentLoadProgressForSameFile,
  shouldCommitResolvedRobotSelection,
  shouldIgnoreViewerLoadRegressionAfterReadySameFile,
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

test('preserveDocumentLoadProgressForSameFile keeps advanced same-file USD progress from regressing back to checking-path', () => {
  assert.deepEqual(
    preserveDocumentLoadProgressForSameFile({
      currentState: {
        status: 'loading',
        fileName: 'robots/unitree/g1.usda',
        format: 'usd',
        phase: 'finalizing-scene',
        message: null,
        progressPercent: 96,
        loadedCount: null,
        totalCount: null,
      },
      nextState: {
        status: 'loading',
        fileName: 'robots/unitree/g1.usda',
        format: 'usd',
        phase: 'checking-path',
        message: null,
        progressPercent: null,
        loadedCount: null,
        totalCount: null,
      },
    }),
    {
      status: 'loading',
      fileName: 'robots/unitree/g1.usda',
      format: 'usd',
      phase: 'finalizing-scene',
      message: null,
      progressPercent: 96,
      loadedCount: null,
      totalCount: null,
    },
  );
});

test('preserveDocumentLoadProgressForSameFile leaves unrelated files unchanged', () => {
  assert.deepEqual(
    preserveDocumentLoadProgressForSameFile({
      currentState: {
        status: 'loading',
        fileName: 'robots/unitree/g1.usda',
        format: 'usd',
        phase: 'finalizing-scene',
        message: null,
        progressPercent: 96,
        loadedCount: null,
        totalCount: null,
      },
      nextState: {
        status: 'loading',
        fileName: 'robots/unitree/h1.usda',
        format: 'usd',
        phase: 'checking-path',
        message: null,
        progressPercent: null,
        loadedCount: null,
        totalCount: null,
      },
    }),
    {
      status: 'loading',
      fileName: 'robots/unitree/h1.usda',
      format: 'usd',
      phase: 'checking-path',
      message: null,
      progressPercent: null,
      loadedCount: null,
      totalCount: null,
    },
  );
});

test('shouldIgnoreViewerLoadRegressionAfterReadySameFile ignores hidden same-file viewer reload progress after ready', () => {
  assert.equal(
    shouldIgnoreViewerLoadRegressionAfterReadySameFile({
      currentState: {
        status: 'ready',
        fileName: 'robots/unitree/g1.usda',
        format: 'usd',
        phase: 'ready',
        message: null,
        progressPercent: 100,
        loadedCount: null,
        totalCount: null,
      },
      nextState: {
        status: 'loading',
        fileName: 'robots/unitree/g1.usda',
        format: 'usd',
        phase: 'checking-path',
        message: null,
        progressPercent: 0,
        loadedCount: null,
        totalCount: null,
      },
    }),
    true,
  );

  assert.equal(
    shouldIgnoreViewerLoadRegressionAfterReadySameFile({
      currentState: {
        status: 'ready',
        fileName: 'robots/unitree/g1.usda',
        format: 'usd',
        phase: 'ready',
        message: null,
        progressPercent: 100,
        loadedCount: null,
        totalCount: null,
      },
      nextState: {
        status: 'loading',
        fileName: 'robots/unitree/h1.usda',
        format: 'usd',
        phase: 'checking-path',
        message: null,
        progressPercent: 0,
        loadedCount: null,
        totalCount: null,
      },
    }),
    false,
  );
});
