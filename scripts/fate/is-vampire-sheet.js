import { FATE_UI } from "../constants/fate-ui.js";
import { SYSTEM_IDS } from "../constants/system-ids.js";

/**
 * Detect whether the currently rendered sheet is a Vampire sheet.
 *
 * Requirements:
 * - Fate should only be shown on Vampire sheets (for now).
 * - System may have multiple sheet classes and templates.
 *
 * Strategy (best-effort):
 * 1) Prefer actor.type check.
 * 2) Fallback to template path check (covers variant sheet classes).
 *
 * Later extension:
 * - We can generalize this to "allowed sheet templates" array and expand it for
 *   additional actor types without changing fate core logic.
 *
 * @param {ActorSheet} app
 * @returns {boolean}
 */
export function isVampireSheet(app) {
  // Most reliable: actor type.
  const actorType = app?.actor?.type;
  if (actorType === SYSTEM_IDS.VAMPIRE_ACTOR_TYPE) return true;

  // Fallback: template path detection.
  const template = typeof app?.getTemplate === "function"
    ? app.getTemplate()
    : app?.options?.template;

  if (typeof template === "string" && template.includes(FATE_UI.VAMPIRE_TEMPLATE_HINT)) return true;

  return false;
}
