/**
 * Collect rendered roll areas from the WoD chat card.
 *
 * The WoD system renders roll blocks as `.tray-roll-area` elements.
 */
export function getRollAreas(root) {
  try {
    return Array.from(root.querySelectorAll(".tray-roll-area"));
  } catch (_err) {
    return [];
  }
}
