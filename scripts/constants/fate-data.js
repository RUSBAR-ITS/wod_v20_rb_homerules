/**
 * Fate data-path constants.
 *
 * These strings define where Fate is stored inside the Actor system data.
 * We keep them centralized because they are referenced across multiple files
 * (data initialization, click handlers, future rule logic).
 */

export const FATE_DATA = Object.freeze({
  /**
   * Full Foundry update path base (includes the "system." prefix).
   * Example usage:
   *   await actor.update({ [`${PATH_BASE_SYSTEM}.max`]: 10 });
   */
  PATH_BASE_SYSTEM: "system.advantages.fate",

  /**
   * Base path used by system sheet helpers in data-name attributes.
   * Example: data-name="advantages.fate.temporary".
   */
  PATH_BASE: "advantages.fate",

  /**
   * Prefix used to convert helper data-name values into update paths.
   * Example:
   *   data-name="advantages.fate.permanent" -> "system.advantages.fate.permanent"
   */
  SYSTEM_PREFIX: "system.",
});
