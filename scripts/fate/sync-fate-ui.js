import { FATE_UI } from "../constants/fate-ui.js";

/**
 * Synchronize Fate UI with actor data.
 *
 * Why this is required:
 * - The system helper renders the steps, but the sheet normally runs its own
 *   initializer to apply "active" classes based on stored values.
 * - Our Fate block is injected after the sheet has already activated listeners,
 *   so we must apply the active-state ourselves.
 *
 * @param {JQuery} root The Fate wrapper element.
 * @param {Actor} actor The actor owning the Fate data.
 */
export function syncFateUi(root, actor) {
  if (!root?.length || !actor) return;

  const fate = actor.system?.advantages?.fate ?? {};
  const max = Number(fate.max ?? 10);

  // IMPORTANT:
  // - permanent is allowed to be 0..max (0 means "no dots selected")
  // - temporary is allowed to be 0..permanent
  const perm = Math.max(0, Math.min(Number(fate.permanent ?? 0), max));
  const temp = Math.max(0, Math.min(Number(fate.temporary ?? 0), perm));

  const permRow = root.find(FATE_UI.SELECTORS.fatePermanentRow).first();
  const tempRow = root.find(FATE_UI.SELECTORS.fateTemporaryRow).first();

  if (permRow.length) {
    const steps = permRow.find(FATE_UI.SELECTORS.resourceStep);
    steps.removeClass("active");
    steps.each(function (i) {
      if (i < perm) $(this).addClass("active");
    });
    permRow.attr("data-value", String(perm));
  }

  if (tempRow.length) {
    const steps = tempRow.find(FATE_UI.SELECTORS.resourceStep);
    steps.removeClass("active");
    steps.each(function (i) {
      if (i < temp) $(this).addClass("active");
    });
    tempRow.attr("data-value", String(temp));
  }
}
