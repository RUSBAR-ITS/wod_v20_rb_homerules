import { debugNs } from "../logger/ns.js";
import { FATE_UI } from "../constants/fate-ui.js";
import { syncFateUi } from "./sync-fate-ui.js";

const { debug, warn, error } = debugNs("fate:render");

const MARKER_ATTR = FATE_UI.MARKER_ATTR;
const MARKER_VALUE = FATE_UI.MARKER_VALUE;

function removeExisting(html) {
  html.find(`[${MARKER_ATTR}="${MARKER_VALUE}"]`).remove();
}

/**
 * Find an insertion anchor in a robust way.
 *
 * Why:
 * - Some sheet parts may be conditionally rendered depending on active tab/content.
 * - We prefer inserting next to Willpower, but we fallback gracefully.
 *
 * @param {JQuery} html
 * @returns {JQuery|null}
 */
function findAnchor(html) {
  const s = FATE_UI.ANCHOR_SELECTORS;

  const wpTemp = html.find(s.willpowerTemp).first();
  if (wpTemp.length) return wpTemp.closest(FATE_UI.SELECTORS.sheetBoxContainer).length
    ? wpTemp.closest(FATE_UI.SELECTORS.sheetBoxContainer)
    : wpTemp;

  const wpPerm = html.find(s.willpowerPerm).first();
  if (wpPerm.length) return wpPerm.closest(FATE_UI.SELECTORS.sheetBoxContainer).length
    ? wpPerm.closest(FATE_UI.SELECTORS.sheetBoxContainer)
    : wpPerm;

  const wpAny = html.find(s.anyWillpower).first();
  if (wpAny.length) return wpAny.closest(FATE_UI.SELECTORS.sheetBoxContainer).length
    ? wpAny.closest(FATE_UI.SELECTORS.sheetBoxContainer)
    : wpAny;

  const inner = html.find(s.anyInnerArea).first();
  if (inner.length) return inner;

  return null;
}

export async function renderFateScale(app, html) {
  try {
    removeExisting(html);

    const anchor = findAnchor(html);
    if (!anchor) {
      warn("No suitable anchor found; cannot insert Fate scale.");
      return;
    }

    const fate = foundry.utils.duplicate(app.actor?.system?.advantages?.fate ?? {});

    const fateHtml = await renderTemplate(FATE_UI.TEMPLATE_PATH, {
      actor: app.actor,
      fate,
    });

    const wrapper = $(`<div ${MARKER_ATTR}="${MARKER_VALUE}"></div>`);
    wrapper.html(fateHtml);

    // If we anchored directly to willpower block/row -> insert after.
    // If we anchored to a generic container (inner-area) -> append at end.
    if (anchor.hasClass("sheet-inner-area")) {
      anchor.append(wrapper);
    } else {
      anchor.after(wrapper);
    }

    // Critical: initialize UI state for injected block (system initializer already ran earlier).
    syncFateUi(wrapper, app.actor);

    debug("Inserted fate scale", { actorId: app.actor?.id, sheetClass: app?.constructor?.name });
  } catch (err) {
    error("Failed to render fate scale", err);
  }
}
