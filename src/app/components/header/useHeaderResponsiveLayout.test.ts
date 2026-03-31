import assert from 'node:assert/strict';
import test from 'node:test';

import { getHeaderResponsiveLayout } from './useHeaderResponsiveLayout.ts';

test('keeps the original compact desktop behavior when optional header actions are present', () => {
  const layout = getHeaderResponsiveLayout(1024, {
    hasQuickAction: true,
    hasSecondaryAction: true,
  });

  assert.equal(layout.showMenuLabels, false);
  assert.equal(layout.showSourceInline, false);
  assert.equal(layout.showUndoRedoInline, false);
  assert.equal(layout.showDesktopOverflow, true);
});

test('reclaims unused header action space so desktop controls stay inline longer', () => {
  const layout = getHeaderResponsiveLayout(1024, {
    hasQuickAction: false,
    hasSecondaryAction: false,
  });

  assert.equal(layout.showMenuLabels, true);
  assert.equal(layout.showSourceInline, true);
  assert.equal(layout.showSourceText, false);
  assert.equal(layout.showUndoRedoInline, false);
  assert.equal(layout.showDesktopOverflow, true);
});

test('shows the full desktop inline control set earlier when optional actions are absent', () => {
  const layout = getHeaderResponsiveLayout(1240, {
    hasQuickAction: false,
    hasSecondaryAction: false,
  });

  assert.equal(layout.showMenuLabels, true);
  assert.equal(layout.showSourceInline, true);
  assert.equal(layout.showSourceText, true);
  assert.equal(layout.showUndoRedoInline, true);
  assert.equal(layout.showDesktopOverflow, false);
});
