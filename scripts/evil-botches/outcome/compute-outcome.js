/**
 * Compute Evil Botches display outcome.
 *
 * This mirrors the current module's home rule behavior and MUST NOT change.
 */
export function computeOutcome(successesBeforeOnes, ones, isWillpowerUsed) {
  const s = Number.isFinite(successesBeforeOnes) ? successesBeforeOnes : 0;
  const o = Number.isFinite(ones) ? ones : 0;

  const netBeforeWillpower = s - o;
  let netAfterWillpower = netBeforeWillpower;
  let willpowerRuleApplied = "none";

  // Home rule (module-specific):
  // - If Willpower is used and net >= 1 => net += 1
  // - If Willpower is used and net <= 0 => net = 1
  // This rule is applied AFTER subtracting ones.
  if (isWillpowerUsed === true) {
    if (netAfterWillpower >= 1) {
      netAfterWillpower += 1;
      willpowerRuleApplied = "plus-1";
    } else {
      netAfterWillpower = 1;
      willpowerRuleApplied = "set-to-1";
    }
  }

  // Determine outcome based on the final net value.
  // If Willpower is used, it guarantees a success with this home rule.
  if (netAfterWillpower > 0) {
    return {
      kind: "success",
      value: netAfterWillpower,
      netBeforeWillpower,
      netAfterWillpower,
      willpowerRuleApplied,
    };
  }

  if (o > s) {
    return {
      kind: "botch",
      value: o - s,
      netBeforeWillpower,
      netAfterWillpower,
      willpowerRuleApplied,
    };
  }

  return {
    kind: "failure",
    value: 0,
    netBeforeWillpower,
    netAfterWillpower,
    willpowerRuleApplied,
  };
}
