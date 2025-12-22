import { MODULE_ID } from "../constants/module-id.js";
import { debugNs } from "../logger/ns.js";

import { isEvilBotchesEnabled } from "./settings/is-evil-botches-enabled.js";
import { isSystemSubtractOnesEnabled } from "./settings/is-system-subtract-ones-enabled.js";

import { getActorFromRollContext } from "./actor/get-actor-from-roll-context.js";
import { shouldApplyEvilBotchesToRoll } from "./gating/should-apply-evil-botches-to-roll.js";

import { getMessageRolls } from "./rolls/get-message-rolls.js";
import { extractD10ValuesFromRolls } from "./rolls/extract-d10-values-from-rolls.js";
import { getTenSuccessValue } from "./rolls/get-ten-success-value.js";

import { computeOutcome } from "./outcome/compute-outcome.js";
import { formatOutcomeText } from "./outcome/format-outcome-text.js";

import { safeJsonStringify } from "./debug/safe-json-stringify.js";

import { getRollAreas } from "./dom/get-roll-areas.js";
import { getSuccessArea } from "./dom/get-success-area.js";
import { getDirectSuccessDivs } from "./dom/get-direct-success-divs.js";
import { replaceOutcomeLine } from "./dom/replace-outcome-line.js";

const { debug, warn, error } = debugNs("evil-botches:chat");

/**
 * Evil Botches (chat-only):
 *
 * This feature is intentionally display-only:
 * - We do NOT modify any system roll logic.
 * - We only replace the rendered result line inside the chat card.
 *
 * Key constraints:
 * - Applies ONLY when the system subtracts ones from successes.
 * - Applies ONLY when our module setting is enabled.
 * - Must mirror the system's own gating (origin toggles, actor checks, favorited traits, etc)
 *   so that the chat display remains consistent with what the system actually does.
 */
