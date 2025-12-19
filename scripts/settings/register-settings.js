import { MODULE_ID } from "../constants/module-id.js";
import { SETTINGS_KEYS } from "../constants/settings.js";

/**
 * Register module settings.
 *
 * IMPORTANT RULES FOR THIS MODULE:
 * - This file MUST NOT import or use the module logger.
 *   Reason: the logger's "debug enabled" state is controlled by a setting,
 *   so the setting must be registered before the logger can be configured.
 *
 * How debug is enabled:
 * - We register the "enableDebug" setting here.
 * - Its onChange callback calls a tiny "API bridge" function exposed by init.js.
 * - The bridge updates an internal logger flag without importing logger code here.
 */
export function registerSettings() {
  /**
   * enableFate:
   * - Controls whether Fate is displayed/active at all.
   * - Fate UI and Fate data initialization only happen when this is TRUE.
   * - When toggled, open sheets will update on their next render. (We can add
   *   forced refresh later if needed.)
   */
  game.settings.register(MODULE_ID, SETTINGS_KEYS.ENABLE_FATE, {
    name: "rusbar.homerules.settings.enableFate.name",
    hint: "rusbar.homerules.settings.enableFate.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      // Intentionally no logger usage here.
      // Rendering is driven by renderActorSheet hooks, so open sheets will update
      // on the next render cycle (or manual reopen). If you want immediate refresh,
      // we can implement it in a separate non-settings file.
    }
  });

  /**
   * evilBotches:
   * - A rules toggle that enables alternative botch handling.
   * - NOTE: Only the setting is introduced in this task. Rule logic will be added later.
   */
  game.settings.register(MODULE_ID, SETTINGS_KEYS.EVIL_BOTCHES, {
    name: "rusbar.homerules.settings.evilBotches.name",
    hint: "rusbar.homerules.settings.evilBotches.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      // Intentionally no logger usage here.
      // This setting will be read by the future rule implementation.
    }
  });

  /**
   * enableDebug:
   * - Enables extended debug logging for THIS module.
   * - This does not affect the system itself.
   *
   * onChange behavior:
   * - We cannot import the logger here, so we call a function exposed through
   *   game.modules.get(MODULE_ID).api.setDebugEnabled(...)
   * - That bridge is created in scripts/init.js (Hooks.once("init")).
   */
  game.settings.register(MODULE_ID, SETTINGS_KEYS.ENABLE_DEBUG, {
    name: "rusbar.homerules.settings.enableDebug.name",
    hint: "rusbar.homerules.settings.enableDebug.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => {
      // Do NOT import logger here. Use the API bridge if it exists.
      try {
        const mod = game.modules.get(MODULE_ID);
        mod?.api?.setDebugEnabled?.(Boolean(value));
      } catch (_err) {
        // Ignore: settings change should never hard-fail due to missing api.
      }
    }
  });
}
