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
 * Additionally, when the user enabled "Use Willpower" for the roll:
 * - If (successes - ones) > 0 => add +1 success
 * - Else (failure or botch) => force 1 success (so with willpower there is always at least 1 success)
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

      const diff = extractDifficultyFromChatCard(root);
      if (!Number.isFinite(diff.difficulty) || diff.difficulty <= 0) {
        debug("Evil Botches: difficulty not found, skipping message", {
          messageId: message?.id,
          reason: diff.reason,
          extractedLabel: diff.label,
          infoLines: diff.infoLines,
        });
        return;
      }

      const difficulty = diff.difficulty;

      const rollAreas = Array.from(root.querySelectorAll(".tray-roll-area"));
      if (rollAreas.length === 0) {
        debug("Evil Botches: no roll areas found in chat card", { messageId: message?.id });
        return;
      }

      // NOTE:
      // The system template places `.tray-info-area` once per message, *outside* any `.tray-roll-area`.
      // So specialization/willpower flags must be detected on the whole card (`root`), not per roll-area.
      const isSpecialized = detectSpecializationInChatCard(root);
      const isWillpowerUsed = detectWillpowerInChatCard(root);

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

        // Decide output per requirements (+ willpower rule).
        const out = buildOutcome(successes, ones, isWillpowerUsed);

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
          isWillpowerUsed,
          ones,
          successesBeforeSubtractOnes: successes,
          netBeforeWillpower: successes - ones,
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
 * The system indicates specialization in the chat card info section.
 * The `.tray-info-area` is a *single* block per message.
 */
function detectSpecializationInChatCard(root) {
  try {
    // WoD20 system prints specialization as a separate info line when enabled.
    // In some versions it is `wod.dialog.usingspeciality`, in others it can be `wod.dice.speciality`.
    const labelCandidates = [
      "wod.dialog.usingspeciality",
      "wod.dice.speciality",
      "wod.dice.speciality", // kept for backwards compatibility (same key, no harm)
    ];

    const infoRoot = root.querySelector(".tray-info-area");
    if (!infoRoot) return false;

    const text = (infoRoot.textContent ?? "").trim().toLowerCase();
    if (text.length === 0) return false;

    for (const key of labelCandidates) {
      const label = game.i18n.localize(key);
      const hasRealLabel = typeof label === "string" && label !== key;
      if (!hasRealLabel) continue;
      const l = label.trim().toLowerCase();
      if (l.length > 0 && text.includes(l)) return true;
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

/**
 * Willpower usage detection from chat card info.
 *
 * The system prints `wod.dice.usingwillpower` as an info line when the roll used willpower.
 */
function detectWillpowerInChatCard(root) {
  try {
    const infoRoot = root.querySelector(".tray-info-area");
    if (!infoRoot) return false;

    const label = game.i18n.localize("wod.dice.usingwillpower");
    const hasRealLabel = typeof label === "string" && label !== "wod.dice.usingwillpower";

    const text = (infoRoot.textContent ?? "").trim().toLowerCase();
    if (text.length === 0) return false;

    if (hasRealLabel) {
      const l = label.trim().toLowerCase();
      if (l.length > 0 && text.includes(l)) return true;
    }

    // Fallback heuristics (conservative).
    if (text.includes("willpower")) return true;
    if (text.includes("сила") && text.includes("вол")) return true;

    return false;
  } catch (_err) {
    return false;
  }
}

function buildOutcome(successes, ones, isWillpowerUsed) {
  // Apply homerule for Willpower:
  // - if net > 0 => net + 1
  // - else => 1
  if (isWillpowerUsed === true) {
    const net = successes - ones;
    if (net > 0) return { kind: "success", value: net + 1 };
    return { kind: "success", value: 1 };
  }

  // Vanilla "evil botches" outcome.
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
    // WoD20 system prints difficulty as `${localize("wod.labels.difficulty")}: ${difficulty}`.
    // (See system `roll-dice.js`.)
    const label = game.i18n.localize("wod.labels.difficulty");

    const infoEls = Array.from(root.querySelectorAll(".tray-info-area .tray-action-area"));
    const infoLines = infoEls
      .map((el) => (el?.textContent ?? "").trim())
      .filter((t) => t.length > 0);

    // 1) Preferred: match by localized label.
    const diffLineByLabel = infoLines.find((t) => t.includes(label));

    // 2) Fallback: match by conservative RU/EN substring heuristics.
    const diffLineByHeuristic =
      diffLineByLabel ??
      infoLines.find((t) => {
        const low = t.toLowerCase();
        return low.includes("difficulty") || low.includes("сложн");
      });

    const raw = (diffLineByHeuristic ?? "").trim();
    const m = raw.match(/(\d+)/);
    if (!m) {
      return {
        difficulty: NaN,
        label,
        reason: "no_number_match",
        infoLines,
      };
    }

    return {
      difficulty: Number.parseInt(m[1], 10),
      label,
      reason: diffLineByLabel ? "matched_by_label" : "matched_by_heuristic",
      infoLines,
    };
  } catch (_err) {
    return { difficulty: NaN, label: "", reason: "exception", infoLines: [] };
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
