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
 * Definitions:
 * - successes: raw successes BEFORE subtracting ones,
 *   INCLUDING system-configured extra successes from 10s and specialization (if enabled).
 *
 * IMPORTANT:
 * - We do NOT modify frenzy logic or returned success numbers.
 * - We do NOT change the underlying roll or the system success computation.
 * - We ONLY change the chat card DOM output.
 */
export function registerEvilBotchesChatHook() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try {
      if (isEvilBotchesEnabled() !== true) return;
      if (isSystemSubtractOnesEnabled() !== true) return;

      const root = html?.[0] ?? html;
      if (!(root instanceof HTMLElement)) return;

      const difficulty = extractDifficultyFromChatCard(root);
      if (!Number.isFinite(difficulty) || difficulty <= 0) return;

      const rollAreas = Array.from(root.querySelectorAll(".tray-roll-area"));
      if (rollAreas.length === 0) return;

      let replaced = 0;

      for (const area of rollAreas) {
        const successArea = area.querySelector(".tray-success-area");
        if (!successArea) continue;

        // System template renders result lines as direct <div> children inside `.tray-success-area`.
        // We replace the whole content with a single line (per requirements).
        const directDivs = successArea.querySelectorAll(":scope > div");
        if (directDivs.length === 0) continue;

        const diceImgs = Array.from(area.querySelectorAll("img.wod-svg"));
        if (diceImgs.length === 0) continue;

        const isSpecialized = detectSpecializationInRollArea(area);

        let ones = 0;
        let successes = 0;

        // Success counting, matching system behavior before subtracting ones:
        // - 1s are counted separately and are NOT successes
        // - 10s contribute according to system config (and specialization)
        // - other dice >= difficulty => +1
        for (const img of diceImgs) {
          const value = extractDieValueFromImg(img);

          if (value === 1) {
            ones += 1;
            continue;
          }

          if (value === 10) {
            successes += getTenSuccessValue(isSpecialized);
            continue;
          }

          if (value >= difficulty) {
            successes += 1;
          }
        }

        // Decide output per requirements.
        const out = buildOutcome(successes, ones);

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
          // Use existing system "success" class if present elsewhere; fallback to plain text.
          span.classList.add("success");
          span.textContent = game.i18n.format("rusbar.homerules.evilBotches.chat.success", { value: out.value });
          line.appendChild(span);
        } else {
          // Failure
          line.textContent = game.i18n.localize("rusbar.homerules.evilBotches.chat.failure");
        }

        successArea.appendChild(line);
        replaced += 1;

        // Debug: output all calculations when module debug is enabled.
        debug("Evil Botches calc", {
          messageId: message?.id,
          difficulty,
          isSpecialized,
          ones,
          successesBeforeSubtractOnes: successes,
          net: successes - ones,
          outcome: out,
          diceCount: diceImgs.length,
          tenValue: getTenSuccessValue(isSpecialized),
          cfg: {
            handleOnes: CONFIG?.worldofdarkness?.handleOnes === true,
            usetenAddSuccess: CONFIG?.worldofdarkness?.usetenAddSuccess === true,
            tenAddSuccess: CONFIG?.worldofdarkness?.tenAddSuccess,
            usespecialityAddSuccess: CONFIG?.worldofdarkness?.usespecialityAddSuccess === true,
            specialityAddSuccess: CONFIG?.worldofdarkness?.specialityAddSuccess,
          },
        });
      }

      if (replaced > 0) {
        debug("Evil Botches replaced vanilla result line(s)", {
          messageId: message?.id,
          difficulty,
          rollAreas: rollAreas.length,
          replaced,
        });
      }
    } catch (err) {
      error("renderChatMessageHTML hook failed (Evil Botches)", err);
    }
  });
}

function isEvilBotchesEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS_KEYS.EVIL_BOTCHES) === true;
  } catch (err) {
    warn("Failed to read Evil Botches setting", err);
    return false;
  }
}

function isSystemSubtractOnesEnabled() {
  try {
    // This is set by the WoD20 system from its own settings.
    return CONFIG?.worldofdarkness?.handleOnes === true;
  } catch (_err) {
    return false;
  }
}

/**
 * Compute how many successes a '10' contributes according to system configuration.
 *
 * System logic reference (roll-dice.js):
 * - If usespecialityAddSuccess && roll is specialized => success += specialityAddSuccess
 * - else if usetenAddSuccess => success += tenAddSuccess
 * - else => success += 1
 */
function getTenSuccessValue(isSpecialized) {
  const cfg = CONFIG?.worldofdarkness ?? {};

  const useSpec = cfg.usespecialityAddSuccess === true && isSpecialized === true;
  if (useSpec) {
    const v = Number(cfg.specialityAddSuccess);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  if (cfg.usetenAddSuccess === true) {
    const v = Number(cfg.tenAddSuccess);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  return 1;
}

/**
 * Best-effort specialization detection without touching system internals.
 *
 * We do NOT have reliable specialization flags on generic rolls.
 * The system typically indicates specialization in the chat card info section.
 * We try to detect it from `.tray-info-area` content within the same roll-area.
 *
 * If detection fails, we safely assume "not specialized" to avoid false positives.
 */
function detectSpecializationInRollArea(area) {
  try {
    // Try to find a localized label if the system provides one.
    // If the key does not exist, localize() returns the key; we guard against that.
    const label = game.i18n.localize("wod.dice.speciality");
    const hasRealLabel = typeof label === "string" && label !== "wod.dice.speciality";

    const infoRoot =
      area.querySelector(".tray-info-area") ||
      area.closest(".tray-roll-area")?.querySelector(".tray-info-area") ||
      null;

    if (!infoRoot) return false;

    const text = (infoRoot.textContent ?? "").trim().toLowerCase();
    if (text.length === 0) return false;

    if (hasRealLabel) {
      const l = label.trim().toLowerCase();
      if (l.length > 0 && text.includes(l)) {
        // Any mention of specialization label is considered "specialized" for this roll.
        // This matches how the system presents "Specialization" only when enabled.
        return true;
      }
    }

    // Fallback heuristics for RU/EN UI strings often used around specialization:
    // (kept intentionally conservative)
    if (text.includes("special") && text.includes("spec")) return true;
    if (text.includes("спец") && text.includes("иал")) return true;

    return false;
  } catch (_err) {
    return false;
  }
}

function buildOutcome(successes, ones) {
  if (successes === 0 && ones === 0) {
    return { kind: "failure", value: 0 };
  }

  if (successes === ones) {
    return { kind: "failure", value: 0 };
  }

  if (successes > ones) {
    return { kind: "success", value: successes - ones };
  }

  return { kind: "botch", value: ones - successes };
}

function extractDifficultyFromChatCard(root) {
  try {
    const label = game.i18n.localize("wod.dice.difficulty");
    const infoLines = Array.from(root.querySelectorAll(".tray-info-area .tray-action-area"));

    const diffLine = infoLines.find((el) => {
      const t = (el?.textContent ?? "").trim();
      return t.length > 0 && t.includes(label);
    });

    const raw = (diffLine?.textContent ?? "").trim();
    const m = raw.match(/(\d+)/);
    if (!m) return NaN;

    return Number.parseInt(m[1], 10);
  } catch (_err) {
    return NaN;
  }
}

function extractDieValueFromImg(img) {
  try {
    const raw = img?.getAttribute?.("title");
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_err) {
    return 0;
  }
}
