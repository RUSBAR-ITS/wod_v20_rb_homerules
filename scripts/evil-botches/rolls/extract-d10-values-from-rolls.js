import { extractD10ValuesFromRoll } from "./extract-d10-values-from-roll.js";

/**
 * Extract d10 results from ALL Roll objects of a ChatMessage.
 *
 * In the WoD system, a dice pool may be represented as multiple Roll objects
 * (often each Roll is a single 1d10). We aggregate them into one pool.
 */
export function extractD10ValuesFromRolls(rolls) {
  const out = [];

  if (!Array.isArray(rolls) || rolls.length === 0) return out;

  for (const r of rolls) {
    const vals = extractD10ValuesFromRoll(r);
    if (vals.length > 0) out.push(...vals);
  }

  return out;
}
