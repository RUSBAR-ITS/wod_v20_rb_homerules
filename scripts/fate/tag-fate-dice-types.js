import { MODULE_ID } from "../constants/module-id.js";
import { debugNs } from "../logger/ns.js";
import { shouldEnableFate } from "./should-enable-fate.js";
import { consumeLastFateRollContainer } from "./patch-dice-container-with-fate.js";

const { debug, info, warn, error } = debugNs("fate:tag:dice-types");

/**
 * Register a hook that tags dice "types" for Fate-enabled rolls.
 *
 * We do NOT modify the system DiceRoller output structure. Instead we attach
 * a parallel array aligned with ChatMessage.rolls:
 *   flags[MODULE_ID].diceTypes = ["base"|"special"|"fate", ...]
 *
 * This metadata will be used later to:
 * - compute a separate Fate-only result
 * - color Fate dice differently in the chat output
 */
export function registerFateDiceTypeTaggingHook() {
  Hooks.on("preCreateChatMessage", (doc, data) => {
    try {
      if (shouldEnableFate() !== true) return;

      // Only roll messages created by the system DiceRoller include `rolls`.
      const rolls = data?.rolls;
      if (!Array.isArray(rolls) || rolls.length === 0) return;

      // Consume the last Fate-applied container reference (one-shot, freshness guarded).
      const container = consumeLastFateRollContainer();
      if (!container) return;

      const diceTypes = computeDiceTypesForRollMessage(container, rolls);

      // Attach flags (do not overwrite existing module flags).
      if (!data.flags) data.flags = {};
      if (!data.flags[MODULE_ID]) data.flags[MODULE_ID] = {};

      data.flags[MODULE_ID].diceTypes = diceTypes;
      data.flags[MODULE_ID].diceTypesVersion = 1;

      // DEV: compact summary for quick verification (especially exploding dice inheritance).
      const summary = summarizeDiceTypes(diceTypes);

      debug("Tagged dice types on chat message", {
        actorId: container?.actor?.id,
        origin: container?.origin,
        rolls: rolls.length,
        tagged: diceTypes.length,
        typesCount: summary.counts,
        typesRle: summary.rle,
      });
    } catch (err) {
      error("Failed to tag dice types on preCreateChatMessage", err);
    }
  });

  info("Registered preCreateChatMessage hook for Fate dice type tagging");
}

/**
 * Compute a diceTypes array aligned with ChatMessage.rolls.
 *
 * Requirements:
 * - Fate dice must be distinguishable from base dice.
 * - Exploding dice must inherit the SAME type as the die that exploded.
 * - For now, type must NOT affect success calculations (metadata only).
 *
 * @param {object} container DiceRollContainer used for the roll.
 * @param {Roll[]} rolls Array of 1d10 Roll objects from chat message data.
 * @returns {string[]} Array aligned with `rolls`.
 */
function computeDiceTypesForRollMessage(container, rolls) {
  const cfg = CONFIG?.worldofdarkness ?? {};

  const targetlist =
    Array.isArray(container?.targetlist) && container.targetlist.length > 0
      ? container.targetlist
      : [{ numDices: Number(container?.numDices ?? 0) || 0 }];

  const woundPenalty = Number(container?.woundpenalty ?? 0) || 0;
  const specialCountRaw = Number(container?.numSpecialDices ?? 0) || 0;

  // Fate dice count is stored on the container when Fate was applied.
  const fateCountRaw = Number(container?.__rusbarFateDiceCount ?? 0) || 0;

  // Explode rules in system:
  // - if useexplodingDice is enabled
  // - and explodingDice === "always", explode on 10
  // - or explodingDice === "speciality" and container.speciality === true
  const explodeEnabled = cfg.useexplodingDice === true;
  const explodeMode = String(cfg.explodingDice ?? "");
  const canExplodeOnThisRoll =
    explodeEnabled === true &&
    (explodeMode === "always" || (explodeMode === "speciality" && container?.speciality === true));

  let rollIdx = 0;
  const out = [];

  for (const target of targetlist) {
    const baseTargetDice = Number(target?.numDices ?? 0) || 0;

    // System uses: numberDices = target.numDices + diceRoll.woundpenalty; clamp to 0
    let numberDices = baseTargetDice + woundPenalty;
    if (numberDices < 0) numberDices = 0;

    // Clamp Fate dice to the effective dice count for this target.
    const fateCount = Math.min(Math.max(0, fateCountRaw), numberDices);

    // Base dice are the remainder.
    const baseCount = numberDices - fateCount;

    // Special dice must not "eat into" Fate dice.
    const specialCount = Math.min(Math.max(0, specialCountRaw), baseCount);

    // Build initial queue of types for this target:
    // [special...][base...][fate...]
    const queue = [];
    for (let i = 0; i < specialCount; i += 1) queue.push("special");
    for (let i = 0; i < baseCount - specialCount; i += 1) queue.push("base");
    for (let i = 0; i < fateCount; i += 1) queue.push("fate");

    // Consume rolls in the same order the system rolled them.
    // If a die "explodes", we insert an extra die of the SAME type at the front of the queue.
    while (queue.length > 0 && rollIdx < rolls.length) {
      const dieType = queue.shift();
      const roll = rolls[rollIdx];
      rollIdx += 1;

      out.push(dieType);

      const value = extractSingleD10Value(roll);

      // Explosion rule: only when a 10 is rolled and the system explosion setting allows it.
      if (canExplodeOnThisRoll === true && value === 10) {
        queue.unshift(dieType);
      }
    }
  }

  // If there are more rolls than we could account for (should be rare), tag as "unknown".
  while (rollIdx < rolls.length) {
    out.push("unknown");
    rollIdx += 1;
  }

  return out;
}

/**
 * Extract a single d10 result value from a Roll object created as `new Roll("1d10")`.
 *
 * @param {Roll} roll
 * @returns {number} integer 1..10, or 0 if not available
 */
function extractSingleD10Value(roll) {
  try {
    const term = roll?.terms?.[0];
    const result = term?.results?.[0]?.result;
    const v = Number.parseInt(result, 10);
    if (Number.isFinite(v)) return v;
    return 0;
  } catch (_err) {
    return 0;
  }
}

/**
 * Create a compact summary of dice types for debugging:
 * - counts by type
 * - run-length encoding string: "base×6 → fate×2 → base×1"
 *
 * @param {string[]} diceTypes
 * @returns {{ counts: Record<string, number>, rle: string }}
 */
function summarizeDiceTypes(diceTypes) {
  const counts = {
    base: 0,
    special: 0,
    fate: 0,
    unknown: 0,
  };

  for (const t of diceTypes) {
    if (t === "base") counts.base += 1;
    else if (t === "special") counts.special += 1;
    else if (t === "fate") counts.fate += 1;
    else counts.unknown += 1;
  }

  const parts = [];
  let prev = null;
  let run = 0;

  for (const t of diceTypes) {
    if (prev === null) {
      prev = t;
      run = 1;
      continue;
    }

    if (t === prev) {
      run += 1;
      continue;
    }

    parts.push(`${prev}×${run}`);
    prev = t;
    run = 1;
  }

  if (prev !== null) parts.push(`${prev}×${run}`);

  return {
    counts,
    rle: parts.join(" → "),
  };
}
