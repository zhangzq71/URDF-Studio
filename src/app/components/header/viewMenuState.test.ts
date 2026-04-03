import assert from 'node:assert/strict';
import test from 'node:test';

import { toggleOptionsPanels, toggleViewPanel } from './viewMenuState.js';

test('toggleViewPanel marks a single panel as visible without changing other fields', () => {
  const next = toggleViewPanel(
    {
      showToolbar: false,
      showOptionsPanel: false,
      showVisualizerOptionsPanel: false,
      showJointPanel: false,
    },
    'showToolbar',
  );

  assert.deepEqual(next, {
    showToolbar: true,
    showOptionsPanel: false,
    showVisualizerOptionsPanel: false,
    showJointPanel: false,
  });
});

test('toggleOptionsPanels opens both viewer and visualizer options together', () => {
  const next = toggleOptionsPanels({
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

test('toggleOptionsPanels closes both option panels when either is visible', () => {
  const current = {
    showToolbar: true,
    showOptionsPanel: true,
    showVisualizerOptionsPanel: true,
    showJointPanel: false,
  };

  assert.deepEqual(toggleOptionsPanels(current), {
    showToolbar: true,
    showOptionsPanel: false,
    showVisualizerOptionsPanel: false,
    showJointPanel: false,
  });
});
