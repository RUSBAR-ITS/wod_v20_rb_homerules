import { debugNs } from "../logger/ns.js";
import { SYSTEM_IDS } from "../constants/system-ids.js";
import { shouldEnableFate } from "./should-enable-fate.js";

const { debug, info, warn, error } = debugNs("fate:patch:container");

/**
 * Global (module-scoped) context used to pass "use Fate" intent from dialog wrappers
 * to the DiceRollContainer `numDices` assignment.
 *
 * Why this indirection exists:
 * - We do NOT modify upstream dialog source files.
 * - Upstream dialogs compute a local `numDices` value and then assign it to
 *   `roll.numDices` (DiceRollContainer instance).
 * - By converting `numDices` into an accessor on the container prototype, we can
 *   safely add Fate dice *at the moment of assignment*.
 *
 * IMPORTANT PITFALL (fixed here):
 * - Upstream DiceRollContainer constructor assigns `this.numDices = 0`.
 *   If we apply Fate to that constructor assignment, we "consume" the one-shot context
 *   too early, and the real assignment done by the dialog later will not get Fate.
 * - Therefore, we only apply Fate on "meaningful" assignments:
 *   - value > 0 AND origin is a non-empty string (origin is set by dialogs, not constructor).
 */

function getGlobalCtx() {
  const key = "__RUSBAR_HR_FATE_CTX__";

  if (!globalThis[key]) {
    globalThis[key] = {
      enabled: false,
      fateBonus: 0,
      consumeOnce: true,
      consumed: false,

      /**
       * Last roll container where Fate was actually applied.
       * Used by chat hooks to tag dice types on the next roll message.
       */
      lastContainer: null,
      lastContainerAtMs: 0,
    };
  }

  return globalThis[key];
}

/**
 * Set Fate application context for the *next* DiceRollContainer.numDices assignment.
 *
 * @param {{ fateBonus: number }} params
 */
export function setNextFateContext({ fateBonus }) {
  const ctx = getGlobalCtx();

  ctx.enabled = shouldEnableFate() === true;
  ctx.fateBonus = Math.max(0, Number.parseInt(fateBonus ?? 0, 10) || 0);
  ctx.consumeOnce = true;
  ctx.consumed = false;

  debug("setNextFateContext", { enabled: ctx.enabled, fateBonus: ctx.fateBonus });
}

/**
 * Clear Fate application context (best-effort).
 */
export function clearFateContext() {
  const ctx = getGlobalCtx();

  ctx.enabled = false;
  ctx.fateBonus = 0;
  ctx.consumeOnce = true;
  ctx.consumed = false;

  debug("clearFateContext");
}

/**
 * Consume the last DiceRollContainer where Fate dice were actually applied.
 *
 * This is used by chat hooks to tag dice types in the next ChatMessage.
 * To avoid accidental cross-message tagging, we require the container to be "fresh".
 *
 * @param {number} [maxAgeMs=3000] - Max allowed age since Fate application.
 * @returns {object|null} DiceRollContainer instance or null.
 */
export function consumeLastFateRollContainer(maxAgeMs = 3000) {
  const ctx = getGlobalCtx();

  const now = Date.now();
  const age = now - (ctx.lastContainerAtMs || 0);

  if (!ctx.lastContainer || age > maxAgeMs) {
    // Clear stale reference (best-effort).
    ctx.lastContainer = null;
    ctx.lastContainerAtMs = 0;
    return null;
  }

  const container = ctx.lastContainer;

  // One-shot consumption.
  ctx.lastContainer = null;
  ctx.lastContainerAtMs = 0;

  return container;
}

/**
 * Patch upstream DiceRollContainer so assigning to `numDices` can add Fate dice.
 *
 * This patch is idempotent: we mark the prototype after patching.
 */
