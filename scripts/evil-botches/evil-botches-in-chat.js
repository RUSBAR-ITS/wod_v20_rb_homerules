import { MODULE_ID } from "../constants/module-id.js";
import { SETTINGS_KEYS } from "../constants/settings.js";
import { debugNs } from "../logger/ns.js";

const { debug, warn, error } = debugNs("evil-botches:chat");

/**
 * Evil Botches (chat-only):
 * - Applies ONLY when the system subtracts ones from successes (CONFIG.worldofdarkness.handleOnes === true).
 * - Applies ONLY when our module setting is enabled (EVIL_BOTCHES).
 *
 * We override the vanilla result line (success/fail/botch) with our own logic:
 * - If successes === 0 and ones === 0 => "Failure"
 * - If successes === ones => "Failure"
 * - If successes > ones => "Success: X" where X = successes - ones
 * - If ones > successes => "Botch: X" where X = ones - successes
 *
 * NOTE:
 * We intentionally do not change system roll logic, only chat display.
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

      // --- DIAGNOSTICS: log incoming message + settings + context snapshot ---
      const settingsSnapshot = {
        moduleEnabled: isEvilBotchesEnabled(),
        systemHandleOnes: isSystemSubtractOnesEnabled(),
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
        // Full context dump is intentionally debug-only.
        rollCtx,
        settingsSnapshot,
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

      const rollAreas = Array.from(root.querySelectorAll(".tray-roll-area"));
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

      debug("Evil Botches: message rolls snapshot", {
        messageId: message?.id ?? null,
        rollTraceId: rollCtx?.rollTraceId ?? null,
        rollsCount: msgRolls.length,
        hasMessageRoll: Boolean(message?.roll),
        hasMessageRolls: Array.isArray(message?.rolls) && message.rolls.length > 0,
      });

      let replaced = 0;

      for (let idx = 0; idx < rollAreas.length; idx += 1) {
        const area = rollAreas[idx];

        const successArea = area.querySelector(".tray-success-area");
        if (!successArea) {
          debug("Evil Botches: roll area has no .tray-success-area, skipping", { messageId: message?.id });
          continue;
        }

        // System template renders result lines as direct <div> children inside `.tray-success-area`.
        // We replace the whole content with a single line (per requirements).
        const directDivs = successArea.querySelectorAll(":scope > div");
        if (directDivs.length === 0) {
          debug("Evil Botches: no direct divs found in success area", { messageId: message?.id });
          continue;
        }

        const roll = pickRollForArea(msgRolls, idx);
        if (!roll) {
          debug("Evil Botches: no Roll object found for area; skipping", {
            messageId: message?.id ?? null,
            rollTraceId: rollCtx?.rollTraceId ?? null,
            areaIndex: idx,
            rollsCount: msgRolls.length,
          });
          continue;
        }

        const dieValues = extractD10ValuesFromRoll(roll);

        if (dieValues.length === 0) {
          debug("Evil Botches: no d10 results found in Roll; skipping area", {
            messageId: message?.id ?? null,
            rollTraceId: rollCtx?.rollTraceId ?? null,
            areaIndex: idx,
          });
          continue;
        }

        let ones = 0;
        let diceSuccesses = 0;

        // Success counting, matching system behavior before subtracting ones:
        // - 1s are counted separately and are NOT successes
        // - 10s contribute according to system config (and specialization)
        // - other dice >= difficulty => +1
        for (const value of dieValues) {
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
          netBeforeWillpower: successesBeforeOnes - ones,
          outcome: out,
          diceCount: dieValues.length,
          dieValues,
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

        // Replace vanilla lines completely.
        // Keep "danger" styling for botch, and "success" styling for success (via existing classes).
        successArea.textContent = "";

        const line = document.createElement("div");

        if (out.kind === "botch") {
          const span = document.createElement("span");
          span.classList.add("danger");
          span.textContent = game.i18n.format("rusbar.homerules.evilBotches.chat.botch", { value: out.value });
          line.appendChild(span);
        } else if (out.kind === "success") {
          const span = document.createElement("span");
          span.classList.add("success");
          span.textContent = game.i18n.format("rusbar.homerules.evilBotches.chat.success", { value: out.value });
          line.appendChild(span);
        } else {
          const span = document.createElement("span");
          span.textContent = game.i18n.localize("rusbar.homerules.evilBotches.chat.failure");
          line.appendChild(span);
        }

        successArea.appendChild(line);
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

function isEvilBotchesEnabled() {
  return game?.settings?.get(MODULE_ID, SETTINGS_KEYS.EVIL_BOTCHES) === true;
}

function isSystemSubtractOnesEnabled() {
  return CONFIG?.worldofdarkness?.handleOnes === true;
}

function getTenSuccessValue(isSpecialized) {
  const cfg = CONFIG?.worldofdarkness;
  if (!cfg) return 1;

  // System rules:
  // - If specialization rule enabled and this roll is specialized -> specialityAddSuccess (usually 2)
  // - Else if ten rule enabled -> tenAddSuccess
  // - Else -> 1
  if (cfg.usespecialityAddSuccess === true && isSpecialized === true) {
    const v = Number(cfg.specialityAddSuccess);
    return Number.isFinite(v) && v > 0 ? v : 2;
  }

  if (cfg.usetenAddSuccess === true) {
    const v = Number(cfg.tenAddSuccess);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  return 1;
}

/**
 * Get Roll objects from a ChatMessage in a version-tolerant way.
 * - Foundry usually provides message.rolls (array).
 * - Some cases may still provide message.roll (single).
 */
