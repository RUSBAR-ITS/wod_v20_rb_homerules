import { debugNs } from "../logger/ns.js";
import { SYSTEM_IDS } from "../constants/system-ids.js";
import { FATE_DATA } from "../constants/fate-data.js";

const { debug, warn, error } = debugNs("fate:roll");

/**
 * Open the upstream WoD "General Roll" dialog configured as a no-ability roll
 * for the Fate scale.
 *
 * Why we do this instead of rolling directly:
 * - It keeps behavior identical to the system (same dialog, same modifiers, same UX).
 * - It avoids duplicating roll logic in the module.
 *
 * Important upstream behavior:
 * - For "noability" rolls, the system dialog reads dice pool from:
 *     actor.system.advantages[attributeKey].roll
 *   Therefore, the module must keep `advantages.fate.roll` synchronized with the
 *   chosen Fate pool policy (permanent/temporary).
 *
 * @param {Actor} actor
 */
export async function openFateRollDialog(actor) {
  if (!actor) return;

  try {
    /**
     * Dynamic import of system code.
     *
     * We intentionally keep the system path in constants because it is an
     * "integration contract" with the upstream system. If the system updates
     * its internal module paths, we want a single place to fix.
     *
     * NOTE:
     * - Path must be absolute (leading slash).
     * - The module must have permission to import the system file (normal in Foundry).
     */
    const mod = await import(SYSTEM_IDS.DIALOG_GENERAL_ROLL_MODULE_PATH);
    const { GeneralRoll, DialogGeneralRoll } = mod ?? {};

    /**
     * Defensive checks:
     * If the system changes exports/names, we avoid hard-crashing the module
     * and leave a clear warning in logs.
     */
    if (!GeneralRoll || !DialogGeneralRoll) {
      warn("Upstream GeneralRoll/DialogGeneralRoll not found; cannot open Fate roll dialog.", {
        path: SYSTEM_IDS.DIALOG_GENERAL_ROLL_MODULE_PATH,
      });
      return;
    }

    /**
     * Create a system roll object:
     * - attributeKey = "fate" (our scale key)
     * - type = "noability" (scale-based roll)
     *
     * This mirrors the system behavior used for Willpower/Faith scale rolls.
     */
    const roll = new GeneralRoll(FATE_DATA.STAT_KEY, SYSTEM_IDS.GENERAL_ROLL_TYPE_NOABILITY, actor);

    /**
     * Create and render the upstream dialog.
     * The dialog will handle:
     * - difficulty and bonuses
     * - generating DiceRollContainer and invoking DiceRoller
     * - emitting the chat message with roll-template.hbs
     */
    const dialog = new DialogGeneralRoll(actor, roll);
    dialog.render(true);

    debug("Opened Fate roll dialog", { actorId: actor.id, actorType: actor.type });
  } catch (err) {
    /**
     * Any failure here should not break the sheet rendering.
     * We log the error and do nothing else.
     */
    error("Failed to open Fate roll dialog", err);
  }
}
