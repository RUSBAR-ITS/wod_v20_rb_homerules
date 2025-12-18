import { debugNs } from "../logger/ns.js";
import { FATE_DATA } from "../constants/fate-data.js";
import { SYSTEM_IDS } from "../constants/system-ids.js";

const { debug, warn } = debugNs("fate:dialog");

/**
 * Register a UI hook that disables the "Use Willpower" option
 * in the upstream General Roll dialog specifically for Fate rolls.
 *
 * Why this is needed:
 * - The upstream DialogGeneralRoll template renders the "use willpower" checkbox
 *   for general/noability rolls.
 * - For Fate rolls, spending Willpower should not be possible (module rule).
 *
 * Implementation strategy:
 * - Hook into `renderDialogGeneralRoll` (system dialog render hook).
 * - Detect that the dialog is for Fate:
 *     roll.type === "noability" AND roll.attributeKey === "fate"
 * - Disable + hide the checkbox in the DOM.
 * - Also force the roll object's willpower flag to false as a safety belt.
 *
 * Notes:
 * - We use `disabled=true` because disabled inputs are excluded from form submission,
 *   preventing the system from reading "useWillpower=true" from formData.
 * - This is a UI-layer patch; it must never crash the app if selectors change.
 */
export function registerDisableWillpowerForFateHook() {
  Hooks.on("renderDialogGeneralRoll", (app, html) => {
    try {
      /**
       * The system dialog usually stores the roll model under `app.object`.
       * We also check `app.roll` as a defensive fallback (system variations).
       */
      const roll = app?.object ?? app?.roll;
      if (!roll) return;

      /**
       * Ensure we only affect Fate no-ability rolls, not other dialog uses.
       */
      const isFateNoAbility =
        roll.type === SYSTEM_IDS.GENERAL_ROLL_TYPE_NOABILITY &&
        roll.attributeKey === FATE_DATA.STAT_KEY;

      if (!isFateNoAbility) return;

      /**
       * Find the checkbox by its form name.
       * Upstream dialog uses this name in form data processing.
       */
      const checkbox = html.find('input[name="useWillpower"]');
      if (!checkbox.length) {
        warn("Could not find useWillpower checkbox in DialogGeneralRoll for Fate.");
        return;
      }

      /**
       * Force checkbox off and disable it so it cannot be submitted.
       */
      checkbox.prop("checked", false);
      checkbox.prop("disabled", true);

      /**
       * Hide the checkbox row to avoid confusing UI.
       * We keep this as "best effort": if the selector doesn't match, we still
       * have the checkbox disabled.
       */
      const container = checkbox.closest(".dialog-checkbox");
      if (container.length) container.hide();

      /**
       * Safety belt:
       * Some system implementations read the roll object state rather than
       * relying purely on formData. We defensively set both common variants.
       */
      if ("useWillpower" in roll) roll.useWillpower = false;
      if ("usewillpower" in roll) roll.usewillpower = false;

      debug("Disabled willpower option for Fate roll dialog");
    } catch (_err) {
      /**
       * This is a UI enhancement, never allow it to crash the application.
       * If upstream changes the dialog template structure, we simply fail silently.
       */
    }
  });
}