function getMessageRolls(message) {
  try {
    if (Array.isArray(message?.rolls) && message.rolls.length > 0) return message.rolls;
    if (message?.roll) return [message.roll];
  } catch (_err) {
    // ignore
  }
  return [];
}

/**
 * Pick a Roll for a specific visual roll area.
 * If there are multiple rolls, we map by index, falling back to the first.
 */
function pickRollForArea(rolls, areaIndex) {
  if (!Array.isArray(rolls) || rolls.length === 0) return null;
  return rolls[areaIndex] ?? rolls[0] ?? null;
}

/**
 * Extract d10 results from a Roll object.
 *
 * We intentionally do not rely on rendered HTML or image attributes.
 * We prefer roll.dice (if present), otherwise we fall back to scanning roll.terms.
 *
 * Returns a list of integer results in [1..10].
 */
function extractD10ValuesFromRoll(roll) {
  const values = [];

  try {
    // Preferred: roll.dice (array of DiceTerm)
    const diceTerms = Array.isArray(roll?.dice) ? roll.dice : null;

    if (diceTerms && diceTerms.length > 0) {
      for (const term of diceTerms) {
        const faces = Number(term?.faces);
        if (faces !== 10) continue;

        const results = Array.isArray(term?.results) ? term.results : [];
        for (const r of results) {
          const v = Number(r?.result);
          if (Number.isFinite(v) && v >= 1 && v <= 10) values.push(v);
        }
      }
      return values;
    }

    // Fallback: scan roll.terms recursively for DiceTerms with faces === 10
    const stack = Array.isArray(roll?.terms) ? [...roll.terms] : [];

    while (stack.length > 0) {
      const t = stack.shift();

      // Nested term containers (pools/groups) may expose .terms or .dice
      if (t && Array.isArray(t.terms)) stack.push(...t.terms);
      if (t && Array.isArray(t.dice)) stack.push(...t.dice);

      const faces = Number(t?.faces);
      if (faces !== 10) continue;

      const results = Array.isArray(t?.results) ? t.results : [];
      for (const r of results) {
        const v = Number(r?.result);
        if (Number.isFinite(v) && v >= 1 && v <= 10) values.push(v);
      }
    }
  } catch (_err) {
    // ignore
  }

  return values;
}

function computeOutcome(successesBeforeOnes, ones, isWillpowerUsed) {
  const s = Number.isFinite(successesBeforeOnes) ? successesBeforeOnes : 0;
  const o = Number.isFinite(ones) ? ones : 0;

  const net = s - o;

  if (net > 0) {
    // Success. Willpower may convert failure to success in some cases, but our module respects
    // the system-produced willpower usage flag; logic stays unchanged.
    return { kind: "success", value: net };
  }

  if (o > s) {
    // Botch count is ones - successes.
    return { kind: "botch", value: o - s };
  }

  // Failure includes: (s === 0 && o === 0) and (s === o)
  // Willpower is handled by the system logic earlier; we only reflect it.
  if (isWillpowerUsed === true && s === 0 && o === 0) {
    // Keep behavior unchanged: still failure here, willpower effects are system-side.
    return { kind: "failure", value: 0 };
  }

  return { kind: "failure", value: 0 };
}
