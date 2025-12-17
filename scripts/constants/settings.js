/**
 * Module setting keys.
 *
 * Centralizing keys prevents typos and makes refactors safer.
 * These are the keys used with `game.settings.get(MODULE_ID, key)`.
 */

export const SETTINGS_KEYS = Object.freeze({
  ENABLE_FATE: "enableFate",
  ENABLE_DEBUG: "enableDebug",
});
