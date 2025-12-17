/**
 * Identifiers defined by (or tightly coupled to) the WoD system.
 *
 * We keep them centralized because they are effectively "integration contracts".
 * If the upstream system changes these identifiers, we only need to update them here.
 */

export const SYSTEM_IDS = Object.freeze({
  /**
   * Actor type string for Vampire actors in the WoD system.
   */
  VAMPIRE_ACTOR_TYPE: "vampire",
});
