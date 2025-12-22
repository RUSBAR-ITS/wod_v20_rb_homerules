/**
 * Mirror the system's "favorited" checks used to bypass subtract-ones logic.
 *
 * The system checks both attributes and abilities namespaces for both keys
 * (attribute and ability), because those keys can swap depending on the roll.
 */
export function getFavoritedSnapshot(actor, rollCtx) {
  const attribute = rollCtx?.attribute ?? null;
  const ability = rollCtx?.ability ?? null;

  const hits = [];

  try {
    const sys = actor?.system ?? null;
    const attrs = sys?.attributes ?? null;
    const abils = sys?.abilities ?? null;

    // attributes[attribute]
    if (attribute && attrs?.[attribute]?.isfavorited === true) hits.push({ path: `attributes.${attribute}.isfavorited` });
    // attributes[ability]
    if (ability && attrs?.[ability]?.isfavorited === true) hits.push({ path: `attributes.${ability}.isfavorited` });
    // abilities[attribute]
    if (attribute && abils?.[attribute]?.isfavorited === true) hits.push({ path: `abilities.${attribute}.isfavorited` });
    // abilities[ability]
    if (ability && abils?.[ability]?.isfavorited === true) hits.push({ path: `abilities.${ability}.isfavorited` });
  } catch (_err) {
    // ignore
  }

  return {
    attribute,
    ability,
    isFavorited: hits.length > 0,
    hits,
  };
}
