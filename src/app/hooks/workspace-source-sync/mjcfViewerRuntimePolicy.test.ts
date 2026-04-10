import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveStandaloneViewerContent,
  resolveStandaloneViewerSourceFormat,
} from './mjcfViewerRuntimePolicy';

test('resolveStandaloneViewerSourceFormat keeps standalone MJCF files on the MJCF runtime path', () => {
  assert.equal(resolveStandaloneViewerSourceFormat('mjcf'), 'mjcf');
});

test('resolveStandaloneViewerContent keeps standalone MJCF viewer reloads pinned to the MJCF source', () => {
  assert.equal(
    resolveStandaloneViewerContent({
      selectedFileFormat: 'mjcf',
      selectedFileContent: '<mujoco model="original" />',
      resolvedMjcfSourceContent: '<mujoco model="resolved" />',
      viewerUrdfContent: '<robot name="fallback" />',
      viewerGeneratedUrdfContent: '<robot name="generated" />',
      isSelectedUsdHydrating: false,
    }),
    '<mujoco model="resolved" />',
  );
});

test('resolveStandaloneViewerContent still uses hydrated USD content while a USD source is loading', () => {
  assert.equal(
    resolveStandaloneViewerContent({
      selectedFileFormat: 'usd',
      selectedFileContent: '#usda 1.0',
      resolvedMjcfSourceContent: '<mujoco />',
      viewerUrdfContent: '<robot />',
      viewerGeneratedUrdfContent: '<robot name="generated" />',
      isSelectedUsdHydrating: true,
    }),
    '#usda 1.0',
  );
});
