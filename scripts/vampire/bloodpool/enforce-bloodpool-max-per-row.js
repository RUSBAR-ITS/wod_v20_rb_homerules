import { debugNs } from "../../logger/ns.js";

const { debug, warn, error } = debugNs("vampire:bloodpool:wrap");

const MARKER_ATTR = "data-rb-hr";
const MARKER_VALUE = "bloodpool-row-break";

/**
 * Remove all previously injected line breaks (idempotency).
 *
 * @param {JQuery} html
 */
function removeExistingBreaks(html) {
  html.find(`[${MARKER_ATTR}="${MARKER_VALUE}"]`).remove();
}

/**
 * Find the Blood Pool temporary track container on a Vampire sheet.
 *
 * Upstream system renders bloodpool as a `.resource-counter.tempSquareRow`
 * with `data-name="advantages.bloodpool.temporary"`.
 *
 * @param {JQuery} html
 * @returns {JQuery|null}
 */
function findBloodpoolTempCounter(html) {
  const counter = html
    .find('.resource-counter.tempSquareRow[data-name="advantages.bloodpool.temporary"]')
    .first();

  return counter.length ? counter : null;
}

/**
 * Enforce a maximum number of squares per line for Blood Pool.
 *
 * Why:
 * - Upstream uses inline-block squares. They wrap depending on available width.
 * - We want a strict "max N per row" without resizing squares or relying on container width.
 *
 * How:
 * - Insert a zero-height block-level element after each N-th square.
 *   This forces the next square to start on a new line.
 *
 * Safety:
 * - We do NOT touch or replace the squares (`.resource-value-step`).
 * - We only inject line breaks and remove them on re-render.
 * - Click handlers remain intact because system listeners target `.resource-value-step`.
 *
 * @param {Application} app
 * @param {JQuery} html
 * @param {{maxPerRow:number}} options
 */
export function enforceBloodpoolMaxPerRow(app, html, options = {}) {
  try {
    const actorId = app?.actor?.id;

    const maxPerRow = Number.isFinite(Number(options.maxPerRow)) ? Number(options.maxPerRow) : 10;
    if (maxPerRow <= 0) {
      warn("Invalid maxPerRow; skipping", { actorId, maxPerRow });
      return;
    }

    removeExistingBreaks(html);

    const counter = findBloodpoolTempCounter(html);
    if (!counter) {
      debug("Bloodpool temp counter not found; skipping wrap enforcement", { actorId });
      return;
    }

    const steps = counter.children(".resource-value-step");
    if (!steps.length) {
      debug("Bloodpool counter has no steps; skipping wrap enforcement", { actorId });
      return;
    }

    // Insert breaks after every N steps, except after the last one.
    steps.each((i, el) => {
      const index1 = i + 1;

      if (index1 % maxPerRow !== 0) return;
      if (index1 >= steps.length) return;

      /**
       * A block-level, zero-height element forces a line break in normal flow.
       * We keep it non-interactive and visually neutral.
       */
      const br = $(
        `<span ${MARKER_ATTR}="${MARKER_VALUE}" aria-hidden="true" style="display:block;width:100%;height:0;pointer-events:none;"></span>`
      );

      $(el).after(br);
    });

    debug("Enforced bloodpool wrap", { actorId, maxPerRow, steps: steps.length });
  } catch (err) {
    error("Failed to enforce bloodpool wrap", err);
  }
}
