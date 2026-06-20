import { debugNs } from "../logger/ns.js";
import { SYSTEM_IDS } from "../constants/system-ids.js";
import { setPendingRollContext } from "./store.js";
import { createRollTraceId } from "./trace-id.js";

const { debug, info, warn, error } = debugNs("rollctx:patch:dialogs");

/**
 * Register prototype patches for upstream roll dialogs.
 *
 * Goal:
 * - Capture per-roll parameters (specialization / willpower / origin / difficulty)
 *   before the dialog triggers DiceRoller.
 * - Store those parameters as a one-shot pending roll context for the current user.
 *
 * Diagnostics:
 * - This file is the earliest point in the roll pipeline we control.
 * - We log *all* captured values here to correlate downstream behavior.
 *
 * IMPORTANT:
 * - We do NOT modify system files.
 * - We do NOT change roll logic (only capture + logs).
 * - Patches are idempotent and guarded by per-method markers.
 */
export async function registerRollDialogRollContextPatches() {
  try {
    await patchDialog(SYSTEM_IDS.DIALOG_GENERAL_ROLL_MODULE_PATH, "DialogGeneralRoll", "_generalRoll", {
      origin: "general",
      attributeSelector: (dialog) => dialog?.object?.attributeKey,
      difficultySelector: (dialog) => dialog?.object?.difficulty,
      specializedSelector: (dialog) => dialog?.object?.useSpeciality,
      willpowerSelector: (dialog) => dialog?.object?.useWillpower,
    });

    await patchDialog(SYSTEM_IDS.DIALOG_SOAK_MODULE_PATH, "DialogSoakRoll", "_soakRoll", {
      origin: "soak",
      attributeSelector: () => "stamina",
      difficultySelector: (dialog) => dialog?.object?.difficulty,
      specializedSelector: () => false,
      willpowerSelector: (dialog) => dialog?.object?.useWillpower,
    });

    await patchDialog(SYSTEM_IDS.DIALOG_WEAPON_MODULE_PATH, "DialogWeapon", "_rollAttack", {
      // The dialog itself decides between "attack" and "damage" based on weaponType.
      originSelector: (dialog) => (dialog?.object?.weaponType === "Damage" ? "damage" : "attack"),
      attributeSelector: (dialog) => dialog?.object?.dice1,
      difficultySelector: (dialog) => dialog?.object?.difficulty,
      specializedSelector: (dialog) => dialog?.object?.useSpeciality,
      willpowerSelector: (dialog) => dialog?.object?.useWillpower,
    });

    // Power / Item / Trait dialogs: share the same data contract.
    await patchDialog(SYSTEM_IDS.DIALOG_POWER_MODULE_PATH, "DialogPower", "_rollPower", {
      origin: "power",
      attributeSelector: (dialog) => dialog?.object?.dice1,
      difficultySelector: (dialog) => dialog?.object?.difficulty,
      specializedSelector: (dialog) => dialog?.object?.useSpeciality,
      willpowerSelector: (dialog) => dialog?.object?.useWillpower,
    });

    await patchDialog(SYSTEM_IDS.DIALOG_ITEM_MODULE_PATH, "DialogItem", "_rollPower", {
      origin: "item",
      attributeSelector: (dialog) => dialog?.object?.dice1,
      difficultySelector: (dialog) => dialog?.object?.difficulty,
      specializedSelector: (dialog) => dialog?.object?.useSpeciality,
      willpowerSelector: (dialog) => dialog?.object?.useWillpower,
    });

    await patchDialog(SYSTEM_IDS.DIALOG_TRAIT_MODULE_PATH, "DialogRoll", "_rollPower", {
      origin: "trait",
      attributeSelector: (dialog) => dialog?.object?.dice1,
      difficultySelector: (dialog) => dialog?.object?.difficulty,
      specializedSelector: (dialog) => dialog?.object?.useSpeciality,
      willpowerSelector: (dialog) => dialog?.object?.useWillpower,
    });

    await patchDialog(SYSTEM_IDS.DIALOG_ARETE_MODULE_PATH, "DialogAreteCasting", "_castSpell", {
      origin: "magic",
      attributeSelector: () => null,
      difficultySelector: (dialog) => dialog?.object?.totalDifficulty,
      specializedSelector: (dialog) => dialog?.object?.useSpeciality,
      willpowerSelector: (dialog) => dialog?.object?.useWillpower,
    });

    await patchDialog(SYSTEM_IDS.DIALOG_FRENZY_MODULE_PATH, "DialogCheckFrenzy", "_checkFrenzy", {
      origin: "frenzy",
      attributeSelector: () => null,
      difficultySelector: (dialog) => dialog?.object?.difficulty,
      specializedSelector: () => false,
      willpowerSelector: () => false,
    });

    info("Roll dialog roll context patches registered");
  } catch (err) {
    error("Failed to register roll dialog patches", { err });
  }
}

