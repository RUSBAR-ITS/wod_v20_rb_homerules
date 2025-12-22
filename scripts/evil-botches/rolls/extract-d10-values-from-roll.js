/**
 * Extract d10 results from a Roll object.
 *
 * We intentionally do not rely on rendered HTML or image attributes.
 * We prefer roll.dice (if present), otherwise we fall back to scanning roll.terms.
 *
 * Returns a list of integer results in [1..10].
 */
export function extractD10ValuesFromRoll(roll) {
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
