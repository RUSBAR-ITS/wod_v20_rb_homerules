import { getTenSuccessValue } from "../rolls/get-ten-success-value.js";

/**
 * Log a detailed calculation snapshot.
 */
export function logCalc(
  debug,
  message,
  rollCtx,
  { areaIndex, difficulty, origin, isSpecialized, isWillpowerUsed, autoSuccesses, dieValues, calc, safeJsonStringify }
) {
  debug("Evil Botches calc", {
    messageId: message?.id ?? null,
    rollTraceId: rollCtx?.rollTraceId ?? null,
    areaIndex,
    difficulty,
    isSpecialized,
    isWillpowerUsed,
    ones: calc?.ones ?? null,
    autoSuccesses,
    successesFromDice: calc?.diceSuccesses ?? null,
    successesBeforeSubtractOnes: calc?.successesBeforeOnes ?? null,
    netBeforeWillpower: calc?.outcome?.netBeforeWillpower ?? null,
    netAfterWillpower: calc?.outcome?.netAfterWillpower ?? null,
    willpowerRuleApplied: calc?.outcome?.willpowerRuleApplied ?? null,
    outcome: calc?.outcome ?? null,
    diceCount: dieValues.length,
    dieValuesJson: safeJsonStringify(dieValues),
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
}
