import { debugNs } from "../logger/ns.js";
import { FATE_UI } from "../constants/fate-ui.js";
import { FATE_DATA } from "../constants/fate-data.js";
import { FATE_RULES } from "../constants/fate-rules.js";
import { syncFateUi } from "./sync-fate-ui.js";
import { openFateRollDialog } from "./open-fate-roll-dialog.js";

const { debug, info, warn, error } = debugNs("fate:clicks");

const MARKER_ATTR = FATE_UI.MARKER_ATTR;
const MARKER_VALUE = FATE_UI.MARKER_VALUE;

/**
 * The system helper `getGetStatArea` renders each dot/square as `.resource-value-step`
 * inside a parent element which contains `data-name="advantages.<key>.<field>"`.
 *
 * We use that `data-name` to decide whether the click updates:
 * - permanent row (dots)
 * - temporary row (squares)
 *
 * This is more stable than relying on CSS classes that may change upstream.
 */
function getNameHolder(stepEl) {
  if (!stepEl?.closest) return null;
  return stepEl.closest("[data-name]");
}

/**
 * Convert a helper-level `data-name` (e.g. "advantages.fate.permanent")
 * into an Actor update path (e.g. "system.advantages.fate.permanent").
 */
function toSystemPath(dataName) {
  if (!dataName) return null;
  return `${FATE_DATA.SYSTEM_PREFIX}${dataName}`;
}

/**
 * Clamp numeric value into [min, max].
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Fate "noability" rolls in the upstream system read dice pool from:
 *   actor.system.advantages.fate.roll
 *
 * To control the dice pool policy, we keep `.roll` synchronized with either:
 * - permanent (willpower-like; recommended)
 * - temporary (if your rules say to roll remaining points)
 *
 * The choice is controlled by `FATE_RULES.ROLL_SOURCE`.
 */
function computeRoll(permanent, temporary) {
  return FATE_RULES.ROLL_SOURCE === "temporary" ? temporary : permanent;
}

/**
 * Bind all Fate-related click handlers.
 *
 * Important implementation notes:
 * - We bind only inside our injected Fate wrapper (identified by MARKER_ATTR).
 * - We delegate events to keep bindings stable across re-renders.
 * - We use stopImmediatePropagation() to prevent upstream sheet handlers from
 *   swallowing Fate clicks (some upstream handlers gate on dataset.type).
 *
 * @param {ActorSheet} app
 * @param {JQuery} html
 */
