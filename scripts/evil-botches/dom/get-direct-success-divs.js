/**
 * System template renders result lines as direct <div> children inside `.tray-success-area`.
 *
 * We keep this check to avoid touching cards that don't match the expected structure.
 */
export function getDirectSuccessDivs(successAreaEl) {
  try {
    return Array.from(successAreaEl.querySelectorAll(":scope > div"));
  } catch (_err) {
    return [];
  }
}
