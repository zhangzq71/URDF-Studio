/**
 * @typedef {import('./types').HeaderViewConfig} HeaderViewConfig
 * @typedef {'showToolbar' | 'showOptionsPanel' | 'showVisualizerOptionsPanel' | 'showJointPanel'} ViewConfigKey
 */

/**
 * Toggle visibility of a view panel.
 *
 * @param {HeaderViewConfig} current
 * @param {ViewConfigKey} key
 * @returns {HeaderViewConfig}
 */
export function toggleViewPanel(current, key) {
  return {
    ...current,
    [key]: !current[key],
  };
}

/**
 * In the merged-mode workspace, view options are no longer scene-specific.
 * Toggling the options entry should update both the viewer and visualizer
 * option panels so the user never needs to think about which runtime owns
 * the current canvas.
 *
 * @param {HeaderViewConfig} current
 * @returns {HeaderViewConfig}
 */
export function toggleOptionsPanels(current) {
  const nextVisible = !(current.showOptionsPanel || current.showVisualizerOptionsPanel);

  return {
    ...current,
    showOptionsPanel: nextVisible,
    showVisualizerOptionsPanel: nextVisible,
  };
}