export function bindFateClicks(app, html) {
  try {
    // Scope everything to our injected Fate UI wrapper
    // to avoid collisions with upstream stat blocks.
    const root = html.find(`[${MARKER_ATTR}="${MARKER_VALUE}"]`);
    if (root.length === 0) return;

    /**
     * 1) Headline click -> open upstream system `DialogGeneralRoll`
     * configured as:
     * - type = "noability"
     * - attributeKey = "fate"
     *
     * We do NOT rely on upstream `.vrollable` click handlers because:
     * - the helper may set `data-type` to something not matching actor type,
     * - upstream sheet code may ignore the click based on dataset.type checks.
     *
     * Therefore we handle it here and open the upstream dialog directly.
     */
    root
      .off(`click.${FATE_UI.CLICK_NAMESPACE}`, FATE_UI.SELECTORS.fateHeadline)
      .on(
        `click.${FATE_UI.CLICK_NAMESPACE}`,
        FATE_UI.SELECTORS.fateHeadline,
        async (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();

          const actor = app.actor;
          if (!actor) return;

          debug("Fate headline click", { actorId: actor.id, actorType: actor.type });
          await openFateRollDialog(actor);
        }
      );

    /**
     * 2) Resource step click -> update Fate permanent/temporary values.
     *
     * The system helper provides `data-index` (0-based) for each step.
     * We translate that to a 1-based value:
     *   rawValue = index + 1
     *
     * Toggle behavior:
     * - If you click the currently selected value, we decrease it by 1
     *   so you can reach 0 without needing a separate control.
     *
     * Invariants:
     * - permanent is clamped to [0..max]
     * - temporary is clamped to [0..permanent]
     * - roll is always kept in sync with computeRoll(permanent, temporary)
     */
    root
      .off(`click.${FATE_UI.CLICK_NAMESPACE}`, FATE_UI.SELECTORS.resourceStep)
      .on(
        `click.${FATE_UI.CLICK_NAMESPACE}`,
        FATE_UI.SELECTORS.resourceStep,
        async (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();

          const stepEl = /** @type {HTMLElement} */ (event.currentTarget);

          const index = Number(stepEl.dataset.index);
          if (!Number.isFinite(index)) return;

          // Determine which row the step belongs to via its closest data-name parent.
          const nameHolder = getNameHolder(stepEl);
          const dataName = nameHolder?.dataset?.name;

          // We keep a defensive conversion (even though we normally update via PATH_BASE_SYSTEM),
          // because it helps logging and keeps fallback behavior robust.
          const fieldPath = toSystemPath(dataName);
          if (!fieldPath) {
            warn("Missing data-name for fate step; cannot update.");
            return;
          }

          const rawValue = index + 1;

          // Current Fate values from the actor (safe defaults provided by rules).
          const current = app.actor?.system?.advantages?.fate ?? {};
          const currentMax = Number(current.max ?? FATE_RULES.DEFAULTS.max);
          const currentPerm = Number(current.permanent ?? FATE_RULES.DEFAULTS.permanent);
          const currentTemp = Number(current.temporary ?? FATE_RULES.DEFAULTS.temporary);

          /** @type {Record<string, number>} */
          const update = {};

          if (dataName?.endsWith(".permanent")) {
            /**
             * Permanent row:
             * - click dot N => permanent becomes N
             * - click same dot N again => permanent becomes N-1
             */
            let nextPerm = rawValue;
            if (rawValue === currentPerm) nextPerm = rawValue - 1;

            nextPerm = clamp(nextPerm, 0, currentMax);
            update[`${FATE_DATA.PATH_BASE_SYSTEM}.permanent`] = nextPerm;

            /**
             * If permanent is lowered below current temporary,
             * shrink temporary to maintain invariant.
             */
            const nextTemp = clamp(currentTemp, 0, nextPerm);
            if (nextTemp !== currentTemp) {
              update[`${FATE_DATA.PATH_BASE_SYSTEM}.temporary`] = nextTemp;
            }

            // Keep dice pool in sync with chosen policy.
            update[`${FATE_DATA.PATH_BASE_SYSTEM}.roll`] = clamp(
              computeRoll(nextPerm, nextTemp),
              0,
              currentMax
            );
          } else if (dataName?.endsWith(".temporary")) {
            /**
             * Temporary row:
             * - click square N => temporary becomes N
             * - click same square N again => temporary becomes N-1
             * - temporary is clamped by permanent
             */
            let nextTemp = rawValue;
            if (rawValue === currentTemp) nextTemp = rawValue - 1;

            nextTemp = clamp(nextTemp, 0, currentPerm);
            update[`${FATE_DATA.PATH_BASE_SYSTEM}.temporary`] = nextTemp;

            // Keep dice pool in sync with chosen policy.
            update[`${FATE_DATA.PATH_BASE_SYSTEM}.roll`] = clamp(
              computeRoll(currentPerm, nextTemp),
              0,
              currentMax
            );
          } else {
            /**
             * Defensive fallback:
             * This should not happen with the system helper output, but if it does
             * we still apply an update to the resolved field path and keep roll synced.
             */
            update[fieldPath] = clamp(rawValue, 1, currentMax);
            update[`${FATE_DATA.PATH_BASE_SYSTEM}.roll`] = clamp(
              computeRoll(currentPerm, currentTemp),
              0,
              currentMax
            );
          }

          debug("Fate click", { dataName, index, rawValue, update, actorId: app.actor?.id });

          try {
            // Update actor system data, then re-sync the UI to avoid any desync
            // between permanent/temporary rows after clamping.
            await app.actor.update(update);
            syncFateUi(root, app.actor);
          } catch (err) {
            error("Failed to update fate value", err);
          }
        }
      );

    info("Fate click handlers bound", { actorId: app.actor?.id });
  } catch (err) {
    error("Failed to bind fate clicks", err);
  }
}
