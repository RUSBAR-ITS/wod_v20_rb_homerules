import { debugNs } from "../logger/ns.js";
import { SYSTEM_IDS } from "../constants/system-ids.js";
import { setPendingAutoSuccesses } from "./store.js";

const { debug, info, warn, error } = debugNs("rollctx:patch:bonus");

/**
 * Patch upstream BonusHelper to capture bonus auto-successes.
 *
 * In the WoD20 system, bonus auto-successes are applied inside DiceRoller via:
 * - BonusHelper.CheckAttributeAutoBuff(actor, attribute)
 * - BonusHelper.GetAttributeAutoBuff(actor, attribute)
 *
 * We wrap GetAttributeAutoBuff to copy the computed number into our pending roll context.
 * This avoids reading (or parsing) the chat output.
 */
export async function registerBonusHelperAutoSuccessCapture() {
  try {
    const mod = await import(SYSTEM_IDS.BONUS_HELPER_MODULE_PATH);
    const BonusHelper = mod?.default;

    if (!BonusHelper) {
      warn("Upstream BonusHelper not found; auto-success capture will not apply", {
        path: SYSTEM_IDS.BONUS_HELPER_MODULE_PATH,
      });
      return;
    }

    const marker = "__rusbarHrPatched_GetAttributeAutoBuff__";
    if (BonusHelper[marker] === true) {
      debug("BonusHelper already patched; skipping");
      return;
    }

    const original = BonusHelper.GetAttributeAutoBuff;
    if (typeof original !== "function") {
      warn("BonusHelper.GetAttributeAutoBuff is not a function; cannot capture auto-successes");
      return;
    }

    BonusHelper.GetAttributeAutoBuff = async function patchedGetAttributeAutoBuff(actor, attribute, ...rest) {
      const value = await original.call(this, actor, attribute, ...rest);

      try {
        const userId = game?.user?.id;
        const actorId = actor?.id ?? null;
        const attr = attribute ?? null;

        const v = Number.parseInt(value ?? 0, 10);
        if (userId && Number.isFinite(v) && v > 0) {
          setPendingAutoSuccesses(userId, { actorId, attribute: attr, autoSuccesses: v });
          debug("Captured attribute auto-successes", { userId, actorId, attribute: attr, autoSuccesses: v });
        }
      } catch (captureErr) {
        // Never block upstream behavior.
        warn("Failed to capture attribute auto-successes", { err: captureErr });
      }

      return value;
    };

    BonusHelper[marker] = true;
    info("Patched BonusHelper.GetAttributeAutoBuff to capture auto-successes");
  } catch (err) {
    error("Failed to register BonusHelper auto-success capture", err);
  }
}
