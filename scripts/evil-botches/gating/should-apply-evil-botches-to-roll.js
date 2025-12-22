import { getFavoritedSnapshot } from "./get-favorited-snapshot.js";

/**
 * Decide if we should apply Evil Botches to this message.
 *
 * Evil Botches must only run when the SYSTEM would actually subtract ones.
 * Otherwise, chat output becomes inconsistent with the real roll result.
 */
export function shouldApplyEvilBotchesToRoll({ rollCtx, actor }) {
  const origin = rollCtx?.origin ?? null;

  // Global system toggle.
  if (CONFIG?.worldofdarkness?.handleOnes !== true) {
    return {
      ok: false,
      reason: "system-handleOnes-disabled",
      details: { origin },
    };
  }

  // Origin-specific system toggles.
  if (origin === "soak" && CONFIG?.worldofdarkness?.useOnesSoak !== true) {
    return {
      ok: false,
      reason: "system-useOnesSoak-disabled",
      details: { origin },
    };
  }

  if (origin === "damage" && CONFIG?.worldofdarkness?.useOnesDamage !== true) {
    return {
      ok: false,
      reason: "system-useOnesDamage-disabled",
      details: { origin },
    };
  }

  // System roll logic checks actor presence before applying ones logic.
  // If we don't have an actor, we cannot reliably mirror system behavior.
  if (!actor) {
    return {
      ok: false,
      reason: "no-actor",
      details: {
        origin,
        actorId: rollCtx?.actorId ?? null,
        attribute: rollCtx?.attribute ?? null,
        ability: rollCtx?.ability ?? null,
      },
    };
  }

  // System does NOT subtract ones for favorited traits.
  // We mirror that to keep chat display consistent.
  const fav = getFavoritedSnapshot(actor, rollCtx);
  if (fav.isFavorited === true) {
    return {
      ok: false,
      reason: "favorited-trait",
      details: {
        origin,
        actorId: actor.id,
        attribute: fav.attribute,
        ability: fav.ability,
        hits: fav.hits,
      },
    };
  }

  return {
    ok: true,
    reason: "ok",
    details: {
      origin,
      actorId: actor.id,
    },
  };
}
