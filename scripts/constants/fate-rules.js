/**
 * Fate rules/balance constants.
 *
 * These values affect character data defaults and normalization rules.
 * Adjust them to tune the Fate mechanic without hunting through code.
 *
 * NOTE:
 * - Keep this file free of Foundry hooks or DOM-specific details.
 * - Safe to import anywhere.
 */

export const FATE_RULES = Object.freeze({
  /**
   * Default values used when Fate data is missing on an actor.
   * We keep these willpower-like for familiarity.
   */
  DEFAULTS: Object.freeze({
    permanent: 0,
    temporary: 0,
    max: 10,
    roll: 0,
  }),

  /**
   * Which Fate field should be used as the dice pool for system "noability" rolls.
   * The upstream DialogGeneralRoll reads `advantages.<key>.roll` for noability rolls,
   * so we keep `roll` synchronized with the chosen source field.
   *
   * Allowed values:
   * - "permanent" (recommended; willpower-like)
   * - "temporary" (if your rules say you roll remaining points)
   */
  ROLL_SOURCE: "permanent",

  /**
   * Safety cap for `max` to protect against extreme/broken values.
   * Adjust if your rules allow larger scales.
   */
  MAX_CAP: 50,
});
