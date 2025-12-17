import { MODULE_ID } from "./constants/module-id.js";
import { SETTINGS_KEYS } from "./constants/settings.js";
import { registerSettings } from "./settings/register-settings.js";

import { setDebugEnabled } from "./logger/state.js";
import { debugNs } from "./logger/ns.js";

import { shouldEnableFate } from "./fate/should-enable-fate.js";
import { isVampireSheet } from "./fate/is-vampire-sheet.js";
import { ensureFateData } from "./fate/ensure-fate-data.js";
import { renderFateScale } from "./fate/render-fate-scale.js";
import { bindFateClicks } from "./fate/bind-fate-clicks.js";

const { debug, info, warn, error } = debugNs("init");

/**
 * Module bootstrap.
 *
 * Lifecycle overview:
 * - init:
 *   - register module settings (WITHOUT using logger inside settings file)
 *   - expose a minimal API bridge for settings onChange handlers
 *
 * - ready:
 *   - read enableDebug setting and configure logger state
 *
 * - renderActorSheet:
 *   - if Fate enabled AND sheet is Vampire:
 *       ensure Fate data exists
 *       render Fate scale next to Willpower
 *       bind click handlers for Fate steps
 */
Hooks.once("init", () => {
  /**
   * Register settings.
   * NOTE: registerSettings() must not rely on logger.
   */
  registerSettings();

  /**
   * Expose a safe API bridge for settings onChange callbacks.
   *
   * Why this exists:
   * - The settings registration file cannot import logger.
   * - But we want enableDebug changes to immediately toggle logger behavior.
   *
   * So the settings file calls:
   *   game.modules.get(MODULE_ID).api.setDebugEnabled(...)
   */
  try {
    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api = mod.api || {};
      mod.api.setDebugEnabled = setDebugEnabled;
    }
  } catch (_err) {
    // Never crash init because of an optional API bridge.
  }
});

Hooks.once("ready", () => {
  /**
   * Configure debug mode after Foundry is ready and settings are available.
   */
  try {
    const enabled = game.settings.get(MODULE_ID, SETTINGS_KEYS.ENABLE_DEBUG) === true;
    setDebugEnabled(enabled);

    info(`Debug logging ${enabled ? "enabled" : "disabled"}.`);
  } catch (err) {
    // If anything goes wrong here, fallback to raw console.
    console.error(`[${MODULE_ID}:init] Failed to initialize debug flag`, err);
  }
});

/**
 * Sheet render hook.
 *
 * We use renderActorSheet instead of template overrides because:
 * - it is non-invasive (no system file modifications)
 * - allows targeting specific sheets and actor types
 * - supports future extension to additional sheets by adding checks
 */
Hooks.on("renderActorSheet", async (app, html) => {
  try {
    // Global gate: module feature must be enabled.
    if (!shouldEnableFate()) return;

    // Sheet gate: only Vampire sheets for now.
    if (!isVampireSheet(app)) return;

    debug("renderActorSheet: vampire sheet detected", {
      actorId: app.actor?.id,
      actorName: app.actor?.name,
      sheetClass: app?.constructor?.name,
    });

    /**
     * Ensure data exists BEFORE rendering, because the system helper expects
     * actor.system.advantages.fate.* to be defined.
     */
    await ensureFateData(app.actor);

    /**
     * Insert Fate UI (willpower-like scale) into the sheet DOM.
     * This uses the system's helper getGetStatArea, so the visuals match 1:1.
     */
    await renderFateScale(app, html);

    /**
     * Bind click handlers for Fate steps. We do this after insertion,
     * and we do it each render (with off/on) to avoid duplicates.
     */
    bindFateClicks(app, html);
  } catch (err) {
    error("renderActorSheet hook failed", err);
  }
});
