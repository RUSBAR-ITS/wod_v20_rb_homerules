import { MODULE_ID } from "../constants/module-id.js";
import { debugNs } from "../logger/ns.js";

const { debug, info, warn, error } = debugNs("items:img");

/**
 * The core default Item icon used when no image is set.
 * Foundry may also temporarily apply this during document creation.
 */
const CORE_DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";

/**
 * WoD system default items icon directory.
 *
 * Root cause (verified in the system repository):
 * - WoDItem._onCreate() computes a type-based image via a private _getImage() and then
 *   unconditionally updates the created Item with that img.
 * - WoDItem._onUpdate() overwrites Power item images when the current image starts with
 *   `systems/worldofdarkness/`.
 *
 * This makes icons coming from compendiums (or drag-and-drop to Actors) appear to
 * "disappear" and be replaced by system defaults.
 */
const WOD_SYSTEM_DEFAULT_ITEMS_IMG_PREFIX = "systems/worldofdarkness/assets/img/items/";

/**
 * Local flag key where we store the last known non-fallback image path.
 */
const FLAG_KEY = "sourceImg";

/**
 * Option marker to avoid recursion when we call Item.update from inside hooks/patches.
 */
const INTERNAL_UPDATE_OPT = `${MODULE_ID}.preserveImg`;

/**
 * Register hooks and runtime patches which preserve item icons.
 */
export function registerPreserveItemImagesHooks() {
  // Avoid double-registration in case of hot reload.
  const marker = `${MODULE_ID}.itemsImgHooksRegistered`;
  if (globalThis[marker] === true) return;
  globalThis[marker] = true;

  // Patch system item class first, so the "overwrite" happens less often.
  patchWoDItemImageBehavior();

  // 1) Item creation (world items + embedded items).
  Hooks.on("preCreateItem", (document, data) => {
    try {
      rememberImgOnCreate(data);
    } catch (err) {
      error("preCreateItem failed", err);
    }
  });

  // 2) Embedded batch creation path (drag/drop to Actor usually goes here).
  Hooks.on("preCreateEmbeddedDocuments", (parent, collection, documents, data) => {
    try {
      if (collection !== "Item") return;
      if (!Array.isArray(data)) return;
      for (const d of data) rememberImgOnCreate(d);
    } catch (err) {
      error("preCreateEmbeddedDocuments failed", err);
    }
  });

  /**
   * 3) Remember custom img on updates.
   *
   * There are two important cases:
   * - User (or some module) sets a new custom icon => store it in flags.
   * - System overwrites a custom icon with a fallback => store the previous custom icon so we can restore.
   */
  Hooks.on("preUpdateItem", (document, changes, options) => {
    try {
      if (!changes || typeof changes !== "object") return;
      if (!Object.prototype.hasOwnProperty.call(changes, "img")) return;

      const nextImg = changes.img;
      const currentImg = document?.img;

      // Case A: user sets a custom icon -> remember it.
      if (isCustomImg(nextImg)) {
        foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAG_KEY}`, normalizeImg(nextImg));
        debug("preUpdateItem: remembered new custom img path", {
          uuid: document?.uuid,
          from: normalizeImg(currentImg),
          to: normalizeImg(nextImg),
        });
        return;
      }

      // Case B: something overwrites to fallback -> remember previous custom icon.
      if (isFallbackImg(nextImg) && isCustomImg(currentImg)) {
        foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAG_KEY}`, normalizeImg(currentImg));
        debug("preUpdateItem: remembered previous img before fallback overwrite", {
          uuid: document?.uuid,
          from: normalizeImg(currentImg),
          to: normalizeImg(nextImg),
        });
      }
    } catch (err) {
      error("preUpdateItem failed", err);
    }
  });

  // 4) After create: if img got replaced with fallback/default, restore from flags.
  Hooks.on("createItem", async (document, options) => {
    try {
      await restoreIfFallback(document, options);
    } catch (err) {
      error("createItem restore failed", err);
    }
  });

  // 5) After update: if img got replaced with fallback/default, restore from flags.
  Hooks.on("updateItem", async (document, changes, options) => {
    try {
      if (!changes || !Object.prototype.hasOwnProperty.call(changes, "img")) return;
      await restoreIfFallback(document, options);
    } catch (err) {
      error("updateItem restore failed", err);
    }
  });

  // 6) Extra safety net for embedded batch creation.
  Hooks.on("createEmbeddedDocuments", async (parent, collection, documents, data, options) => {
    try {
      if (collection !== "Item") return;
      if (!Array.isArray(documents)) return;
      for (const doc of documents) await restoreIfFallback(doc, options);
    } catch (err) {
      error("createEmbeddedDocuments restore failed", err);
    }
  });

  info("Registered preserve-item-images hooks");
}

