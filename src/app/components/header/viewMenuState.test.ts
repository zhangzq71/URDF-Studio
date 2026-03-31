import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureOptionsPanelsVisible,
  ensureViewPanelVisible,
} from './viewMenuState.js';

test('ensureViewPanelVisible marks a single panel as visible without changing other fields', () => {
  const next = ensureViewPanelVisible({
    showToolbar: false,
    showOptionsPanel: false,
    showVisualizerOptionsPanel: false,
    showJointPanel: false,
  }, 'showToolbar');

  assert.deepEqual(next, {
    showToolbar: true,
    showOptionsPanel: false,
    showVisualizerOptionsPanel: false,
    showJointPanel: false,
  });
});

test('ensureOptionsPanelsVisible opens both viewer and visualizer options together', () => {
  const next = ensureOptionsPanelsVisible({
    showToolbar: false,
    showOptionsPanel: false,
    showVisualizerOptionsPanel: false,
    showJointPanel: false,
  });

  assert.deepEqual(next, {
    showToolbar: false,
    showOptionsPanel: true,
    showVisualizerOptionsPanel: true,
    showJointPanel: false,
  });
});

test('ensureOptionsPanelsVisible is idempotent when both panels are already visible', () => {
  const current = {
    showToolbar: true,
    showOptionsPanel: true,
    showVisualizerOptionsPanel: true,
    showJointPanel: false,
  };

  assert.equal(ensureOptionsPanelsVisible(current), current);
});
