/**
 * @typedef {import('./types').HeaderViewConfig} HeaderViewConfig
 * @typedef {'showToolbar' | 'showOptionsPanel' | 'showSkeletonOptionsPanel' | 'showJointPanel'} ViewConfigKey
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
