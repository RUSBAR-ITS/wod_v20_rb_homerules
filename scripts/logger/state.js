/**
 * Logger runtime state.
 *
 * Why a separate file:
 * - Keeps state management isolated (one file = one responsibility).
 * - Allows toggling debug logging at runtime without circular imports.
 *
 * Note:
 * - This state is not persisted. Persistence is provided by game.settings.
 */
let _debugEnabled = false;

/**
 * Enable/disable verbose debug logging.
 * @param {boolean} value
 */
export function setDebugEnabled(value) {
  _debugEnabled = Boolean(value);
}

/**
 * Check if verbose debug logging is enabled.
 * @returns {boolean}
 */
export function isDebugEnabled() {
  return _debugEnabled;
}
