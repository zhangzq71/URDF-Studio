/**
 * @typedef {import('./types').HeaderViewConfig} HeaderViewConfig
 * @typedef {'showToolbar' | 'showOptionsPanel' | 'showVisualizerOptionsPanel' | 'showJointPanel'} ViewConfigKey
 */

/**
 * View menu entries are treated as "show/open" actions.
 * Floating panels can still be closed from their own close buttons, which avoids
 * the current UX trap where clicking an already-checked label immediately hides it.
 *
 * @param {HeaderViewConfig} current
 * @param {ViewConfigKey} key
 * @returns {HeaderViewConfig}
 */
export function ensureViewPanelVisible(current, key) {
  if (current[key]) {
    return current;
  }

  return {
    ...current,
    [key]: true,
  };
}

/**
 * In the merged-mode workspace, view options are no longer scene-specific.
 * Opening the options entry should expose both the viewer and visualizer
 * option panels so the user never needs to think about which runtime owns
 * the current canvas.
 *
 * @param {HeaderViewConfig} current
 * @returns {HeaderViewConfig}
 */
export function ensureOptionsPanelsVisible(current) {
  if (current.showOptionsPanel && current.showVisualizerOptionsPanel) {
    return current;
  }

  return {
    ...current,
    showOptionsPanel: true,
    showVisualizerOptionsPanel: true,
  };
}