/**
 * Remember a non-fallback image path on creation by storing it in flags.
 * Works on raw creation data (not yet a Document instance).
 */
function rememberImgOnCreate(data) {
  if (!data || typeof data !== "object") return;

  const img = normalizeImg(data.img);
  if (!isCustomImg(img)) return;

  foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAG_KEY}`, img);
  debug("preCreateItem: remembered custom img path", { img });
}

/**
 * Restore a custom image if the current image is a fallback/default.
 */
async function restoreIfFallback(item, options) {
  if (!item) return;

  // Guard: do not react to our own internal updates.
  if (options?.[INTERNAL_UPDATE_OPT] === true) return;

  const saved = normalizeImg(item.getFlag?.(MODULE_ID, FLAG_KEY));
  if (!isCustomImg(saved)) return;

  const currentImg = normalizeImg(item.img);

  // Restore only when the system (or something else) replaced icon with a fallback/default.
  if (!isFallbackImg(currentImg)) {
    debug("restoreIfFallback: skipping restore (not a fallback img)", { uuid: item.uuid, currentImg, saved });
    return;
  }

  if (currentImg === saved) return;

  debug("Restoring item img", { uuid: item.uuid, from: currentImg, to: saved });

  await item.update(
    { img: saved },
    {
      [INTERNAL_UPDATE_OPT]: true,
      render: false,
      diff: true,
    }
  );
}

/**
 * Patch the WoD system's Item document behavior in runtime.
 *
 * We cannot edit system code, so we wrap/replace the parts that overwrite images.
 * This reduces the amount of restoration work needed and avoids update ping-pong.
 */
function patchWoDItemImageBehavior() {
  try {
    const ItemClass = CONFIG?.Item?.documentClass;
    if (!ItemClass || !ItemClass.prototype) {
      warn("patchWoDItemImageBehavior: CONFIG.Item.documentClass is missing");
      return;
    }

    // Only patch WoD item class. We keep this check loose but safe.
    const className = String(ItemClass.name || "");
    if (!className.toLowerCase().includes("wod")) {
      // If system renamed the class, we still might be on WoD. In that case, patch only if
      // the class has the suspicious behavior markers (update-on-create and Power image overwrite).
      // We keep it conservative: do nothing if we are not confident.
      warn("patchWoDItemImageBehavior: Item document class name does not look like WoD, skipping", { className });
      return;
    }

    // Patch _onCreate: keep provided custom icons, apply default only when missing/fallback.
    if (typeof ItemClass.prototype._onCreate === "function") {
      const originalOnCreate = ItemClass.prototype._onCreate;

      ItemClass.prototype._onCreate = async function patchedOnCreate(data, options, userId) {
        // If this is our internal update call, let original run untouched.
        if (options?.[INTERNAL_UPDATE_OPT] === true) {
          return originalOnCreate.call(this, data, options, userId);
        }

        const providedImg = normalizeImg(data?.img);

        // Case 1: custom icon is already provided by compendium/drag-drop => KEEP IT.
        // We still want base Foundry behavior, so call Item.prototype._onCreate instead of system override.
        if (isCustomImg(providedImg)) {
          debug("systemPatch:_onCreate keeping provided custom icon", { uuid: this.uuid, providedImg });

          // Call Foundry base implementation, skipping WoD system override which overwrites img.
          await globalThis.Item.prototype._onCreate.call(this, data, options, userId);

          // Ensure the flag exists even if preCreate didn't run (paranoia).
          try {
            await this.setFlag(MODULE_ID, FLAG_KEY, providedImg);
          } catch (e) {
            // Not fatal.
            warn("systemPatch:_onCreate setFlag failed", e);
          }
          return;
        }

        // Case 2: no custom icon => allow original behavior, but we ALSO harden it:
        // if original overwrote to a system default, it's fine.
        await originalOnCreate.call(this, data, options, userId);

        // Additional hardening: if original left core default and we can compute a system default, apply it.
        // (Keeps system UX consistent even if upstream code changes.)
        const currentImg = normalizeImg(this.img);
        if (isCoreDefaultImg(currentImg)) {
          const sysImg = normalizeImg(getWoDSystemDefaultImg(this));
          if (sysImg) {
            debug("systemPatch:_onCreate applying system default icon (hardening)", {
              uuid: this.uuid,
              from: currentImg,
              to: sysImg,
            });
            await this.update(
              { img: sysImg },
              {
                [INTERNAL_UPDATE_OPT]: true,
                render: false,
                diff: true,
              }
            );
          }
        }
      };

      info("patchWoDItemImageBehavior: patched ItemClass._onCreate");
    } else {
      warn("patchWoDItemImageBehavior: ItemClass._onCreate is not a function");
    }

    // Patch _onUpdate: only overwrite Power icons when current icon is a SYSTEM DEFAULT icon (not just any system path).
    if (typeof ItemClass.prototype._onUpdate === "function") {
      ItemClass.prototype._onUpdate = async function patchedOnUpdate(updateData, options, user) {
        // Always run Foundry base behavior first.
        await globalThis.Item.prototype._onUpdate.call(this, updateData, options, user);

        // Guard recursion.
        if (options?.[INTERNAL_UPDATE_OPT] === true) return;

        let updated = false;

        try {
          // WoD system only had special behavior for Power items.
          const type = String(this.type || "");
          if (type === "Power") {
            const currentImg = normalizeImg(this.img);

            // Only treat icons inside the system default directory as \"fallback\".
            // If user chose a custom icon even under systems/worldofdarkness/, do not overwrite it.
            if (isWoDSystemDefaultImg(currentImg)) {
              const sysImg = normalizeImg(getWoDSystemDefaultImg(this));
              if (sysImg && currentImg !== sysImg) {
                debug("systemPatch:_onUpdate updating Power icon to computed system default", {
                  uuid: this.uuid,
                  from: currentImg,
                  to: sysImg,
                });
                updated = true;
                await this.update(
                  { img: sysImg },
                  {
                    [INTERNAL_UPDATE_OPT]: true,
                    render: false,
                    diff: true,
                  }
                );
              }
            }
          }

          // Preserve original system behavior that clears copyFile flag.
          const copyFile = this?.flags?.copyFile;
          if (copyFile !== undefined && copyFile !== null) {
            debug("systemPatch:_onUpdate clearing flags.copyFile", { uuid: this.uuid });
            updated = true;
            await this.update(
              { "flags.copyFile": null },
              {
                [INTERNAL_UPDATE_OPT]: true,
                render: false,
                diff: true,
              }
            );
          }

          // If nothing updated, do nothing.
          if (!updated) return;
        } catch (err) {
          // Avoid spamming UI from module code; keep it in logs.
          error("systemPatch:_onUpdate failed", err);
        }
      };

      info("patchWoDItemImageBehavior: patched ItemClass._onUpdate");
    } else {
      warn("patchWoDItemImageBehavior: ItemClass._onUpdate is not a function");
    }
  } catch (err) {
    error("patchWoDItemImageBehavior failed", err);
  }
}

/**
 * Compute WoD system default icon for a given item.
 *
 * This is a verbatim, defensive re-implementation of the system's private _getImage()
 * logic (because we can't import it and can't rely on its existence).
 *
 * IMPORTANT: This function MUST return only system default icons (the ones inside
 * systems/worldofdarkness/assets/img/items/...). It must never return user custom paths.
 */
function getWoDSystemDefaultImg(item) {
  try {
    const type = String(item?.type ?? "");
    const sys = item?.system ?? {};
    const systemType = String(sys?.type ?? "");
    const game = String(sys?.game ?? "");
    const isNatural = Boolean(sys?.isnatural);

    if (type === "Armor") return "systems/worldofdarkness/assets/img/items/armor.svg";
    if (type === "Fetish") return "systems/worldofdarkness/assets/img/items/fetish.svg";

    if (type === "Melee Weapon" && isNatural) return "systems/worldofdarkness/assets/img/items/naturalweapons.svg";
    if (type === "Melee Weapon" && !isNatural) return "systems/worldofdarkness/assets/img/items/meleeweapons.svg";

    if (type === "Ranged Weapon") return "systems/worldofdarkness/assets/img/items/rangedweapons.svg";
    if (type === "Feature") return "systems/worldofdarkness/assets/img/items/feature.svg";
    if (type === "Experience") return "systems/worldofdarkness/assets/img/items/feature.svg";

    if (type === "Power") {
      if (systemType === "wod.types.discipline" || systemType === "wod.types.disciplinepath") {
        return "systems/worldofdarkness/assets/img/items/mainpower_vampire.svg";
      }

      if (
        systemType === "wod.types.disciplinepower" ||
        systemType === "wod.types.disciplinepathpower" ||
        systemType === "wod.types.combination"
      ) {
        return "systems/worldofdarkness/assets/img/items/power_vampire.svg";
      }

      if (systemType === "wod.types.ritual" && game === "vampire") {
        return "systems/worldofdarkness/assets/img/items/ritual_vampire.svg";
      }

      if (systemType === "wod.types.art") return "systems/worldofdarkness/assets/img/items/mainpower_changeling.svg";
      if (systemType === "wod.types.artpower") return "systems/worldofdarkness/assets/img/items/power_changeling.svg";

      if (systemType === "wod.types.edge") return "systems/worldofdarkness/assets/img/items/mainpower_hunter.svg";
      if (systemType === "wod.types.edgepower") return "systems/worldofdarkness/assets/img/items/power_hunter.svg";

      if (systemType === "wod.types.lore") return "systems/worldofdarkness/assets/img/items/mainpower_demon.svg";
      if (systemType === "wod.types.lorepower") return "systems/worldofdarkness/assets/img/items/power_demon.svg";

      if (systemType === "wod.types.arcanoi" || systemType === "wod.types.stain" || systemType === "wod.types.horror") {
        return "systems/worldofdarkness/assets/img/items/mainpower_wraith.svg";
      }

      if (systemType === "wod.types.arcanoipower") return "systems/worldofdarkness/assets/img/items/power_wraith.svg";

      if (systemType === "wod.types.hekau") return "systems/worldofdarkness/assets/img/items/mainpower_mummy.svg";
      if (systemType === "wod.types.hekaupower") return "systems/worldofdarkness/assets/img/items/power_mummy.svg";

      if (systemType === "wod.types.exaltedcharm" || systemType === "wod.types.exaltedsorcery") {
        return "systems/worldofdarkness/assets/img/items/power_exalted.svg";
      }

      if (systemType === "wod.types.numina") return "systems/worldofdarkness/assets/img/items/mainpower_mage.svg";
      if (systemType === "wod.types.numinapower") return "systems/worldofdarkness/assets/img/items/power_mage.svg";

      if (systemType === "wod.types.ritual" && game === "demon") {
        return "systems/worldofdarkness/assets/img/items/ritual_demon.svg";
      }

      if (systemType === "wod.types.gift") return "systems/worldofdarkness/assets/img/items/power_werewolf.svg";
      if (systemType === "wod.types.rite") return "systems/worldofdarkness/assets/img/items/ritual_werewolf.svg";

      return "systems/worldofdarkness/assets/img/items/power.svg";
    }

    if (type === "Rote") return "systems/worldofdarkness/assets/img/items/rote_mage.svg";

    return "";
  } catch (err) {
    error("getWoDSystemDefaultImg failed", err);
    return "";
  }
}

function normalizeImg(img) {
  if (!img || typeof img !== "string") return "";
  return img.startsWith("/") ? img.slice(1) : img;
}

function isCoreDefaultImg(img) {
  if (!img) return true;
  return img === CORE_DEFAULT_ITEM_ICON || img.startsWith("icons/");
}

function isWoDSystemDefaultImg(img) {
  if (!img) return true;
  const normalized = normalizeImg(img);
  return normalized.startsWith(WOD_SYSTEM_DEFAULT_ITEMS_IMG_PREFIX);
}

function isFallbackImg(img) {
  if (!img) return true;
  const normalized = normalizeImg(img);
  return isCoreDefaultImg(normalized) || isWoDSystemDefaultImg(normalized);
}

function isCustomImg(img) {
  if (!img || typeof img !== "string") return false;
  const normalized = normalizeImg(img);
  if (isFallbackImg(normalized)) return false;
  return true;
}
