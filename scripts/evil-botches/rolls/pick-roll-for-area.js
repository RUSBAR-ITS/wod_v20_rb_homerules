/**
 * Pick a Roll for a specific visual roll area.
 * If there are multiple rolls, we map by index, falling back to the first.
 *
 * NOTE:
 * This helper is currently not used by Evil Botches (we treat all rolls as one pool),
 * but is preserved to avoid behavior surprises if future iterations need per-area mapping.
 */
export function pickRollForArea(rolls, areaIndex) {
  if (!Array.isArray(rolls) || rolls.length === 0) return null;
  return rolls[areaIndex] ?? rolls[0] ?? null;
}
