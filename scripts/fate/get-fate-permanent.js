import { debugNs } from "../logger/ns.js";
import { FATE_DATA } from "../constants/fate-data.js";

const { debug, warn } = debugNs("fate:data");

/**
 * Read the permanent Fate value from an Actor.
 *
 * Notes:
 * - This is intentionally isolated so roll/UI features can reuse the same logic.
 * - We treat missing/invalid data defensively and return 0.
 *
 * @param {Actor | undefined | null} actor
 * @returns {number} Permanent Fate value (0+ integer).
 */
export function getFatePermanent(actor) {
  try {
    if (!actor) return 0;

    // Expected location: actor.system.advantages.fate.permanent
    const raw = actor?.system?.advantages?.[FATE_DATA.STAT_KEY]?.permanent;

    const n = Number.parseInt(raw ?? 0, 10);
    if (Number.isNaN(n) || !Number.isFinite(n)) {
      warn("Permanent Fate value is not a valid number; treating as 0", { raw });
      return 0;
    }

    return Math.max(0, n);
  } catch (err) {
    warn("Failed to read permanent Fate value; treating as 0", err);
    return 0;
  } finally {
    // Keep a small trace for debugging (only when debug is enabled).
    debug("getFatePermanent evaluated");
  }
}
