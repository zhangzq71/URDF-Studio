import test from 'node:test';
import assert from 'node:assert/strict';

import type { RobotFile } from '@/types';
import {
  clearPreparedUsdStageOpenCache,
  loadPreparedUsdStageOpenDataFromWorker,
  loadPreparedUsdStageOpenDataCached,
} from './preparedUsdStageOpenCache.ts';

const demoSourceFile: Pick<RobotFile, 'name' | 'content' | 'blobUrl'> = {
  name: 'robots/go2/usd/go2.usd',
  content: 'demo-stage',
  blobUrl: undefined,
};

const demoAvailableFiles: Array<Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>> = [{
  name: 'robots/go2/usd/go2.usd',
  content: 'demo-stage',
  blobUrl: undefined,
  format: 'usd',
}];

const demoAssets = {
  'robots/go2/usd/go2.usd': 'blob:go2-root',
};

test.afterEach(() => {
  clearPreparedUsdStageOpenCache();
});

test('loadPreparedUsdStageOpenDataCached reuses the same prepared preload payload for repeated opens', async () => {
  let loadCount = 0;
  const loader = async () => {
    loadCount += 1;
    return {
      stageSourcePath: '/robots/go2/usd/go2.usd',
      criticalDependencyPaths: ['/robots/go2/usd/configuration/go2_description_base.usd'],
      preloadFiles: [{
        path: '/robots/go2/usd/go2.usd',
        blob: new Blob(['go2-root']),
        error: null,
      }],
    };
  };

  const firstResult = await loadPreparedUsdStageOpenDataCached(
    demoSourceFile,
    demoAvailableFiles,
    demoAssets,
    loader,
  );
  const secondResult = await loadPreparedUsdStageOpenDataCached(
    demoSourceFile,
    demoAvailableFiles,
    demoAssets,
    loader,
  );

  assert.equal(loadCount, 1);
  assert.strictEqual(secondResult, firstResult);
});

test('loadPreparedUsdStageOpenDataCached drops incomplete root-stage results so a later open can retry', async () => {
  let loadCount = 0;

  const firstResult = await loadPreparedUsdStageOpenDataCached(
    demoSourceFile,
    demoAvailableFiles,
    demoAssets,
    async () => {
      loadCount += 1;
      return {
        stageSourcePath: '/robots/go2/usd/go2.usd',
        criticalDependencyPaths: [],
        preloadFiles: [{
          path: '/robots/go2/usd/go2.usd',
          blob: null,
          error: 'missing-root',
        }],
      };
    },
  );

  const secondResult = await loadPreparedUsdStageOpenDataCached(
    demoSourceFile,
    demoAvailableFiles,
    demoAssets,
    async () => {
      loadCount += 1;
      return {
        stageSourcePath: '/robots/go2/usd/go2.usd',
        criticalDependencyPaths: [],
        preloadFiles: [{
          path: '/robots/go2/usd/go2.usd',
          blob: new Blob(['go2-root']),
          error: null,
        }],
      };
    },
  );

  assert.equal(loadCount, 2);
  assert.equal(firstResult.preloadFiles[0]?.blob, null);
  assert.ok(secondResult.preloadFiles[0]?.blob instanceof Blob);
});

test('loadPreparedUsdStageOpenDataCached keeps worker-hydrated root bytes as a valid cached payload', async () => {
  let loadCount = 0;
  const rootBytes = new TextEncoder().encode('go2-root');

  const firstResult = await loadPreparedUsdStageOpenDataCached(
    demoSourceFile,
    demoAvailableFiles,
    demoAssets,
    async () => {
      loadCount += 1;
      return {
        stageSourcePath: '/robots/go2/usd/go2.usd',
        criticalDependencyPaths: [],
        preloadFiles: [{
          path: '/robots/go2/usd/go2.usd',
          blob: null,
          bytes: rootBytes,
          mimeType: 'application/octet-stream',
          error: null,
        }],
      };
    },
  );

  const secondResult = await loadPreparedUsdStageOpenDataCached(
    demoSourceFile,
    demoAvailableFiles,
    demoAssets,
    async () => {
      loadCount += 1;
      return {
        stageSourcePath: '/robots/go2/usd/go2.usd',
        criticalDependencyPaths: [],
        preloadFiles: [],
      };
    },
  );

  assert.equal(loadCount, 1);
  assert.strictEqual(secondResult, firstResult);
  assert.deepEqual(Array.from(new Uint8Array(firstResult.preloadFiles[0]!.bytes!)), Array.from(rootBytes));
});

test('loadPreparedUsdStageOpenDataCached reuses semantically identical inputs even when object references change', async () => {
  let loadCount = 0;
  const loader = async () => {
    loadCount += 1;
    return {
      stageSourcePath: '/robots/go2/usd/go2.usd',
      criticalDependencyPaths: ['/robots/go2/usd/configuration/go2_description_base.usd'],
      preloadFiles: [{
        path: '/robots/go2/usd/go2.usd',
        blob: new Blob(['go2-root']),
        error: null,
      }],
    };
  };

  const firstResult = await loadPreparedUsdStageOpenDataCached(
    demoSourceFile,
    demoAvailableFiles,
    demoAssets,
    loader,
  );
  const secondResult = await loadPreparedUsdStageOpenDataCached(
    {
      ...demoSourceFile,
    },
    demoAvailableFiles.map((file) => ({ ...file })),
    {
      ...demoAssets,
    },
    loader,
  );

  assert.equal(loadCount, 1);
  assert.strictEqual(secondResult, firstResult);
});

test('loadPreparedUsdStageOpenDataFromWorker rejects when worker preparation fails', async () => {
  let prepareCallCount = 0;

  await assert.rejects(
    loadPreparedUsdStageOpenDataFromWorker(
      demoSourceFile,
      demoAvailableFiles,
      demoAssets,
      async () => {
        prepareCallCount += 1;
        throw new Error('worker exploded');
      },
    ),
    /worker exploded/i,
  );

  assert.equal(prepareCallCount, 1);
});

test('loadPreparedUsdStageOpenDataFromWorker rejects incomplete worker payloads instead of allowing a main-thread repair path', async () => {
  let prepareCallCount = 0;

  await assert.rejects(
    loadPreparedUsdStageOpenDataFromWorker(
      demoSourceFile,
      demoAvailableFiles,
      demoAssets,
      async () => {
        prepareCallCount += 1;
        return {
          stageSourcePath: '/robots/go2/usd/go2.usd',
          criticalDependencyPaths: [],
          preloadFiles: [{
            path: '/robots/go2/usd/go2.usd',
            blob: null,
            error: 'missing-root',
          }],
        };
      },
    ),
    /returned no root stage payload/i,
  );

  assert.equal(prepareCallCount, 1);
});
