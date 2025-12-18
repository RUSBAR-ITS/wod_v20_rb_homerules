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

  /**
   * General roll "type" values used by the upstream DialogGeneralRoll.
   */
  GENERAL_ROLL_TYPE_NOABILITY: "noability",

  /**
   * Absolute module path to the upstream General Roll dialog (system code).
   * Must be absolute (leading slash) to avoid URL-relative resolution issues.
   */
  DIALOG_GENERAL_ROLL_MODULE_PATH: "/systems/worldofdarkness/module/dialogs/dialog-generalroll.js",

  /**
   * Absolute module path to the upstream roll engine.
   */
  ROLL_DICE_MODULE_PATH: "/systems/worldofdarkness/module/scripts/roll-dice.js",

  /**
   * Absolute module paths to upstream roll dialogs we patch.
   */
  DIALOG_SOAK_MODULE_PATH: "/systems/worldofdarkness/module/dialogs/dialog-soak.js",
  DIALOG_WEAPON_MODULE_PATH: "/systems/worldofdarkness/module/dialogs/dialog-weapon.js",
  DIALOG_POWER_MODULE_PATH: "/systems/worldofdarkness/module/dialogs/dialog-power.js",
  DIALOG_ITEM_MODULE_PATH: "/systems/worldofdarkness/module/dialogs/dialog-item.js",
  DIALOG_TRAIT_MODULE_PATH: "/systems/worldofdarkness/module/dialogs/dialog-trait.js",
  DIALOG_ARETE_MODULE_PATH: "/systems/worldofdarkness/module/dialogs/dialog-aretecasting.js",
  DIALOG_FRENZY_MODULE_PATH: "/systems/worldofdarkness/module/dialogs/dialog-checkfrenzy.js",
});
