import { MODULE_ID } from "../constants/module-id.js";
import { debugNs } from "../logger/ns.js";
import { shouldEnableFate } from "./should-enable-fate.js";
import { buildEmeraldD10Svg } from "./dice/emerald-d10-svg.js";

const { debug, info, warn, error } = debugNs("fate:chat:replace");

/**
 * Replace Fate dice visuals in the system roll chat card.
 *
 * Metadata sources (most reliable first):
 * 1) message.rolls[0].options.rbFateDiceTypes   (stable across rerenders/history reload)
 * 2) message.flags[MODULE_ID].diceTypes         (best-effort; may be rewritten)
 *
 * We do NOT warn on messages that do not carry our metadata (chat history noise).
 */
export function registerReplaceFateDiceInChatHook() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try {
      if (shouldEnableFate() !== true) return;

      const rollCount = Array.isArray(message?.rolls) ? message.rolls.length : 0;
      if (rollCount === 0) return;

      const { diceTypes, diceTypesSource, cacheId } = extractFateMeta(message);

      // Quietly ignore non-Fate messages (history/chat rerenders).
      if (!Array.isArray(diceTypes) || diceTypes.length === 0) {
        debug("No Fate diceTypes on message; skipping replacement", {
          messageId: message?.id,
          diceTypesSource,
          cacheId,
        });
        return;
      }

      const root = html instanceof HTMLElement ? html : null;
      if (!root) {
        debug("renderChatMessageHTML html argument is not an HTMLElement; skipping", {
          messageId: message?.id,
          diceTypesSource,
        });
        return;
      }

      const diceImgs = Array.from(root.querySelectorAll("img.wod-svg"));

      debug("Chat dice scan", {
        messageId: message?.id,
        diceTypesSource,
        cacheId,
        diceImgsCount: diceImgs.length,
        diceTypesLen: diceTypes.length,
      });

      if (diceImgs.length === 0) return;

      const n = Math.min(diceImgs.length, diceTypes.length);
      let replaced = 0;
      let fateTagged = 0;

      for (let i = 0; i < n; i += 1) {
        if (diceTypes[i] !== "fate") continue;

        fateTagged += 1;

        const img = diceImgs[i];
        const value = extractDieValueFromImg(img);

        const svg = buildEmeraldD10Svg(value, { height: 30, width: 30 });
        const encoded = encodeURIComponent(svg);

        img.setAttribute("src", `data:image/svg+xml;utf8,${encoded}`);
        img.classList.add("rb-fate-die");
        img.setAttribute("data-rb-fate", "1");

        replaced += 1;
      }

      info("Replaced Fate dice in chat", {
        messageId: message?.id,
        diceTypesSource,
        cacheId,
        fateTagged,
        replaced,
      });

      if (replaced === 0) {
        const sample = diceImgs[0]?.outerHTML ?? "";
        debug("Replacement produced 0 changes; sample dice img", {
          messageId: message?.id,
          diceTypesSource,
          cacheId,
          sample: sample.length > 350 ? `${sample.slice(0, 350)}...` : sample,
        });
      }
    } catch (err) {
      error("Failed to replace Fate dice in chat", err);
    }
  });

  info("Registered renderChatMessageHTML hook for Fate dice replacement");
}

/**
 * Extract Fate metadata from the message.
 *
 * @param {ChatMessage} message
 * @returns {{ diceTypes: string[] | null, diceTypesSource: string, cacheId: string | null }}
 */
function extractFateMeta(message) {
  // Primary: Roll.options
  const roll0 = Array.isArray(message?.rolls) ? message.rolls[0] : null;
  const optDiceTypes = roll0?.options?.rbFateDiceTypes;

  if (Array.isArray(optDiceTypes) && optDiceTypes.length > 0) {
    const cacheId = typeof roll0?.options?.rbFateCacheId === "string" ? roll0.options.rbFateCacheId : null;
    return { diceTypes: optDiceTypes, diceTypesSource: "rollOptions", cacheId };
  }

  // Secondary: module flags
  const modFlags = message?.flags?.[MODULE_ID] ?? {};
  const flagDiceTypes = modFlags?.diceTypes;

  if (Array.isArray(flagDiceTypes) && flagDiceTypes.length > 0) {
    const cacheId = typeof modFlags?.rbFateCacheId === "string" ? modFlags.rbFateCacheId : null;
    return { diceTypes: flagDiceTypes, diceTypesSource: "flags", cacheId };
  }

  return { diceTypes: null, diceTypesSource: "none", cacheId: null };
}

function extractDieValueFromImg(img) {
  try {
    const raw = img?.getAttribute?.("title");
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
    return 0;
  } catch (_err) {
    return 0;
  }
}