export async function registerDiceContainerFatePatch() {
  try {
    const mod = await import(SYSTEM_IDS.ROLL_DICE_MODULE_PATH);
    const DiceRollContainer = mod?.DiceRollContainer;

    if (!DiceRollContainer) {
      warn("Upstream DiceRollContainer not found; Fate dice patch will not apply.", {
        path: SYSTEM_IDS.ROLL_DICE_MODULE_PATH,
      });
      return;
    }

    const proto = DiceRollContainer.prototype;
    const marker = "__rusbarFateNumDicesPatched__";

    if (proto[marker] === true) {
      debug("DiceRollContainer already patched; skipping");
      return;
    }

    /**
     * We store the "real" value in a private-ish field to avoid recursion.
     * This is safe even if upstream code later adds its own numDices logic.
     */
    const storageKey = "__rusbarNumDicesValue__";

    Object.defineProperty(proto, "numDices", {
      configurable: true,
      enumerable: true,
      get() {
        return this[storageKey] ?? 0;
      },
      set(value) {
        const ctx = getGlobalCtx();

        // Base assignment.
        let v = Number.parseInt(value ?? 0, 10);
        if (Number.isNaN(v) || !Number.isFinite(v)) v = 0;

        /**
         * Apply Fate dice only when explicitly requested by dialog wrappers AND
         * only when this assignment is the "real" dice pool assignment done by dialogs:
         * - v must be > 0
         * - origin must be a non-empty string (constructor uses "", dialogs set origin)
         *
         * This prevents consuming Fate on the constructor's `this.numDices = 0`.
         */
        const origin = this?.origin;
        const hasMeaningfulOrigin = typeof origin === "string" && origin.trim().length > 0;
        const isMeaningfulAssignment = v > 0 && hasMeaningfulOrigin === true;

        if (
          ctx.enabled === true &&
          ctx.fateBonus > 0 &&
          isMeaningfulAssignment === true &&
          (ctx.consumeOnce !== true || ctx.consumed !== true)
        ) {
          // Exclusions required by the user:
          // - no Fate on damage rolls
          // - no Fate on initiative rolls (initiative uses a separate path anyway)
          const isExcluded = origin === "damage" || origin === "initiative";

          if (!isExcluded) {
            // Mark Fate count on the container for later roll tagging.
            // This does NOT affect success counting.
            this.__rusbarFateDiceCount = ctx.fateBonus;

            v += ctx.fateBonus;
            debug("Applied Fate dice bonus on numDices assignment", {
              origin,
              fateBonus: ctx.fateBonus,
              finalNumDices: v,
            });

            /**
             * Add "+ Fate (X)" to the roll result output in chat.
             *
             * Upstream DiceRoller composes `data.title` by appending each entry from
             * `diceRoll.dicetext` using " + ". Therefore, pushing "Fate (X)" into
             * `dicetext` results in the desired suffix in the final chat card.
             *
             * We avoid duplicates by marking the container instance.
             */
            const fateTextMarker = "__rusbarFateRollAddonTextAdded__";
            if (this?.[fateTextMarker] !== true) {
              const fateLabel = (game?.i18n?.localize?.("wod.advantages.fate") || "").trim() || "Fate";
              const fateText = `${fateLabel} (${ctx.fateBonus})`;

              if (!Array.isArray(this.dicetext)) this.dicetext = [];
              this.dicetext.push(fateText);
              this[fateTextMarker] = true;

              debug("Added Fate roll addon text to dicetext", {
                origin,
                fateBonus: ctx.fateBonus,
                fateText,
              });
            }

            /**
             * Store this container as the "next roll to tag" for chat hooks.
             * We only set this when Fate was actually applied to the dice pool.
             */
            ctx.lastContainer = this;
            ctx.lastContainerAtMs = Date.now();
          } else {
            debug("Skipped Fate dice bonus due to excluded origin", { origin });
          }

          if (ctx.consumeOnce === true) {
            ctx.consumed = true;
          }
        } else {
          // Verbose trace to help debugging WHY Fate did not apply.
          if (ctx.enabled === true && ctx.fateBonus > 0) {
            debug("Fate context present but not applied on this assignment", {
              origin,
              attemptedValue: v,
              hasMeaningfulOrigin,
              isMeaningfulAssignment,
              consumed: ctx.consumed,
            });
          }
        }

        this[storageKey] = v;
      },
    });

    proto[marker] = true;
    info("Patched DiceRollContainer.numDices accessor to support Fate dice bonus");
  } catch (err) {
    error("Failed to register DiceRollContainer Fate patch", err);
  }
}
