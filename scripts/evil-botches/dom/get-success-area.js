/**
 * Get the container that holds the "success / failure / botch" lines.
 */
export function getSuccessArea(rollAreaEl) {
  try {
    return rollAreaEl?.querySelector?.(".tray-success-area") ?? null;
  } catch (_err) {
    return null;
  }
}
