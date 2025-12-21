import { debugNs } from "../logger/ns.js";
import { SYSTEM_IDS } from "../constants/system-ids.js";
import { setPendingRollContext } from "./store.js";

const { debug, info, warn, error } = debugNs("rollctx:patch:dialogs");

/**
 * Register prototype patches for upstream roll dialogs.
 *
 * Goal:
 * - Capture per-roll flags (specialization / willpower / origin / difficulty)
 *   before the dialog triggers DiceRoller.
 * - Store those flags as a one-shot pending roll context for the current user.
 *
 * IMPORTANT:
 * - We do NOT modify system files.
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
      // Arete casting does not set `powerRoll.attribute`, so auto-success capture is irrelevant.
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

    info("Registered roll context patches for upstream roll dialogs");
  } catch (err) {
    error("Failed to register roll context patches", err);
  }
}

/**
 * Patch a single dialog class from an upstream module.
 *
 * @param {string} modulePath
 * @param {string} className
 * @param {string} rollMethodName
 * @param {{
 *  origin?: string,
 *  originSelector?: (dialog:any)=>string,
 *  attributeSelector?: (dialog:any)=>string|null,
 *  difficultySelector?: (dialog:any)=>number|null,
 *  specializedSelector?: (dialog:any)=>boolean,
 *  willpowerSelector?: (dialog:any)=>boolean
 * }} selectors
 */
async function patchDialog(modulePath, className, rollMethodName, selectors) {
  try {
    const mod = await import(modulePath);
    const DialogClass = mod?.[className];

    if (!DialogClass) {
      warn("Upstream dialog class not found; skipping roll context patch", { modulePath, className });
      return;
    }

    const proto = DialogClass.prototype;

    if (typeof proto[rollMethodName] !== "function") {
      warn("Dialog roll method not found; skipping roll context patch", { className, rollMethodName });
      return;
    }

    patchRollMethod(proto, className, rollMethodName, selectors);
    debug("Patched dialog for roll context", { className, rollMethodName });
  } catch (err) {
    error("Failed to patch dialog for roll context", { modulePath, className, rollMethodName, err });
  }
}

function patchRollMethod(proto, className, rollMethodName, selectors) {
  const marker = `__rusbarHrPatched_rollctx_${className}_${rollMethodName}__`;
  if (proto[marker] === true) return;

  const original = proto[rollMethodName];

  proto[rollMethodName] = async function patchedRollMethod(...args) {
    try {
      const userId = game?.user?.id;
      if (userId) {
        const actor = this?.actor;
        const actorId = actor?.id ?? null;

        const origin =
          typeof selectors?.originSelector === "function"
            ? selectors.originSelector(this)
            : typeof selectors?.origin === "string"
              ? selectors.origin
              : null;

        const attribute = typeof selectors?.attributeSelector === "function" ? selectors.attributeSelector(this) : null;
        const difficulty = typeof selectors?.difficultySelector === "function" ? selectors.difficultySelector(this) : null;
        const isSpecialized =
          typeof selectors?.specializedSelector === "function" ? selectors.specializedSelector(this) === true : false;
        const useWillpower =
          typeof selectors?.willpowerSelector === "function" ? selectors.willpowerSelector(this) === true : false;

        // One-shot context for the next chat message.
        setPendingRollContext(userId, {
          actorId,
          attribute,
          origin,
          difficulty,
          isSpecialized,
          useWillpower,
        });

        debug("Prepared pending roll context", {
          className,
          rollMethodName,
          userId,
          actorId,
          origin,
          attribute,
          difficulty,
          isSpecialized,
          useWillpower,
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
}
