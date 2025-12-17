import { debugNs } from "../logger/ns.js";
import { FATE_UI } from "../constants/fate-ui.js";
import { FATE_DATA } from "../constants/fate-data.js";
import { syncFateUi } from "./sync-fate-ui.js";

const { debug, info, warn, error } = debugNs("fate:clicks");

const MARKER_ATTR = FATE_UI.MARKER_ATTR;
const MARKER_VALUE = FATE_UI.MARKER_VALUE;

function getNameHolder(stepEl) {
  if (!stepEl?.closest) return null;
  return stepEl.closest("[data-name]");
}

function toSystemPath(dataName) {
  if (!dataName) return null;
  return `${FATE_DATA.SYSTEM_PREFIX}${dataName}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function bindFateClicks(app, html) {
  try {
    const root = html.find(`[${MARKER_ATTR}="${MARKER_VALUE}"]`);
    if (root.length === 0) return;

    root
      .off(`click.${FATE_UI.CLICK_NAMESPACE}`, FATE_UI.SELECTORS.resourceStep)
      .on(`click.${FATE_UI.CLICK_NAMESPACE}`, FATE_UI.SELECTORS.resourceStep, async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const stepEl = /** @type {HTMLElement} */ (event.currentTarget);

        const index = Number(stepEl.dataset.index);
        if (!Number.isFinite(index)) return;

        const nameHolder = getNameHolder(stepEl);
        const dataName = nameHolder?.dataset?.name;
        const fieldPath = toSystemPath(dataName);
        if (!fieldPath) {
          warn("Missing data-name for fate step; cannot update.");
          return;
        }

        // 0-based index -> 1-based "value"
        // (e.g. clicking first dot yields rawValue=1)
        const rawValue = index + 1;

        const current = app.actor?.system?.advantages?.fate ?? {};
        const currentMax = Number(current.max ?? 10);
        const currentPerm = Number(current.permanent ?? 0);
        const currentTemp = Number(current.temporary ?? 0);

        /** @type {Record<string, number>} */
        const update = {};

        if (dataName?.endsWith(".permanent")) {
          /**
           * Permanent dots:
           * - Normal click sets permanent to rawValue (1..max)
           * - Toggle behavior: clicking the currently selected value decreases by 1
           *   (this is required to allow reaching 0 by clicking the first dot again)
           *
           * Examples:
           *   currentPerm=3, click dot #3 (rawValue=3) -> nextPerm=2
           *   currentPerm=1, click dot #1 (rawValue=1) -> nextPerm=0
           */
          let nextPerm = rawValue;
          if (rawValue === currentPerm) nextPerm = rawValue - 1;

          // Clamp permanent to 0..max (0 is allowed).
          nextPerm = clamp(nextPerm, 0, currentMax);
          update[`${FATE_DATA.PATH_BASE_SYSTEM}.permanent`] = nextPerm;

          /**
           * Temporary must always stay within 0..permanent.
           * If permanent shrinks below currentTemp, we also shrink temp.
           */
          const nextTemp = clamp(currentTemp, 0, nextPerm);
          if (nextTemp !== currentTemp) {
            update[`${FATE_DATA.PATH_BASE_SYSTEM}.temporary`] = nextTemp;
          }
        } else if (dataName?.endsWith(".temporary")) {
          /**
           * Temporary squares:
           * - Normal click sets temporary to rawValue
           * - Toggle behavior: clicking the currently selected value decreases by 1
           * - Temporary is limited by 0..permanent
           */
          let nextTemp = rawValue;
          if (rawValue === currentTemp) nextTemp = rawValue - 1;

          nextTemp = clamp(nextTemp, 0, currentPerm);
          update[`${FATE_DATA.PATH_BASE_SYSTEM}.temporary`] = nextTemp;
        } else {
          // Defensive fallback (shouldn't normally happen).
          update[fieldPath] = clamp(rawValue, 1, currentMax);
        }

        debug("Fate click", { dataName, index, rawValue, update, actorId: app.actor?.id });

        try {
          await app.actor.update(update);

          // Re-sync UI for BOTH rows so they never desync/overwrite each other.
          syncFateUi(root, app.actor);
        } catch (err) {
          error("Failed to update fate value", err);
        }
      });

    info("Fate click handlers bound", { actorId: app.actor?.id });
  } catch (err) {
    error("Failed to bind fate clicks", err);
  }
}
