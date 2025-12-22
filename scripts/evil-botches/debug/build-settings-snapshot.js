/**
 * Build a diagnostic snapshot of relevant settings and system flags.
 *
 * This intentionally does NOT log; it only prepares a plain object.
 */
export function buildSettingsSnapshot({ gate, isEvilBotchesEnabled, isSystemSubtractOnesEnabled }) {
  return {
    moduleEnabled: isEvilBotchesEnabled(),
    systemHandleOnes: isSystemSubtractOnesEnabled(),
    gateOk: gate?.ok ?? null,
    gateReason: gate?.reason ?? null,
    systemTenRule: CONFIG?.worldofdarkness?.usetenAddSuccess ?? null,
    systemTenAddSuccess: CONFIG?.worldofdarkness?.tenAddSuccess ?? null,
    systemSpecialtyRule: CONFIG?.worldofdarkness?.usespecialityAddSuccess ?? null,
    systemSpecialtyAddSuccess: CONFIG?.worldofdarkness?.specialityAddSuccess ?? null,
    systemSpecialtyAllowBotch: CONFIG?.worldofdarkness?.specialityAllowBotch ?? null,
    systemUseOnesSoak: CONFIG?.worldofdarkness?.useOnesSoak ?? null,
    systemUseOnesDamage: CONFIG?.worldofdarkness?.useOnesDamage ?? null,
  };
}