/**
 * Patch a roll method on an upstream dialog prototype.
 *
 * @param {string} modulePath System module path where the dialog class is exported.
 * @param {string} className Dialog class name.
 * @param {string} rollMethodName Prototype method name that triggers the roll.
 * @param {object} selectors Selector functions.
 */
async function patchDialog(modulePath, className, rollMethodName, selectors) {
  const marker = `__wodV20RbRollContextPatched__${rollMethodName}`;

  try {
    const mod = await import(modulePath);
    const DialogClass = mod?.[className];

    if (!DialogClass?.prototype) {
      warn("Dialog class not found; skipping patch", { modulePath, className, rollMethodName });
      return;
    }

    const proto = DialogClass.prototype;
    if (proto[marker]) {
      debug("Dialog roll method already patched; skipping", { className, rollMethodName });
      return;
    }

    const original = proto[rollMethodName];
    if (typeof original !== "function") {
      warn("Dialog roll method not found; skipping patch", { className, rollMethodName });
      return;
    }

    proto[rollMethodName] = async function (...args) {
      try {
        const userId = game?.user?.id ?? null;
        const actorId = this?.object?.actor?._id ?? this?.object?.actorId ?? this?.actor?.id ?? null;

        const origin =
          typeof selectors?.originSelector === "function"
            ? selectors.originSelector(this)
            : typeof selectors?.origin === "string"
              ? selectors.origin
              : null;

        const attribute = typeof selectors?.attributeSelector === "function" ? selectors.attributeSelector(this) : null;
        const difficulty = typeof selectors?.difficultySelector === "function" ? selectors.difficultySelector(this) : null;

        // NOTE: We do not normalize or reinterpret values here (no logic changes).
        // We only log raw values and what we store.
        const rawSpecialized =
          typeof selectors?.specializedSelector === "function" ? selectors.specializedSelector(this) : false;
        const rawWillpower =
          typeof selectors?.willpowerSelector === "function" ? selectors.willpowerSelector(this) : false;

        const isSpecialized = rawSpecialized === true;
        const useWillpower = rawWillpower === true;

        const rollTraceId = createRollTraceId(userId ?? undefined);

        const elementRoot = this?.element?.[0] ?? this?.element ?? null;
        const elementConnected = elementRoot && typeof elementRoot === "object" ? Boolean(elementRoot.isConnected) : null;

        if (userId) {
          // One-shot context for the next chat message.
          setPendingRollContext(userId, {
            rollTraceId,
            actorId,
            attribute,
            origin,
            difficulty,
            isSpecialized,
            useWillpower,
          });

          // Log *all* captured values (flat + raw) for diagnosis.
          debug("Prepared pending roll context", {
            rollTraceId,
            className,
            rollMethodName,
            userId,
            actorId,
            origin,
            attribute,
            difficulty,
            isSpecialized,
            useWillpower,
            raw: {
              specialized: rawSpecialized,
              willpower: rawWillpower,
            },
            dialog: {
              elementConnected,
              hasJqElement: Boolean(this?.element),
            },
          });
        } else {
          warn("No userId available while preparing pending roll context; skipping store write", {
            rollTraceId,
            className,
            rollMethodName,
            actorId,
            origin,
            attribute,
            difficulty,
            isSpecialized,
            useWillpower,
            raw: { specialized: rawSpecialized, willpower: rawWillpower },
          });
        }
      } catch (err) {
        // Never block upstream behavior.
        warn("Failed to prepare pending roll context; continuing without context", { className, rollMethodName, err });
      }

      return await original.apply(this, args);
    };

    proto[marker] = true;
    info("Patched dialog roll method for roll context", { className, rollMethodName });
  } catch (err) {
    warn("Failed to patch dialog roll method; skipping", { modulePath, className, rollName: rollMethodName, err });
  }
}
