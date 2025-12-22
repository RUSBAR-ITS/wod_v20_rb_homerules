import { getTenSuccessValue } from "./get-ten-success-value.js";
import { computeOutcome } from "../outcome/compute-outcome.js";
import { formatOutcomeText } from "../outcome/format-outcome-text.js";

/**
 * Compute all math for Evil Botches from a plain set of numeric inputs.
 *
 * This function contains the core dice math that used to live in the chat hook.
 * It MUST NOT change logic or ordering.
 */
export function computeEvilBotchesResult({ dieValues, difficulty, isSpecialized, autoSuccesses, isWillpowerUsed }) {
  let ones = 0;
  let diceSuccesses = 0;

  const tenValue = getTenSuccessValue(isSpecialized);

  for (const value of dieValues) {
    if (value === 1) {
      ones += 1;
      continue;
    }

    if (value === 10) {
      diceSuccesses += tenValue;
      continue;
    }

    if (value >= difficulty) {
      diceSuccesses += 1;
    }
  }

  const successesBeforeOnes = diceSuccesses + (Number.isFinite(autoSuccesses) ? autoSuccesses : 0);
  const outcome = computeOutcome(successesBeforeOnes, ones, isWillpowerUsed);
  const outcomeText = formatOutcomeText(outcome);

  return {
    ones,
    diceSuccesses,
    successesBeforeOnes,
    tenValue,
    outcome,
    outcomeText,
  };
}
