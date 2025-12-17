/**
 * Fate UI / system-integration constants.
 *
 * These values describe how we:
 * - detect Vampire sheets
 * - locate insertion anchors in the system DOM
 * - mark our injected UI
 * - bind/unbind event handlers
 *
 * If the underlying system updates its sheet templates/markup, this is the
 * first place to adjust.
 */

export const FATE_UI = Object.freeze({
  TEMPLATE_PATH: "modules/rusbar-homerules-for-wod-v20-system/templates/fate/fate-scale.hbs",

  MARKER_ATTR: "data-rusbar-fate-scale",
  MARKER_VALUE: "1",

  CLICK_NAMESPACE: "rusbarFate",

  /**
   * Primary willpower anchor name.
   */
  WILLPOWER_TEMP_DATA_NAME: "advantages.willpower.temporary",

  /**
   * Fallback selectors to locate a good insertion point.
   * We try, in order:
   * - willpower temporary (preferred)
   * - willpower permanent
   * - any willpower row
   * - last resort: any sheet-inner-area container
   */
  ANCHOR_SELECTORS: Object.freeze({
    willpowerTemp: `[data-name="advantages.willpower.temporary"]`,
    willpowerPerm: `[data-name="advantages.willpower.permanent"]`,
    anyWillpower: `[data-name^="advantages.willpower."]`,
    anyInnerArea: `.sheet-inner-area`,
  }),

  SELECTORS: Object.freeze({
    sheetBoxContainer: ".sheet-boxcontainer",
    resourceStep: ".resource-value-step",

    // Rows as produced by system helper getGetStatArea:
    // We do NOT rely on class names like "permValueRow"/"tempSquareRow" anymore.
    // We sync using data-name targets which are stable.
    fatePermanentRow: `[data-name="advantages.fate.permanent"]`,
    fateTemporaryRow: `[data-name="advantages.fate.temporary"]`,
  }),

  VAMPIRE_TEMPLATE_HINT: "vampire-sheet.html",
});
