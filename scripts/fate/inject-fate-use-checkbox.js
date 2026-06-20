import { debugNs } from "../logger/ns.js";
import { shouldEnableFate } from "./should-enable-fate.js";
import { getFatePermanent } from "./get-fate-permanent.js";

const { debug, info, warn, error } = debugNs("fate:ui:roll");

/**
 * DOM marker to avoid double-injection when Foundry re-renders dialogs.
 */
const MARKER_ATTR = "data-rusbar-fate-injected";

/**
 * Form field name used by the injected checkbox.
 *
 * This must match what we read in dialog patch wrappers.
 */
export const USE_FATE_FIELD_NAME = "useFate";

/**
 * Register render hooks for upstream roll dialogs and inject the "Use Fate" checkbox.
 *
 * Requirements implemented:
 * - Checkbox exists in ALL roll dialogs, except:
 *   - initiative rolls (separate path, no dialog)
 *   - damage rolls (weapon damage mode + auto-damage roll)
 * - Checkbox is placed inside the "dicepool" section at the very bottom
 *   (below all other checkboxes).
 * - When checked, the dicepool section visually shows: + Fate (X)
 *   IMPORTANT: must be in the SAME LINE as Attribute + Ability formula.
 * - Entire feature is gated by module setting "Enable Fate"
 */
export function registerUseFateCheckboxInjection() {
  // We register hooks unconditionally; internal gating decides whether to inject.
  Hooks.on("renderDialogGeneralRoll", (app, html) => injectIntoDialog(app, html, "DialogGeneralRoll"));
  Hooks.on("renderDialogSoakRoll", (app, html) => injectIntoDialog(app, html, "DialogSoakRoll"));
  Hooks.on("renderDialogWeapon", (app, html) => injectIntoDialog(app, html, "DialogWeapon"));
  Hooks.on("renderDialogPower", (app, html) => injectIntoDialog(app, html, "DialogPower"));
  Hooks.on("renderDialogItem", (app, html) => injectIntoDialog(app, html, "DialogItem"));
  Hooks.on("renderDialogRoll", (app, html) => injectIntoDialog(app, html, "DialogRoll"));
  Hooks.on("renderDialogAreteCasting", (app, html) => injectIntoDialog(app, html, "DialogAreteCasting"));
  Hooks.on("renderDialogCheckFrenzy", (app, html) => injectIntoDialog(app, html, "DialogCheckFrenzy"));

  info("Registered render hooks for Use Fate checkbox injection");
}

/**
 * Inject checkbox + visual dicepool inline label into a roll dialog.
 *
 * @param {FormApplication} app
 * @param {JQuery} html
 * @param {string} dialogName
 */
