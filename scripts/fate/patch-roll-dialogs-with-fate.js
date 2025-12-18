import { debugNs } from "../logger/ns.js";
import { SYSTEM_IDS } from "../constants/system-ids.js";
import { shouldEnableFate } from "./should-enable-fate.js";
import { getFatePermanent } from "./get-fate-permanent.js";
import { USE_FATE_FIELD_NAME } from "./inject-fate-use-checkbox.js";
import { setNextFateContext, clearFateContext } from "./patch-dice-container-with-fate.js";

const { debug, info, warn, error } = debugNs("fate:patch:dialogs");

/**
 * Register prototype patches for upstream roll dialogs so they:
 * - persist `useFate` form state into `this.object.useFate`
 * - set a one-shot Fate context before executing the actual roll method
 *
 * IMPORTANT:
 * - We do not modify system files.
 * - Patches are idempotent and guarded by per-method markers.
 */
export async function registerRollDialogFatePatches() {
  try {
    await patchDialog(SYSTEM_IDS.DIALOG_GENERAL_ROLL_MODULE_PATH, "DialogGeneralRoll", "_generalRoll");
    await patchDialog(SYSTEM_IDS.DIALOG_SOAK_MODULE_PATH, "DialogSoakRoll", "_soakRoll");
    await patchDialog(SYSTEM_IDS.DIALOG_WEAPON_MODULE_PATH, "DialogWeapon", "_rollAttack", {
      isWeapon: true,
    });
    await patchDialog(SYSTEM_IDS.DIALOG_POWER_MODULE_PATH, "DialogPower", "_rollPower");
    await patchDialog(SYSTEM_IDS.DIALOG_ITEM_MODULE_PATH, "DialogItem", "_rollPower");
    await patchDialog(SYSTEM_IDS.DIALOG_TRAIT_MODULE_PATH, "DialogRoll", "_rollPower");
    await patchDialog(SYSTEM_IDS.DIALOG_ARETE_MODULE_PATH, "DialogAreteCasting", "_castSpell");
    await patchDialog(SYSTEM_IDS.DIALOG_FRENZY_MODULE_PATH, "DialogCheckFrenzy", "_checkFrenzy");

    info("Registered Fate patches for upstream roll dialogs");
  } catch (err) {
    error("Failed to register roll dialog Fate patches", err);
  }
}

/**
 * Patch a single dialog class from an upstream module.
 *
 * @param {string} modulePath Upstream module path.
 * @param {string} className Exported class name.
 * @param {string} rollMethodName Method that triggers DiceRoller.
 * @param {{isWeapon?: boolean}=} options
 */
async function patchDialog(modulePath, className, rollMethodName, options = {}) {
  const { isWeapon = false } = options;

  try {
    const mod = await import(modulePath);
    const DialogClass = mod?.[className];

    if (!DialogClass) {
      warn("Upstream dialog class not found; skipping patch", { modulePath, className });
      return;
    }

    const proto = DialogClass.prototype;

    // Patch _updateObject to persist checkbox state on this.object.
    if (typeof proto._updateObject === "function") {
      patchUpdateObject(proto, className);
    } else {
      warn("Dialog has no _updateObject; checkbox state may not persist", { className });
    }

    // Patch roll method to set Fate context for the next container assignment.
    if (typeof proto[rollMethodName] === "function") {
      patchRollMethod(proto, className, rollMethodName, { isWeapon });
    } else {
      warn("Dialog roll method not found; skipping roll patch", { className, rollMethodName });
    }

    debug("Patched dialog", { className, rollMethodName });
  } catch (err) {
    error("Failed to patch dialog", { modulePath, className, rollMethodName, err });
  }
}

/**
 * Wrap `_updateObject` to capture the Use Fate checkbox state.
 *
 * @param {object} proto
 * @param {string} className
 */
function patchUpdateObject(proto, className) {
  const marker = `__rusbarFatePatched_updateObject_${className}__`;
  if (proto[marker] === true) return;

  const original = proto._updateObject;

  proto._updateObject = async function patchedUpdateObject(event, formData) {
    try {
      // Gate by setting: if Fate is disabled, force off to avoid stale state.
      if (shouldEnableFate() !== true) {
        if (this?.object) this.object.useFate = false;
        return await original.call(this, event, formData);
      }

      const checked = formData?.[USE_FATE_FIELD_NAME] === true || formData?.[USE_FATE_FIELD_NAME] === "on";
      if (this?.object) this.object.useFate = checked === true;

      debug("Captured Use Fate form state", { className, checked });
    } catch (err) {
      warn("Failed to capture Use Fate form state", { className, err });
      // Do not block upstream behavior.
    }

    return await original.call(this, event, formData);
  };

  proto[marker] = true;
  info("Patched _updateObject to store useFate", { className });
}

/**
 * Wrap the dialog roll method.
 *
 * @param {object} proto
 * @param {string} className
 * @param {string} rollMethodName
 * @param {{isWeapon:boolean}} options
 */
function patchRollMethod(proto, className, rollMethodName, { isWeapon }) {
  const marker = `__rusbarFatePatched_roll_${className}_${rollMethodName}__`;
  if (proto[marker] === true) return;

  const original = proto[rollMethodName];

  proto[rollMethodName] = async function patchedRollMethod(...args) {
    // Default behavior: do not affect the roll unless all gating passes.
    try {
      if (shouldEnableFate() !== true) {
        clearFateContext();
        return await original.apply(this, args);
      }

      const actor = this?.actor;
      const fatePermanent = getFatePermanent(actor);
      const useFate = this?.object?.useFate === true;

      // Exclusion: weapon dialog in explicit damage mode should not set fate context.
      if (isWeapon === true) {
        const weaponType = this?.object?.weaponType;
        if (weaponType === "Damage") {
          debug("Weapon dialog is in damage mode; skipping Fate context", { className, weaponType });
          clearFateContext();
          return await original.apply(this, args);
        }
      }

      if (useFate === true && fatePermanent > 0) {
        // Apply to the next DiceRollContainer.numDices assignment only.
        setNextFateContext({ fateBonus: fatePermanent });

        debug("Prepared Fate context for roll", {
          className,
          rollMethodName,
          actorId: actor?.id,
          fatePermanent,
        });
      } else {
        clearFateContext();
      }
    } catch (err) {
      warn("Failed to prepare Fate context; continuing without Fate", { className, rollMethodName, err });
      clearFateContext();
    }

    // Run upstream roll logic (this triggers container assignment -> our accessor patch applies).
    const result = await original.apply(this, args);

    // Cleanup: do not leak context to subsequent rolls.
    clearFateContext();

    return result;
  };

  proto[marker] = true;
  info("Patched roll method to apply Fate dice via container accessor", { className, rollMethodName });
}
