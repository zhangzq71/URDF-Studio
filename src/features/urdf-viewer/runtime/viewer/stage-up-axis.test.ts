import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractStageUpAxisFromLayerText,
  resolveAxisAlignmentRotationX,
  resolveStageUpAxis,
} from './stage-up-axis.js';

test('extracts up-axis from authored USD root-layer metadata', () => {
  assert.equal(
    extractStageUpAxisFromLayerText(`#usda 1.0
(
    upAxis = "Z"
)
`),
    'z',
  );
  assert.equal(
    extractStageUpAxisFromLayerText(`#usda 1.0
(
    upAxis = "Y"
)
`),
    'y',
  );
});

test('prefers reported stage metadata before parsing layer text', () => {
  assert.equal(
    resolveStageUpAxis({
      reportedUpAxis: 'z',
      stage: {
        GetRootLayer: () => ({
          ExportToString: () => '#usda 1.0\n(\n    upAxis = "Y"\n)\n',
        }),
      },
      fallbackUpAxis: 'y',
    }),
    'z',
  );
});

test('falls back to root-layer metadata when reported up-axis is missing', () => {
  assert.equal(
    resolveStageUpAxis({
      reportedUpAxis: null,
      stage: {
        GetRootLayer: () => ({
          ExportToString: () => '#usda 1.0\n(\n    upAxis = "Z"\n)\n',
        }),
      },
      fallbackUpAxis: 'y',
    }),
    'z',
  );
});

test('uses fallback axis when neither metadata source is available', () => {
  assert.equal(
    resolveStageUpAxis({
      reportedUpAxis: null,
      stage: null,
      fallbackUpAxis: 'y',
    }),
    'y',
  );
});

test('defaults to y-axis fallback when no metadata source is available', () => {
  assert.equal(
    resolveStageUpAxis({
      reportedUpAxis: null,
      stage: null,
    }),
    'y',
  );
});

test('falls back to y-axis when no explicit up-axis metadata exists and fallback is null', () => {
  assert.equal(
    resolveStageUpAxis({
      reportedUpAxis: null,
      stage: null,
      fallbackUpAxis: null,
    }),
    'y',
  );
});

test('computes generic source->target up-axis alignment rotations', () => {
  assert.equal(
    resolveAxisAlignmentRotationX({ sourceUpAxis: 'z', targetUpAxis: 'z' }),
    0,
  );
  assert.equal(
    resolveAxisAlignmentRotationX({ sourceUpAxis: 'y', targetUpAxis: 'z' }),
    Math.PI / 2,
  );
  assert.equal(
    resolveAxisAlignmentRotationX({ sourceUpAxis: 'z', targetUpAxis: 'y' }),
    -Math.PI / 2,
  );
});
