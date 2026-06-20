import { MODULE_ID } from "../constants/module-id.js";
import { SETTINGS_KEYS } from "../constants/settings.js";

/**
 * Check whether Fate functionality is enabled via module settings.
 *
 * This is intentionally tiny and isolated:
 * - allows other fate-related files to stay simple
 * - makes it easy to add additional gating logic later
 */
export function shouldEnableFate() {
  return game.settings.get(MODULE_ID, SETTINGS_KEYS.ENABLE_FATE) === true;
}