export function registerEvilBotchesChatHook() {
  Hooks.on("renderChatMessage", (message, html) => {
    try {
      if (isEvilBotchesEnabled() !== true) return;
      if (isSystemSubtractOnesEnabled() !== true) return;

      const root = html?.[0] ?? html;
      if (!(root instanceof HTMLElement)) return;

      const rollCtx = message?.flags?.[MODULE_ID]?.rollContext ?? null;

      // IMPORTANT:
      // We do NOT parse difficulty/specialization/willpower from the rendered chat card.
      // We rely exclusively on our structured roll context attached in preCreateChatMessage.
      if (!rollCtx) {
        debug("Evil Botches: no rollContext on message; skipping", {
          messageId: message?.id ?? null,
          userId: message?.user?.id ?? null,
          speaker: message?.speaker ?? null,
        });
        return;
      }

      // IMPORTANT:
      // Evil Botches must only run when the SYSTEM would actually subtract ones.
      // This includes:
      // - global handleOnes
      // - origin-specific useOnes* toggles (soak/damage)
      // - actor presence (system checks actor before applying ones logic)
      // - favorited/exalted checks (system does NOT subtract ones for favorited traits)
      const actor = getActorFromRollContext(rollCtx);
      const gate = shouldApplyEvilBotchesToRoll({ rollCtx, actor });
      if (gate.ok !== true) {
        debug("Evil Botches: gating skipped", {
          messageId: message?.id ?? null,
          rollTraceId: rollCtx?.rollTraceId ?? null,
          reason: gate.reason,
          detailsJson: safeJsonStringify(gate.details ?? null),
        });
        return;
      }

      // --- DIAGNOSTICS: log incoming message + settings + context snapshot ---
      const settingsSnapshot = {
        moduleEnabled: isEvilBotchesEnabled(),
        systemHandleOnes: isSystemSubtractOnesEnabled(),
        gateOk: gate.ok,
        gateReason: gate.reason,
        systemTenRule: CONFIG?.worldofdarkness?.usetenAddSuccess ?? null,
        systemTenAddSuccess: CONFIG?.worldofdarkness?.tenAddSuccess ?? null,
        systemSpecialtyRule: CONFIG?.worldofdarkness?.usespecialityAddSuccess ?? null,
        systemSpecialtyAddSuccess: CONFIG?.worldofdarkness?.specialityAddSuccess ?? null,
        systemSpecialtyAllowBotch: CONFIG?.worldofdarkness?.specialityAllowBotch ?? null,
        systemUseOnesSoak: CONFIG?.worldofdarkness?.useOnesSoak ?? null,
        systemUseOnesDamage: CONFIG?.worldofdarkness?.useOnesDamage ?? null,
      };

      debug("Evil Botches: hook start", {
        messageId: message?.id ?? null,
        rollTraceId: rollCtx?.rollTraceId ?? null,
        userId: message?.user?.id ?? null,
        speaker: message?.speaker ?? null,
        flagsHasRollContext: Boolean(rollCtx),
        // Log as strings so that file logs remain readable (no collapsed "Object").
        rollCtxJson: safeJsonStringify(rollCtx),
        settingsSnapshotJson: safeJsonStringify(settingsSnapshot),
      });

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

      debug("Evil Botches: context inputs", {
        messageId: message?.id ?? null,
        rollTraceId: rollCtx?.rollTraceId ?? null,
        origin,
        isSpecialized,
        isWillpowerUsed,
        source: {
          origin: "flags",
          isSpecialized: "flags",
          useWillpower: "flags",
        },
        rawFlags: {
          difficulty: rollCtx?.difficulty ?? null,
          isSpecialized: rollCtx?.isSpecialized ?? null,
          useWillpower: rollCtx?.useWillpower ?? null,
          actorId: rollCtx?.actorId ?? null,
          attribute: rollCtx?.attribute ?? null,
          autoSuccesses: rollCtx?.autoSuccesses ?? null,
        },
      });

      const autoSuccesses = rollCtx?.autoSuccesses ? Number(rollCtx.autoSuccesses) : 0;

      // We read dice results from the Roll objects attached to the ChatMessage.
      // This is more reliable than parsing HTML or image attributes, and is locale-independent.
      const msgRolls = getMessageRolls(message);

      // The WoD system commonly stores a big dice pool as multiple Roll objects (often each Roll is 1d10).
      // We treat ALL message rolls as a single pool and compute the outcome once.
      const allDieValues = extractD10ValuesFromRolls(msgRolls);

      debug("Evil Botches: message rolls snapshot", {
        messageId: message?.id ?? null,
        rollTraceId: rollCtx?.rollTraceId ?? null,
        rollsCount: msgRolls.length,
        hasMessageRoll: Boolean(message?.roll),
        hasMessageRolls: Array.isArray(message?.rolls) && message.rolls.length > 0,
        d10ValuesCount: allDieValues.length,
        d10ValuesJson: safeJsonStringify(allDieValues),
      });

      if (allDieValues.length === 0) {
        debug("Evil Botches: no d10 results found in message rolls; skipping", {
          messageId: message?.id ?? null,
          rollTraceId: rollCtx?.rollTraceId ?? null,
          rollsCount: msgRolls.length,
        });
        return;
      }

      // Compute outcome once for the whole pool.
      let ones = 0;
      let diceSuccesses = 0;

      // Success counting, matching system behavior before subtracting ones:
      // - 1s are counted separately and are NOT successes
      // - 10s contribute according to system config (and specialization)
      // - other dice >= difficulty => +1
      for (const value of allDieValues) {
        if (value === 1) {
          ones += 1;
          continue;
        }

        if (value === 10) {
          diceSuccesses += getTenSuccessValue(isSpecialized);
          continue;
        }

        if (value >= difficulty) {
          diceSuccesses += 1;
        }
      }

      const successesBeforeOnes = diceSuccesses + (Number.isFinite(autoSuccesses) ? autoSuccesses : 0);
      const out = computeOutcome(successesBeforeOnes, ones, isWillpowerUsed);
      const outText = formatOutcomeText(out);

      let replaced = 0;

      for (let idx = 0; idx < rollAreas.length; idx += 1) {
        const area = rollAreas[idx];

        const successArea = getSuccessArea(area);
        if (!successArea) {
          debug("Evil Botches: roll area has no .tray-success-area, skipping", { messageId: message?.id });
          continue;
        }

        // System template renders result lines as direct <div> children inside `.tray-success-area`.
        // We replace the whole content with a single line (per requirements).
        const directDivs = getDirectSuccessDivs(successArea);
        if (directDivs.length === 0) {
          debug("Evil Botches: no direct divs found in success area", { messageId: message?.id });
          continue;
        }

        debug("Evil Botches calc", {
          messageId: message?.id ?? null,
          rollTraceId: rollCtx?.rollTraceId ?? null,
          areaIndex: idx,
          difficulty,
          isSpecialized,
          isWillpowerUsed,
          ones,
          autoSuccesses,
          successesFromDice: diceSuccesses,
          successesBeforeSubtractOnes: successesBeforeOnes,
          netBeforeWillpower: out.netBeforeWillpower,
          netAfterWillpower: out.netAfterWillpower,
          willpowerRuleApplied: out.willpowerRuleApplied,
          outcome: out,
          diceCount: allDieValues.length,
          dieValuesJson: safeJsonStringify(allDieValues),
          tenValue: getTenSuccessValue(isSpecialized),
          tenValueIfSpecialized: getTenSuccessValue(true),
          tenValueIfNotSpecialized: getTenSuccessValue(false),
          cfg: {
            handleOnes: CONFIG?.worldofdarkness?.handleOnes === true,
            usetenAddSuccess: CONFIG?.worldofdarkness?.usetenAddSuccess === true,
            tenAddSuccess: CONFIG?.worldofdarkness?.tenAddSuccess,
            usespecialityAddSuccess: CONFIG?.worldofdarkness?.usespecialityAddSuccess === true,
            specialityAddSuccess: CONFIG?.worldofdarkness?.specialityAddSuccess,
            specialityAllowBotch: CONFIG?.worldofdarkness?.specialityAllowBotch === true,
            useOnesSoak: CONFIG?.worldofdarkness?.useOnesSoak === true,
            useOnesDamage: CONFIG?.worldofdarkness?.useOnesDamage === true,
          },
          origin,
        });

        replaceOutcomeLine(successArea, out, outText);
        replaced += 1;
      }

      if (replaced > 0) {
        debug("Evil Botches replaced vanilla result line(s)", {
          messageId: message?.id ?? null,
          rollTraceId: rollCtx?.rollTraceId ?? null,
          difficulty,
          rollAreas: rollAreas.length,
          replaced,
        });
      }
    } catch (err) {
      error("Evil Botches renderChatMessage failed", err);
    }
  });
}
