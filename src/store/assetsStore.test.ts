import test from 'node:test';
import assert from 'node:assert/strict';

import { useAssetsStore } from './assetsStore.ts';

function createUsdSceneSnapshot(stageSourcePath: string) {
  return {
    stageSourcePath,
    render: {
      meshDescriptors: [],
    },
  };
}

function createPreparedUsdExportCache(stageSourcePath: string) {
  return {
    stageSourcePath,
    robotData: {
      name: 'prepared_robot',
      rootLinkId: 'base_link',
      links: {},
      joints: {},
    },
    meshFiles: {},
  };
}

function resetAssetsStore() {
  const state = useAssetsStore.getState();
  state.clearAssets();
  state.clearRobotLibrary();
  state.clearUsdSceneSnapshots();
  state.clearUsdPreparedExportCaches();
  state.setAvailableFiles([]);
  state.setSelectedFile(null);
  state.resetDocumentLoadState();
  state.setAllFileContents({});
  state.setOriginalUrdfContent('');
  state.setOriginalFileFormat(null);
}

test('removeRobotFile clears matching USD scene snapshot cache', () => {
  resetAssetsStore();

  const state = useAssetsStore.getState();
  state.setAvailableFiles([
    {
      name: 'robots/demo/demo.usd',
      content: '',
      format: 'usd',
    },
  ]);

  state.setUsdSceneSnapshot('/robots/demo/demo.usd', createUsdSceneSnapshot('/robots/demo/demo.usd'));
  assert.ok(state.getUsdSceneSnapshot('robots/demo/demo.usd'));

  state.removeRobotFile('robots/demo/demo.usd');

  assert.equal(useAssetsStore.getState().getUsdSceneSnapshot('robots/demo/demo.usd'), null);
});

test('clearRobotLibrary clears all USD scene snapshot caches', () => {
  resetAssetsStore();

  const state = useAssetsStore.getState();
  state.setAvailableFiles([
    {
      name: 'robots/demo/demo.usd',
      content: '',
      format: 'usd',
    },
    {
      name: 'robots/alt/alt.usd',
      content: '',
      format: 'usd',
    },
  ]);

  state.setUsdSceneSnapshot('/robots/demo/demo.usd', createUsdSceneSnapshot('/robots/demo/demo.usd'));
  state.setUsdSceneSnapshot('/robots/alt/alt.usd', createUsdSceneSnapshot('/robots/alt/alt.usd'));

  assert.ok(state.getUsdSceneSnapshot('robots/demo/demo.usd'));
  assert.ok(state.getUsdSceneSnapshot('robots/alt/alt.usd'));

  state.clearRobotLibrary();

  assert.equal(useAssetsStore.getState().getUsdSceneSnapshot('robots/demo/demo.usd'), null);
  assert.equal(useAssetsStore.getState().getUsdSceneSnapshot('robots/alt/alt.usd'), null);
});

test('removeRobotFile clears matching prepared USD export cache', () => {
  resetAssetsStore();

  const state = useAssetsStore.getState();
  state.setAvailableFiles([
    {
      name: 'robots/demo/demo.usd',
      content: '',
      format: 'usd',
    },
  ]);

  state.setUsdPreparedExportCache('/robots/demo/demo.usd', createPreparedUsdExportCache('/robots/demo/demo.usd'));
  assert.ok(state.getUsdPreparedExportCache('robots/demo/demo.usd'));

  state.removeRobotFile('robots/demo/demo.usd');

  assert.equal(useAssetsStore.getState().getUsdPreparedExportCache('robots/demo/demo.usd'), null);
});

test('clearRobotLibrary clears all prepared USD export caches', () => {
  resetAssetsStore();

  const state = useAssetsStore.getState();
  state.setAvailableFiles([
    {
      name: 'robots/demo/demo.usd',
      content: '',
      format: 'usd',
    },
    {
      name: 'robots/alt/alt.usd',
      content: '',
      format: 'usd',
    },
  ]);

  state.setUsdPreparedExportCache('/robots/demo/demo.usd', createPreparedUsdExportCache('/robots/demo/demo.usd'));
  state.setUsdPreparedExportCache('/robots/alt/alt.usd', createPreparedUsdExportCache('/robots/alt/alt.usd'));

  assert.ok(state.getUsdPreparedExportCache('robots/demo/demo.usd'));
  assert.ok(state.getUsdPreparedExportCache('robots/alt/alt.usd'));

  state.clearRobotLibrary();

  assert.equal(useAssetsStore.getState().getUsdPreparedExportCache('robots/demo/demo.usd'), null);
  assert.equal(useAssetsStore.getState().getUsdPreparedExportCache('robots/alt/alt.usd'), null);
});

test('removeRobotFile resets document load state for the removed file', () => {
  resetAssetsStore();

  const state = useAssetsStore.getState();
  state.setAvailableFiles([
    {
      name: 'robots/demo/demo.usd',
      content: '',
      format: 'usd',
    },
  ]);
  state.setSelectedFile({
    name: 'robots/demo/demo.usd',
    content: '',
    format: 'usd',
  });
  state.setDocumentLoadState({
    status: 'hydrating',
    fileName: 'robots/demo/demo.usd',
    format: 'usd',
    error: null,
  });

  state.removeRobotFile('robots/demo/demo.usd');

  assert.deepEqual(useAssetsStore.getState().documentLoadState, {
    status: 'idle',
    fileName: null,
    format: null,
    error: null,
  });
});

test('setSelectedFile null resets document load state', () => {
  resetAssetsStore();

  const state = useAssetsStore.getState();
  state.setSelectedFile({
    name: 'robots/demo/demo.usd',
    content: '',
    format: 'usd',
  });
  state.setDocumentLoadState({
    status: 'ready',
    fileName: 'robots/demo/demo.usd',
    format: 'usd',
    error: null,
  });

  state.setSelectedFile(null);

  assert.deepEqual(useAssetsStore.getState().documentLoadState, {
    status: 'idle',
    fileName: null,
    format: null,
    error: null,
  });
});
