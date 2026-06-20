/**
 * Module setting keys.
 *
 * Centralizing keys prevents typos and makes refactors safer.
 * These are the keys used with `game.settings.get(MODULE_ID, key)`.
 */

export const SETTINGS_KEYS = Object.freeze({
  ENABLE_FATE: "enableFate",
  ENABLE_DEBUG: "enableDebug",

  // Enables alternative botch behavior (rule logic will be added in a later task).
  EVIL_BOTCHES: "evilBotches",

  /**
   * Preserve Item image paths:
   * - The upstream WoD20 system overwrites Item.img on create (and sometimes update).
   * - When enabled, we remember incoming custom img path and restore it after system overrides.
   */
  PRESERVE_ITEM_IMAGE_PATHS: "preserveItemImagePaths",
});
