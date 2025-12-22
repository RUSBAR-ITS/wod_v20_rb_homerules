import { MODULE_ID } from "../constants/module-id.js";
import { debugNs } from "../logger/ns.js";

import { isEvilBotchesEnabled } from "./settings/is-evil-botches-enabled.js";
import { isSystemSubtractOnesEnabled } from "./settings/is-system-subtract-ones-enabled.js";

import { getActorFromRollContext } from "./actor/get-actor-from-roll-context.js";
import { shouldApplyEvilBotchesToRoll } from "./gating/should-apply-evil-botches-to-roll.js";

import { getMessageRolls } from "./rolls/get-message-rolls.js";
import { extractD10ValuesFromRolls } from "./rolls/extract-d10-values-from-rolls.js";
import { computeEvilBotchesResult } from "./rolls/compute-evil-botches-result.js";

import { getRollAreas } from "./dom/get-roll-areas.js";
import { getSuccessArea } from "./dom/get-success-area.js";
import { getDirectSuccessDivs } from "./dom/get-direct-success-divs.js";
import { replaceOutcomeLine } from "./dom/replace-outcome-line.js";

import { safeJsonStringify } from "./debug/safe-json-stringify.js";
import { buildSettingsSnapshot } from "./debug/build-settings-snapshot.js";
import { logHookStart } from "./debug/log-hook-start.js";
import { logGateSkip } from "./debug/log-gate-skip.js";
import { logContextInputs } from "./debug/log-context-inputs.js";
import { logMessageRollsSnapshot } from "./debug/log-message-rolls-snapshot.js";
import { logCalc } from "./debug/log-calc.js";
import { logReplaced } from "./debug/log-replaced.js";

const { debug, warn, error } = debugNs("evil-botches:chat");

/**
 * Evil Botches (chat-only):
 *
 * IMPORTANT:
 * - This feature is intentionally display-only.
 * - We do NOT modify any upstream roll logic.
 * - We only replace the rendered result line inside the chat card.
 *
 * Gating:
 * - Applies ONLY when the system subtracts ones from successes (CONFIG.worldofdarkness.handleOnes === true).
 * - Applies ONLY when our module setting is enabled.
 * - Mirrors the upstream system's own exceptions (origin toggles, actor checks, favorited traits, etc).
 */
export function registerEvilBotchesChatHook() {
  // Foundry v13 deprecates renderChatMessage. Use renderChatMessageHTML instead.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try {
      // 1) Fast global gates (no per-message heavy work).
      if (isEvilBotchesEnabled() !== true) return;
      if (isSystemSubtractOnesEnabled() !== true) return;

      // 2) Resolve the DOM root for the rendered chat message.
      const root = html?.[0] ?? html;
      if (!(root instanceof HTMLElement)) return;

      // 3) Read the structured roll context attached by our roll-context hooks.
      //    We intentionally do NOT parse localized HTML.
      const rollCtx = message?.flags?.[MODULE_ID]?.rollContext ?? null;
      if (!rollCtx) {
        debug("Evil Botches: no rollContext on message; skipping", {
          messageId: message?.id ?? null,
          // Foundry v12+ migrated ChatMessage.user -> ChatMessage.author (User).
          // Keep a fallback for older versions.
          userId: message?.author?.id ?? message?.user?.id ?? null,
          speaker: message?.speaker ?? null,
        });
        return;
      }

      // 4) Mirror system gating to avoid chat mismatch.
      const actor = getActorFromRollContext(rollCtx);
      const gate = shouldApplyEvilBotchesToRoll({ rollCtx, actor });
      if (gate.ok !== true) {
        logGateSkip(debug, message, rollCtx, gate, safeJsonStringify);
        return;
      }

      // 5) Diagnostics (moved into debug helpers to keep this file orchestration-only).
      const settingsSnapshot = buildSettingsSnapshot({ gate, isEvilBotchesEnabled, isSystemSubtractOnesEnabled });
      logHookStart(debug, message, rollCtx, settingsSnapshot, safeJsonStringify);

      // 6) Validate required roll parameters.
      const difficulty = Number(rollCtx?.difficulty);
      if (!Number.isFinite(difficulty)) {
        debug("Evil Botches: rollContext.difficulty missing/invalid; skipping", {
          messageId: message?.id ?? null,
          rollTraceId: rollCtx?.rollTraceId ?? null,
          difficultyRaw: rollCtx?.difficulty ?? null,
          rollCtx,
        });
        return;
      }

      const rollAreas = getRollAreas(root);
      if (rollAreas.length === 0) {
        debug("Evil Botches: no roll areas found in chat card", { messageId: message?.id });
        return;
      }

      const origin = rollCtx?.origin ?? null;
      const isSpecialized = rollCtx.isSpecialized === true;
      const isWillpowerUsed = rollCtx.useWillpower === true;
      const autoSuccesses = rollCtx?.autoSuccesses ? Number(rollCtx.autoSuccesses) : 0;

      logContextInputs(debug, message, rollCtx, {
        origin,
        isSpecialized,
        isWillpowerUsed,
      });

      // 7) Extract dice results from Roll objects.
      const msgRolls = getMessageRolls(message);
      const dieValues = extractD10ValuesFromRolls(msgRolls);

      logMessageRollsSnapshot(debug, message, rollCtx, {
        msgRolls,
        dieValues,
        safeJsonStringify,
      });

      if (dieValues.length === 0) {
        debug("Evil Botches: no d10 results found in message rolls; skipping", {
          messageId: message?.id ?? null,
          rollTraceId: rollCtx?.rollTraceId ?? null,
          rollsCount: msgRolls.length,
        });
        return;
      }

      // 8) Compute the Evil Botches outcome (math moved into a dedicated helper module).
      const calc = computeEvilBotchesResult({
        dieValues,
        difficulty,
        isSpecialized,
        autoSuccesses,
        isWillpowerUsed,
      });

      // 9) Apply outcome line to each rendered roll area.
      let replaced = 0;
      for (let idx = 0; idx < rollAreas.length; idx += 1) {
        const area = rollAreas[idx];

        const successArea = getSuccessArea(area);
        if (!successArea) {
          debug("Evil Botches: roll area has no .tray-success-area, skipping", { messageId: message?.id });
          continue;
        }

        // System template renders result lines as direct <div> children inside `.tray-success-area`.
        // We keep this structure check to avoid touching unexpected templates.
        const directDivs = getDirectSuccessDivs(successArea);
        if (directDivs.length === 0) {
          debug("Evil Botches: no direct divs found in success area", { messageId: message?.id });
          continue;
        }

        logCalc(debug, message, rollCtx, {
          areaIndex: idx,
          difficulty,
          origin,
          isSpecialized,
          isWillpowerUsed,
          autoSuccesses,
          dieValues,
          calc,
          safeJsonStringify,
        });

        replaceOutcomeLine(successArea, calc.outcome, calc.outcomeText);
        replaced += 1;
      }

      logReplaced(debug, message, rollCtx, {
        difficulty,
        rollAreasCount: rollAreas.length,
        replaced,
      });
    } catch (err) {
      error("Evil Botches renderChatMessageHTML failed", err);
    }
  });
}
