import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureUnifiedViewerOptionsVisibility,
  shouldRestoreUnifiedViewerOptionsPanel,
} from './unifiedViewerOptionsRestore';

test('captureUnifiedViewerOptionsVisibility snapshots both panel visibilities', () => {
  assert.deepEqual(
    captureUnifiedViewerOptionsVisibility({
      showViewerOptions: true,
      showVisualizerOptions: false,
    }),
    {
      viewer: true,
      visualizer: false,
    },
  );
});

test('shouldRestoreUnifiedViewerOptionsPanel restores only panels that were open at pointer down', () => {
  assert.equal(
    shouldRestoreUnifiedViewerOptionsPanel({
      wasVisibleAtPointerDown: true,
      isVisibleNow: false,
      hasRestoreHandler: true,
    }),
    true,
  );
});

test('shouldRestoreUnifiedViewerOptionsPanel skips closed or unmanaged panels', () => {
  assert.equal(
    shouldRestoreUnifiedViewerOptionsPanel({
      wasVisibleAtPointerDown: false,
      isVisibleNow: false,
      hasRestoreHandler: true,
    }),
    false,
  );
  assert.equal(
    shouldRestoreUnifiedViewerOptionsPanel({
      wasVisibleAtPointerDown: true,
      isVisibleNow: true,
      hasRestoreHandler: true,
    }),
    false,
  );
  assert.equal(
    shouldRestoreUnifiedViewerOptionsPanel({
      wasVisibleAtPointerDown: true,
      isVisibleNow: false,
      hasRestoreHandler: false,
    }),
    false,
  );
});