function injectIntoDialog(app, html, dialogName) {
  try {
    if (shouldEnableFate() !== true) return;

    // Defensive: ensure we have DOM.
    if (!html || html.length === 0) return;

    // Foundry can fire render hooks before the form element is actually connected to DOM.
    // Some browsers emit "Form submission canceled because the form is not connected" when
    // FormApplication (submitOnChange) tries to submit a detached <form>.
    //
    // We defer the injection by one tick and only proceed if the element is connected.
    if (html?.[0]?.isConnected !== true) {
      setTimeout(() => {
        try {
          if (html?.[0]?.isConnected === true) injectIntoDialog(app, html, dialogName);
        } catch (_err) {
          // Best-effort UI enhancement. Never crash.
        }
      }, 0);
      return;
    }

    // Prevent double injection.
    if (html.attr(MARKER_ATTR) === "true") return;
    html.attr(MARKER_ATTR, "true");

    // Exclusion: Do NOT show/use Fate checkbox in the Fate roll itself.
    // Fate rolls are implemented via the upstream General Roll dialog with key "fate".
    // Showing "Use Fate" there is confusing and can create self-referential UX.
    if (dialogName === "DialogGeneralRoll" && app?.object?.key === "fate") {
      debug("Skipping Use Fate injection for Fate roll dialog", { dialogName, key: app?.object?.key });
      return;
    }

    // Exclusion: Weapon dialog damage mode should NOT show/use Fate.
    if (dialogName === "DialogWeapon") {
      const weaponType = app?.object?.weaponType;
      if (weaponType === "Damage") {
        debug("Skipping Use Fate injection for weapon damage mode", { weaponType });
        return;
      }
    }

    const actor = app?.actor;
    const fatePermanent = getFatePermanent(actor);

    // Determine if the checkbox should be checked initially.
    const initiallyChecked = app?.object?.useFate === true;

    // Locate insertion anchor: last checkbox block within the dialog.
    // Most upstream dialogs use `.dialog-checkbox` for these options.
    const lastCheckboxBlock = html.find(".dialog-checkbox").last();

    /**
     * Prefer the dialog-area which actually represents the dicepool section.
     * Some dialogs (e.g. Willpower) may not have any other `.dialog-checkbox` rows,
     * so the old heuristic (last checkbox) could resolve to the wrong section.
     */
    const dicePoolHeadlineText = (game?.i18n?.localize?.("wod.dialog.dicepool") || "").trim();
    let dicePoolArea = null;

    if (dicePoolHeadlineText.length > 0) {
      const headlineBox = html
        .find(".dialog-area .infobox.headline")
        .filter((_, el) => {
          const t = $(el).text().trim();
          return t === dicePoolHeadlineText;
        })
        .first();

      if (headlineBox && headlineBox.length > 0) {
        dicePoolArea = headlineBox.closest(".dialog-area");
      }
    }

    // Fallback to previous heuristic if the headline-based approach failed.
    if (!dicePoolArea || dicePoolArea.length === 0) {
      if (lastCheckboxBlock && lastCheckboxBlock.length > 0) {
        dicePoolArea = lastCheckboxBlock.closest(".dialog-area");
      } else {
        // Last resort: use the first dialog-area (should be rare).
        dicePoolArea = html.find(".dialog-area").first();
        warn("Could not resolve dicePoolArea reliably; using fallback", { dialogName });
      }
    }

    if (!dicePoolArea || dicePoolArea.length === 0) {
      warn("No dicePoolArea found; cannot inject Use Fate checkbox", { dialogName });
      return;
    }

    /**
     * Find the dicepool formula row.
     *
     * In upstream dialogs this is typically an `.infobox` row (not the checkbox rows).
     * We want to keep Fate on THE SAME LINE, so we inject an inline <span>.
     */
    const formulaBox = dicePoolArea
      .find(".infobox")
      .not(".headline")
      .not(".dialog-checkbox")
      .first();

    const fateLabel = game.i18n.localize("wod.advantages.fate");

    // Inline span (same line requirement)
    const inlineSpan = $(
      `<span class="rusbar-fate-dicepool-inline" style="display:none;"> + ${fateLabel} (${fatePermanent})</span>`
    );

    if (formulaBox && formulaBox.length > 0) {
      // Ensure we do not duplicate spans on rerender.
      if (formulaBox.find(".rusbar-fate-dicepool-inline").length === 0) {
        // Append inline to the existing formula row to keep it in the same line.
        formulaBox.append(inlineSpan);
      }
    } else {
      warn("No formulaBox found; cannot inject Fate inline span", { dialogName });
    }

    // Build checkbox block.
    // We mimic upstream structure: `.clearareaBox.infobox.dialog-checkbox`.
    //
    // IMPORTANT: Provide a real input `id` and match label's `for`.
    // Using `for=name` is invalid, and can cause oddities with change/submit handling.
    const checkboxLabel = game.i18n.localize("rusbar.homerules.fate.useFate");
    const checkboxId = `rusbar-use-fate-${app?.id ?? foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2)}`;

    const checkboxBlock = $(
      `<div class="clearareaBox infobox dialog-checkbox rusbar-fate-use-checkbox">
         <div class="pullLeft">
           <input id="${checkboxId}" name="${USE_FATE_FIELD_NAME}" type="checkbox" />
         </div>
         <div class="pullLeft">
           <label for="${checkboxId}" class="pullLeft">${checkboxLabel}</label>
         </div>
       </div>`
    );

    // Insert at the very bottom of dicepool section.
    if (lastCheckboxBlock && lastCheckboxBlock.length > 0) {
      lastCheckboxBlock.after(checkboxBlock);
    } else {
      dicePoolArea.append(checkboxBlock);
    }

    const checkbox = checkboxBlock.find(`input[name="${USE_FATE_FIELD_NAME}"]`);
    checkbox.prop("checked", initiallyChecked);

    // Initial sync.
    inlineSpan.toggle(initiallyChecked === true);

    // Wire change handler to toggle the inline span.
    checkbox.on("change", (ev) => {
      try {
        const checked = ev?.currentTarget?.checked === true;
        inlineSpan.toggle(checked);

        debug("Use Fate checkbox changed", {
          dialogName,
          actorId: actor?.id,
          checked,
          fatePermanent,
        });
      } catch (err) {
        error("Use Fate checkbox change handler failed", err);
      }
    });

    debug("Injected Use Fate checkbox into dialog", {
      dialogName,
      actorId: actor?.id,
      fatePermanent,
    });
  } catch (err) {
    error("Failed to inject Use Fate checkbox", { dialogName, err });
  }
}
