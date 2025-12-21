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
        rollCtx,
        settingsSnapshot,
      });

      // Prefer structured flags (our patches). Fallback to chat parsing for legacy messages.
      const diff = rollCtx?.difficulty
        ? { difficulty: Number(rollCtx.difficulty), reason: "flags" }
        : extractDifficultyFromChatCard(root);

      debug("Evil Botches: difficulty resolved", {
        messageId: message?.id ?? null,
        rollTraceId: rollCtx?.rollTraceId ?? null,
        diff,
      });

      if (!Number.isFinite(diff?.difficulty)) {
        debug("Evil Botches: difficulty missing; skipping", {
          messageId: message?.id,
          difficultyReason: diff?.reason,
          hasRollContext: Boolean(rollCtx),
        });
        return;
      }

      const difficulty = Number(diff.difficulty);

      const rollAreas = Array.from(root.querySelectorAll(".tray-roll-area"));
      if (rollAreas.length === 0) {
        debug("Evil Botches: no roll areas found in chat card", { messageId: message?.id });
        return;
      }

      // NOTE:
      // The system template places `.tray-info-area` once per message, *outside* any `.tray-roll-area`.
      // So specialization/willpower flags must be detected on the whole card (`root`), not per roll-area.
      const origin = rollCtx?.origin ?? null;

      const isSpecialized = rollCtx ? rollCtx.isSpecialized === true : detectSpecializationInChatCard(root);
      const isWillpowerUsed = rollCtx ? rollCtx.useWillpower === true : detectWillpowerInChatCard(root);

      debug("Evil Botches: context inputs", {
        messageId: message?.id ?? null,
        rollTraceId: rollCtx?.rollTraceId ?? null,
        origin,
        isSpecialized,
        isWillpowerUsed,
        source: {
          origin: rollCtx?.origin ? "flags" : "chat-detect",
          isSpecialized: rollCtx ? "flags" : "chat-detect",
          useWillpower: rollCtx ? "flags" : "chat-detect",
        },
        rawFlags: rollCtx
          ? {
              difficulty: rollCtx?.difficulty ?? null,
              isSpecialized: rollCtx?.isSpecialized ?? null,
              useWillpower: rollCtx?.useWillpower ?? null,
              actorId: rollCtx?.actorId ?? null,
              attribute: rollCtx?.attribute ?? null,
              autoSuccesses: rollCtx?.autoSuccesses ?? null,
            }
          : null,
      });

      const autoSuccesses = rollCtx?.autoSuccesses ? Number(rollCtx.autoSuccesses) : 0;

      let replaced = 0;

      for (const area of rollAreas) {
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

        const diceImgs = Array.from(area.querySelectorAll("img.wod-svg"));
        if (diceImgs.length === 0) {
          debug("Evil Botches: no dice images found in roll area", { messageId: message?.id });
          continue;
        }

        let ones = 0;
        let diceSuccesses = 0;
        const dieValues = [];

        // Success counting, matching system behavior before subtracting ones:
        // - 1s are counted separately and are NOT successes
        // - 10s contribute according to system config (and specialization)
        // - other dice >= difficulty => +1
        for (const img of diceImgs) {
          const value = extractDieValueFromImg(img);
          dieValues.push(value);

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
          difficulty,
          isSpecialized,
          isWillpowerUsed,
          ones,
          autoSuccesses,
          successesFromDice: diceSuccesses,
          successesBeforeSubtractOnes: successesBeforeOnes,
          netBeforeWillpower: successesBeforeOnes - ones,
          outcome: out,
          diceCount: diceImgs.length,
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
          ctxSource: rollCtx ? "flags" : "chat-parse",
          origin,
        });

        // Replace vanilla lines completely.
        // Keep "danger" styling for botch, and "success" styling for success (via existing classes).
        successArea.textContent = "";

        const line = document.createElement("div");

        if (out.kind === "botch") {
          const span = document.createElement("span");
          span.classList.add("danger");
          span.textContent = game.i18n.format("wod_v20_rb_homerules.evilBotches.botch", { count: out.value });
          line.appendChild(span);
        } else if (out.kind === "success") {
          const span = document.createElement("span");
          span.classList.add("success");
          span.textContent = game.i18n.format("wod_v20_rb_homerules.evilBotches.success", { count: out.value });
          line.appendChild(span);
        } else {
          const span = document.createElement("span");
          span.textContent = game.i18n.localize("wod_v20_rb_homerules.evilBotches.failure");
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
          ctxSource: rollCtx ? "flags" : "chat-parse",
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

/**
 * Extract roll difficulty from the chat card.
 *
 * @param {HTMLElement} root
 * @returns {{ difficulty: number|null, reason: string }}
 */
function extractDifficultyFromChatCard(root) {
  try {
    const text = root?.textContent ?? "";
    const m = text.match(/Difficulty\\s*:\\s*(\\d+)/i) || text.match(/Сложность\\s*:\\s*(\\d+)/i);
    if (!m) return { difficulty: null, reason: "no-match" };
    const v = Number(m[1]);
    return Number.isFinite(v) ? { difficulty: v, reason: "chat-parse" } : { difficulty: null, reason: "nan" };
  } catch (_err) {
    return { difficulty: null, reason: "exception" };
  }
}

function detectSpecializationInChatCard(root) {
  // Legacy detection: best-effort.
  const t = root?.textContent ?? "";
  return /special/i.test(t) || /специал/i.test(t);
}

function detectWillpowerInChatCard(root) {
  // Legacy detection: best-effort.
  const t = root?.textContent ?? "";
  return /willpower/i.test(t) || /воля/i.test(t);
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

function extractDieValueFromImg(img) {
  try {
    const alt = img?.getAttribute?.("alt") ?? "";
    const m = alt.match(/\\b(10|[1-9])\\b/);
    if (m) return Number(m[1]);

    const src = img?.getAttribute?.("src") ?? "";
    const m2 = src.match(/\\b(10|[1-9])\\b/);
    if (m2) return Number(m2[1]);
  } catch (_err) {
    // ignore
  }
  return NaN;
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
