import { debugNs } from "../logger/ns.js";

const { debug } = debugNs("rollctx:dom");

/**
 * Read a checkbox state from a system roll dialog.
 *
 * Why:
 * - Some upstream dialogs rely on form submission / _updateObject to sync UI -> this.object.
 * - In Foundry, form submission can be canceled if the form is not connected to the DOM at that moment.
 * - For roll context we need the *actual* UI state (e.g. specialization checked), so we prefer DOM.
 *
 * @param {object} dialog The dialog instance (Foundry Application / FormApplication).
 * @param {string[]} names Candidate checkbox input `name` attributes to search for.
 * @returns {boolean|undefined} `true/false` if the checkbox exists, otherwise `undefined`.
 */
export function readDialogCheckbox(dialog, names) {
  try {
    const root = dialog?.element?.[0] ?? dialog?.element ?? null;
    if (!root || typeof root.querySelector !== "function") return undefined;

    for (const name of names) {
      const selector = `input[type="checkbox"][name="${CSS.escape(name)}"]`;
      const el = root.querySelector(selector);
      if (el) return Boolean(el.checked);
    }

    return undefined;
  } catch (err) {
    // This is best-effort: never block upstream behavior.
    debug("Failed to read checkbox state from dialog DOM", { names, err });
    return undefined;
  }
}
