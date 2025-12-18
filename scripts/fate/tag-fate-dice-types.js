import { MODULE_ID } from "../constants/module-id.js";
import { debugNs } from "../logger/ns.js";
import { shouldEnableFate } from "./should-enable-fate.js";
import { consumeLastFateRollContainer } from "./patch-dice-container-with-fate.js";

const { debug, info, warn, error } = debugNs("fate:tag:dice-types");

/**
 * Register a hook that tags dice "types" for Fate-enabled rolls.
 *
 * IMPORTANT (Foundry v13):
 * Mutating the `data` argument in preCreateChatMessage is not reliable.
 * We persist changes via `doc.updateSource(...)`.
 *
 * Our transport strategy:
 * - Primary: store diceTypes in message.rolls[0].options.rbFateDiceTypes (stable across rerenders)
 * - Secondary: store diceTypes in flags[MODULE_ID].diceTypes (best-effort; may be rewritten)
 */
export function registerFateDiceTypeTaggingHook() {
  Hooks.on("preCreateChatMessage", (doc, data) => {
    try {
      if (shouldEnableFate() !== true) return;

      const rolls = data?.rolls;
      if (!Array.isArray(rolls) || rolls.length === 0) return;

      const container = consumeLastFateRollContainer();
      if (!container) return;

      const diceTypes = computeDiceTypesForRollMessage(container, rolls);
      if (!Array.isArray(diceTypes) || diceTypes.length === 0) return;

      // We keep a cacheId for correlation/debugging only.
      const cacheId = createCacheId();

      // Prepare flags patch (secondary channel; may be overwritten by other code).
      const existingFlags = (data?.flags && typeof data.flags === "object") ? data.flags : {};
      const existingModuleFlags =
        (existingFlags[MODULE_ID] && typeof existingFlags[MODULE_ID] === "object")
          ? existingFlags[MODULE_ID]
          : {};

      const patchedFlags = foundry.utils.mergeObject(
        foundry.utils.deepClone(existingFlags),
        {
          [MODULE_ID]: {
            ...existingModuleFlags,
            diceTypes,
            diceTypesVersion: 1,
            rbFateMetaVersion: 1,
            rbFateCacheId: cacheId,
          },
        },
        { inplace: false }
      );

      /**
       * Primary channel (v13-stable):
       * Persist diceTypes into rolls[0].options so they survive:
       * - flags rewrites
       * - rerenders
       * - chat history reloads
       *
       * Store the full diceTypes array once on the first roll to avoid duplication.
       */
      const patchedRolls = rolls.map((r, idx) => {
        const rr = foundry.utils.deepClone(r ?? {});
        if (!rr.options || typeof rr.options !== "object") rr.options = {};

        rr.options.rbFateMetaVersion = 1;
        rr.options.rbFateCacheId = cacheId;

        if (idx === 0) {
          rr.options.rbFateDiceTypes = diceTypes;
          rr.options.rbFateDiceTypesVersion = 1;
        }

        return rr;
      });

      // Persist into the creating document source.
      doc.updateSource({
        flags: patchedFlags,
        rolls: patchedRolls,
      });

      const summary = summarizeDiceTypes(diceTypes);

      debug("Tagged dice types on chat message (persisted via updateSource)", {
        actorId: container?.actor?.id ?? null,
        origin: container?.origin ?? null,
        cacheId,
        rolls: rolls.length,
        tagged: diceTypes.length,
        roll0OptionKeys: Object.keys(patchedRolls?.[0]?.options ?? {}),
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
 * Create a reasonably unique id for correlation/debugging.
 *
 * @returns {string}
 */
function createCacheId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_err) {
    // ignore
  }

  const ts = Date.now();
  const rnd = Math.random().toString(16).slice(2);
  return `rb-fate-${ts}-${rnd}`;
}

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

  const explodeEnabled = cfg.useexplodingDice === true;
  const explodeMode = String(cfg.explodingDice ?? "");
  const canExplodeOnThisRoll =
    explodeEnabled === true &&
    (explodeMode === "always" || (explodeMode === "speciality" && container?.speciality === true));

  let rollIdx = 0;
  const out = [];

  for (const target of targetlist) {
    const baseTargetDice = Number(target?.numDices ?? 0) || 0;

    let numberDices = baseTargetDice + woundPenalty;
    if (numberDices < 0) numberDices = 0;

    const fateCount = Math.min(Math.max(0, fateCountRaw), numberDices);
    const baseCount = numberDices - fateCount;

    const specialCount = Math.min(Math.max(0, specialCountRaw), baseCount);

    const queue = [];
    for (let i = 0; i < specialCount; i += 1) queue.push("special");
    for (let i = 0; i < baseCount - specialCount; i += 1) queue.push("base");
    for (let i = 0; i < fateCount; i += 1) queue.push("fate");

    while (queue.length > 0 && rollIdx < rolls.length) {
      const dieType = queue.shift();
      const roll = rolls[rollIdx];
      rollIdx += 1;

      out.push(dieType);

      const value = extractSingleD10Value(roll);
      if (canExplodeOnThisRoll === true && value === 10) {
        queue.unshift(dieType);
      }
    }
  }

  while (rollIdx < rolls.length) {
    out.push("unknown");
    rollIdx += 1;
  }

  return out;
}

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
