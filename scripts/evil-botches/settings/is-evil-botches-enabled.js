import { MODULE_ID } from "../../constants/module-id.js";
import { SETTINGS_KEYS } from "../../constants/settings.js";

/**
 * Read the module setting controlling Evil Botches.
 *
 * NOTE: This intentionally returns a strict boolean.
 */
export function isEvilBotchesEnabled() {
  return game?.settings?.get(MODULE_ID, SETTINGS_KEYS.EVIL_BOTCHES) === true;
}
