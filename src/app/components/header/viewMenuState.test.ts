import assert from 'node:assert/strict';
import test from 'node:test';

import { setOptionsPanelVisibility, toggleOptionsPanel, toggleViewPanel } from './viewMenuState.js';

test('toggleViewPanel marks a single panel as visible without changing other fields', () => {
  const next = toggleViewPanel(
    {
      showToolbar: false,
      showOptionsPanel: false,
      showJointPanel: false,
    },
    'showToolbar',
  );

  assert.deepEqual(next, {
    showToolbar: true,
    showOptionsPanel: false,
    showJointPanel: false,
  });
});

test('toggleOptionsPanel opens the unified options panel', () => {
  const next = toggleOptionsPanel({
    showToolbar: false,
    showOptionsPanel: false,
    showJointPanel: false,
  });

  assert.deepEqual(next, {
    showToolbar: false,
    showOptionsPanel: true,
    showJointPanel: false,
  });
});

test('toggleOptionsPanel closes the unified options panel when it is visible', () => {
  const current = {
    showToolbar: true,
    showOptionsPanel: true,
    showJointPanel: false,
  };

  assert.deepEqual(toggleOptionsPanel(current), {
    showToolbar: true,
    showOptionsPanel: false,
    showJointPanel: false,
  });
});

test('setOptionsPanelVisibility updates the unified options panel without touching other fields', () => {
  const current = {
    showToolbar: true,
    showOptionsPanel: false,
    showJointPanel: true,
  };

  assert.deepEqual(setOptionsPanelVisibility(current, false), {
    showToolbar: true,
    showOptionsPanel: false,
    showJointPanel: true,
  });
});
