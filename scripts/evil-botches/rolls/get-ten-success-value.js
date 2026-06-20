/**
 * Determine how many successes a d10 result of 10 contributes.
 *
 * Mirrors system rules:
 * - If specialization rule enabled and this roll is specialized -> specialityAddSuccess (usually 2)
 * - Else if ten rule enabled -> tenAddSuccess
 * - Else -> 1
 */
export function getTenSuccessValue(isSpecialized) {
  const cfg = CONFIG?.worldofdarkness;
  if (!cfg) return 1;

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
