import { MODULE_ID } from "../constants/module-id.js";
import { debugNs } from "../logger/ns.js";

const { debug, info, warn, error } = debugNs("items:img");

/**
 * The core default Item icon used when no image is set.
 * Foundry may also temporarily apply this during document creation.
 */
const CORE_DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";

/**
 * Local flag key where we store the last known custom image path.
 * This is intentionally a single value so it can be re-used across updates.
 */
const FLAG_KEY = "sourceImg";

/**
 * Some systems overwrite Item.img during creation / migration / type changes.
 * We:
 *  - remember custom img paths (preCreate/preUpdate)
 *  - re-apply them if the resulting document ends up with a fallback/default (create/update)
 */
export function registerPreserveItemImagesHooks() {
  // Avoid double-registration in case of hot reload.
  const marker = `${MODULE_ID}.itemsImgHooksRegistered`;
  if (globalThis[marker] === true) return;
  globalThis[marker] = true;

  // 1) Item creation (world items + embedded items).
  Hooks.on("preCreateItem", (document, data, options, userId) => {
    try {
      rememberImgOnCreate(data);
    } catch (err) {
      error("preCreateItem failed", err);
    }
  });

  // 2) Embedded batch creation path (drag/drop to Actor usually goes here).
  Hooks.on("preCreateEmbeddedDocuments", (parent, collection, documents, data, options, userId) => {
    try {
      if (collection !== "Item") return;
      if (!Array.isArray(data)) return;
      for (const d of data) rememberImgOnCreate(d);
    } catch (err) {
      error("preCreateEmbeddedDocuments failed", err);
    }
  });

  // 3) Remember the *previous* custom img right before an update overwrites it.
  Hooks.on("preUpdateItem", (document, changes, options, userId) => {
    try {
      if (!changes) return;

      // If the update does not touch img, we don't care.
      if (!Object.prototype.hasOwnProperty.call(changes, "img")) return;

      const nextImg = changes.img;
      if (!isDefaultImg(nextImg)) return;

      const currentImg = document?.img;
      if (!isCustomImg(currentImg)) return;

      // Persist the previous custom image into flags so we can restore it later.
      foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAG_KEY}`, currentImg);
      debug("preUpdateItem: remembered updated img path", { currentImg, nextImg, uuid: document?.uuid });
    } catch (err) {
      error("preUpdateItem failed", err);
    }
  });

  // 4) After create: if img got replaced with fallback/default, restore from flags.
  Hooks.on("createItem", async (document, options, userId) => {
    try {
      await restoreIfDefault(document, options);
    } catch (err) {
      error("createItem restore failed", err);
    }
  });

  // 5) After update: if img got replaced with fallback/default, restore from flags.
  Hooks.on("updateItem", async (document, changes, options, userId) => {
    try {
      if (!changes || !Object.prototype.hasOwnProperty.call(changes, "img")) return;
      await restoreIfDefault(document, options);
    } catch (err) {
      error("updateItem restore failed", err);
    }
  });

  // 6) Extra safety net for embedded batch creation.
  Hooks.on("createEmbeddedDocuments", async (parent, collection, documents, data, options, userId) => {
    try {
      if (collection !== "Item") return;
      if (!Array.isArray(documents)) return;
      for (const doc of documents) await restoreIfDefault(doc, options);
    } catch (err) {
      error("createEmbeddedDocuments restore failed", err);
    }
  });

  info("Registered preserve-item-images hooks");
}

/**
 * Remember a custom image path on creation by storing it in flags.
 * Works on raw creation data (not yet a Document instance).
 */
function rememberImgOnCreate(data) {
  if (!data || typeof data !== "object") return;
  const img = data.img;
  if (!isCustomImg(img)) return;

  // Store in flags so it survives ID changes and is available after creation.
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAG_KEY}`, img);
  debug("preCreateItem: remembered custom img path", { img });
}

/**
 * Restore a custom image if the current image is a fallback/default.
 * We deliberately use a guarded update to avoid infinite loops.
 */
async function restoreIfDefault(item, options) {
  if (!item) return;

  // Guard: do not react to our own internal updates.
  if (options?.[`${MODULE_ID}.preserveImg`] === true) return;

  const saved = item.getFlag?.(MODULE_ID, FLAG_KEY);
  if (!isCustomImg(saved)) return;

  const currentImg = item.img;
  if (!shouldRestoreImg({ currentImg, saved })) return;

  debug("Restoring item img", { uuid: item.uuid, from: currentImg, to: saved });
  await item.update(
    { img: saved },
    {
      // Prevent loops and reduce noise.
      [`${MODULE_ID}.preserveImg`]: true,
      render: false,
      diff: true,
    }
  );
}

function isDefaultImg(img) {
  if (!img || typeof img !== "string") return true;
  return img === CORE_DEFAULT_ITEM_ICON || img.startsWith("icons/");
}

/**
 * Decide whether we should re-apply the saved img.
 *
 * We restore when:
 * - the current image is the core default icon, OR
 * - the current image is a known system fallback icon (systems/worldofdarkness/...) AND the saved image
 *   comes from a module/world path.
 *
 * This avoids fighting normal user changes while still fixing the primary issue:
 * system workflows overriding custom icons during create/update.
 */
function shouldRestoreImg({ currentImg, saved }) {
  if (!currentImg || typeof currentImg !== "string") return true;
  if (currentImg === saved) return false;

  if (isDefaultImg(currentImg)) return true;

  // The WoD system frequently applies its own default icons per item type.
  // When we have a saved module/world icon, we treat that system icon as a fallback and restore.
  const normalized = currentImg.startsWith("/") ? currentImg.slice(1) : currentImg;
  const isWoDSystemImg = normalized.startsWith("systems/worldofdarkness/");
  const savedNorm = saved.startsWith("/") ? saved.slice(1) : saved;
  const savedIsExternal = savedNorm.startsWith("modules/") || savedNorm.startsWith("worlds/") || savedNorm.startsWith("data/");
  if (isWoDSystemImg && savedIsExternal) return true;

  return false;
}

function isCustomImg(img) {
  if (!img || typeof img !== "string") return false;
  if (isDefaultImg(img)) return false;

  // Most common storage locations for module/system assets.
  if (img.startsWith("modules/")) return true;
  if (img.startsWith("systems/")) return true;

  // Some users store in Data/ or world assets.
  if (img.startsWith("worlds/")) return true;
  if (img.startsWith("data/")) return true;

  // Fallback: treat any other non-default string as custom.
  return true;
}
