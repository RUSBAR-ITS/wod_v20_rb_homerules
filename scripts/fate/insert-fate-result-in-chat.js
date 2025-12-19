import { MODULE_ID } from "../constants/module-id.js";
import { debugNs } from "../logger/ns.js";
import { shouldEnableFate } from "./should-enable-fate.js";

const { debug, warn, error } = debugNs("fate:chat:result");

/**
 * Insert an additional Fate-specific outcome line into the system roll chat card.
 *
 * Rules:
 * - If count(1) > count(10): show "Fate Botch: X" where X = count(1) - count(10)
 * - If count(10) > count(1): show "Fate Success: X" where X = count(10) - count(1)
 * - Otherwise: show nothing
 *
 * Placement:
 * - Under the base system success line (the `{{result.successes}}` line) inside each `.tray-roll-area`.
 *
 * IMPORTANT:
 * - We do NOT alter the system success/botch/fail logic or the underlying Roll object.
 * - We rely on our stable metadata `rbFateDiceTypes` to identify Fate dice by index.
 * - We compute per `.tray-roll-area` so multi-result chat cards stay correct.
 */
export function registerInsertFateResultInChatHook() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try {
      if (shouldEnableFate() !== true) return;

      const rollCount = Array.isArray(message?.rolls) ? message.rolls.length : 0;
      if (rollCount === 0) return;

      // Foundry typically passes a jQuery object here; we support both jQuery and HTMLElement.
      const root = html?.[0] ?? html;
      if (!(root instanceof HTMLElement)) return;

      const { diceTypes, diceTypesSource, cacheId } = extractFateMeta(message);

      // Quietly ignore messages without our Fate metadata.
      if (!Array.isArray(diceTypes) || diceTypes.length === 0) return;

      const allDiceImgs = Array.from(root.querySelectorAll("img.wod-svg"));
      if (allDiceImgs.length === 0) return;

      const n = Math.min(allDiceImgs.length, diceTypes.length);

      // Map each dice image element to its stable global index.
      const imgIndex = new Map();
      for (let i = 0; i < n; i += 1) imgIndex.set(allDiceImgs[i], i);

      const rollAreas = Array.from(root.querySelectorAll(".tray-roll-area"));
      if (rollAreas.length === 0) return;

      let removed = 0;
      let inserted = 0;

      for (const area of rollAreas) {
        // Idempotency: remove our previous line on rerender.
        const existing = area.querySelectorAll(".rb-fate-result-line");
        if (existing.length > 0) {
          existing.forEach((el) => el.remove());
          removed += existing.length;
        }

        const diceImgs = Array.from(area.querySelectorAll("img.wod-svg"));
        if (diceImgs.length === 0) continue;

        let ones = 0;
        let tens = 0;

        for (const img of diceImgs) {
          const idx = imgIndex.get(img);
          if (Number.isInteger(idx) !== true) continue;
          if (diceTypes[idx] !== "fate") continue;

          const value = extractDieValueFromImg(img);
          if (value === 1) ones += 1;
          if (value === 10) tens += 1;
        }

        // Apply requested rules.
        const delta = tens - ones;
        if (delta === 0) continue;

        const successArea = area.querySelector(".tray-success-area");
        if (!successArea) continue;

        // System template usually uses direct <div> children; the last one is the "Successes: N" line.
        const directDivs = successArea.querySelectorAll(":scope > div");
        const successLine = directDivs.length > 0 ? directDivs[directDivs.length - 1] : null;
        if (!(successLine instanceof HTMLElement)) continue;

        const line = document.createElement("div");
        line.classList.add("rb-fate-result-line");

        if (delta > 0) {
          line.textContent = game.i18n.format("rusbar.homerules.fate.chat.resultSuccess", {
            value: Math.abs(delta),
          });
        } else {
          line.textContent = game.i18n.format("rusbar.homerules.fate.chat.resultBotch", {
            value: Math.abs(delta),
          });
        }

        successLine.insertAdjacentElement("afterend", line);
        inserted += 1;
      }

      debug("Fate result line processed", {
        messageId: message?.id,
        diceTypesSource,
        cacheId,
        diceImgsCount: allDiceImgs.length,
        diceTypesLen: diceTypes.length,
        rollAreas: rollAreas.length,
        removed,
        inserted,
      });
    } catch (err) {
      error("renderChatMessageHTML hook failed (Fate result line)", err);
    }
  });
}

/**
 * Extract Fate metadata from the message (same priority order as replace-fate-dice-in-chat.js).
 */
function extractFateMeta(message) {
  try {
    const roll0 = message?.rolls?.[0];
    const diceTypes = roll0?.options?.rbFateDiceTypes;

    if (Array.isArray(diceTypes)) {
      return {
        diceTypes,
        diceTypesSource: "rolls[0].options.rbFateDiceTypes",
        cacheId: roll0?.options?.rbFateCacheId ?? null,
      };
    }

    const fromFlags = message?.flags?.[MODULE_ID]?.diceTypes;
    if (Array.isArray(fromFlags)) {
      return {
        diceTypes: fromFlags,
        diceTypesSource: "flags.diceTypes",
        cacheId: message?.flags?.[MODULE_ID]?.cacheId ?? null,
      };
    }
  } catch (err) {
    // We do not hard-fail; this is chat render path.
    warn("Failed to extract Fate metadata", err);
  }

  return { diceTypes: null, diceTypesSource: "none", cacheId: null };
}

/**
 * The system puts numeric dice values into <img title="N"> for each die.
 */
function extractDieValueFromImg(img) {
  try {
    const raw = img?.getAttribute?.("title");
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_err) {
    return 0;
  }
}
