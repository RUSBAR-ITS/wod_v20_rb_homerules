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
import { registerDisableWillpowerForFateHook } from "./fate/disable-willpower-for-fate.js";

const { debug, info, warn, error } = debugNs("init");

/**
 * Foundry init hook:
 * - register settings (must be done early)
 * - register UI tweak hooks that should exist before any dialogs are rendered
 *
 * NOTE:
 * We keep this hook minimal: no DOM operations, no actor mutations here.
 */
Hooks.once("init", () => {
  registerSettings();

  /**
   * Disable Willpower option for Fate rolls in the upstream General Roll dialog.
   * This is a UI-layer fix and should be registered early.
   */
  registerDisableWillpowerForFateHook();

  debug("Init complete");
});

/**
 * Foundry ready hook:
 * - initialize debug flag based on user settings
 *
 * NOTE:
 * This is the earliest point where settings are guaranteed to be available.
 */
Hooks.once("ready", () => {
  try {
    const enabled = game.settings.get(MODULE_ID, SETTINGS_KEYS.ENABLE_DEBUG) === true;
    setDebugEnabled(enabled);
    info("Ready", { debug: enabled });
  } catch (err) {
    // This should not normally fail, but we avoid hard failures in ready().
    warn("Failed to read debug setting on ready", err);
  }
});

/**
 * renderActorSheet:
 * We inject Fate UI only when:
 * - the feature is enabled in module settings
 * - the sheet is a Vampire sheet (our supported target)
 *
 * Sequence:
 * 1) ensure Fate data exists and is normalized (including `roll` sync)
 * 2) render/inject Fate scale HTML
 * 3) bind Fate click handlers (steps + headline roll)
 *
 * NOTE:
 * This is executed on every sheet render, so the code must be safe and idempotent.
 */
Hooks.on("renderActorSheet", async (app, html) => {
  try {
    // Feature gating: do nothing if Fate is disabled.
    if (!shouldEnableFate()) return;

    // Sheet gating: do nothing if this is not a vampire sheet we support.
    if (!isVampireSheet(app)) return;

    const actor = app.actor;
    if (!actor) return;

    /**
     * Ensure actor has the Fate structure and `advantages.fate.roll` is synchronized
     * with the chosen roll policy (permanent/temporary).
     *
     * This is required because the upstream `DialogGeneralRoll` for "noability"
     * reads dice pool from `advantages.<key>.roll`.
     */
    await ensureFateData(actor);

    /**
     * Render Fate scale and inject it into the sheet DOM.
     * This function is expected to be idempotent and use a wrapper marker.
     */
    await renderFateScale(app, html);

    /**
     * Bind click handlers inside the Fate wrapper:
     * - headline click => open upstream roll dialog (noability for fate)
     * - step click => update permanent/temporary and sync `roll`
     */
    bindFateClicks(app, html);
  } catch (err) {
    error("renderActorSheet hook failed", err);
  }
});
