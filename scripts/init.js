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
import { registerUseFateCheckboxInjection } from "./fate/inject-fate-use-checkbox.js";
import { registerDiceContainerFatePatch } from "./fate/patch-dice-container-with-fate.js";
import { registerRollDialogFatePatches } from "./fate/patch-roll-dialogs-with-fate.js";
import { registerFateDiceTypeTaggingHook } from "./fate/tag-fate-dice-types.js";
import { registerReplaceFateDiceInChatHook } from "./fate/replace-fate-dice-in-chat.js";
import { registerInsertFateResultInChatHook } from "./fate/insert-fate-result-in-chat.js";
import { registerEvilBotchesChatHook } from "./evil-botches/evil-botches-in-chat.js";
import { registerFateDiceSoNiceColorsetHook } from "./fate/dice/register-dsn-fate-colorset.js";

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
   * Dice So Nice integration:
   * Register Fate colorset (emerald/gold) when DSN is ready.
   * Assigning the colorset to Fate dice is done when we tag dice types on chat messages.
   */
  registerFateDiceSoNiceColorsetHook();

  /**
   * Disable Willpower option for Fate rolls in the upstream General Roll dialog.
   * This is a UI-layer fix and should be registered early.
   */
  registerDisableWillpowerForFateHook();

  /**
   * Roll dialog integration:
   * - inject "Use Fate" checkbox into upstream roll dialogs
   * - patch roll dialog prototypes (no system file changes)
   * - patch DiceRollContainer so Fate dice can be applied on assignment
   */
  registerUseFateCheckboxInjection();

  // These patches require dynamic imports; we log errors but do not hard-fail init.
  registerDiceContainerFatePatch().catch((err) => error("Failed to patch DiceRollContainer for Fate", err));
  registerRollDialogFatePatches().catch((err) => error("Failed to patch roll dialogs for Fate", err));

  /**
   * Tag dice types (base/special/fate) for Fate-enabled rolls in ChatMessage.flags.
   * This does NOT affect roll success calculation. It is metadata for later features.
   */
  registerFateDiceTypeTaggingHook();

  /**
   * Chat rendering integration:
   * Replace Fate dice visuals in the system roll template using cached diceTypes metadata.
   */
  registerReplaceFateDiceInChatHook();

  /**
   * Chat rendering integration:
   * Insert Fate-specific outcome line (10s vs 1s delta) under the base system success line.
   */
  registerInsertFateResultInChatHook();

  /**
   * Chat rendering integration:
   * Evil Botches: if ones > rawSuccessDice (before subtracting ones), show "Botch: X".
   * This only applies when the system setting "subtract ones" is enabled (CONFIG.worldofdarkness.handleOnes).
   */
  registerEvilBotchesChatHook();

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
 * Workflow:
 * - Ensure data exists (idempotent)
 * - Render Fate scale UI
 * - Bind click handlers for updating data and opening roll dialog
 */
Hooks.on("renderActorSheet", async (app, html) => {
  try {
    if (shouldEnableFate() !== true) return;
    if (isVampireSheet(app) !== true) return;

    ensureFateData(app.actor);

    /**
     * Render Fate scale UI wrapper on the sheet (idempotent).
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
