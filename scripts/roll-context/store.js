import { debugNs } from "../logger/ns.js";

const { debug, warn } = debugNs("rollctx:store");

/**
 * Roll context store (client-side, in-memory).
 *
 * Why this exists:
 * - We intentionally do NOT patch the upstream DiceRoller.
 * - The system does not persist per-roll parameters (specialization / willpower / origin / difficulty)
 *   in ChatMessage flags.
 * - Bonus auto-successes (attribute_auto_buff) are applied inside DiceRoller and are NOT visible
 *   by inspecting dice results.
 *
 * Therefore we:
 * - Set a one-shot "pending" roll context right before a dialog triggers DiceRoller.
 * - Consume that context in preCreateChatMessage and attach it to message flags.
 *
 * Diagnostics:
 * - This store is a critical junction where context can be lost (missing / overwritten / stale).
 * - We log *all* values (flat) on set/consume/stale drop.
 */

const GLOBAL_KEY = "__rusbarWodV20Homerules_rollContextStore__";

/**
 * @returns {{ pendingByUserId: Record<string, any> }}
 */
function getGlobalStore() {
  const g = globalThis;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { pendingByUserId: {} };
  return g[GLOBAL_KEY];
}

/**
 * Flatten a context into a log-friendly object.
 * @param {any} ctx
 */
function summarizeCtx(ctx) {
  if (!ctx) return null;
  return {
    rollTraceId: ctx.rollTraceId ?? null,
    createdAtMs: ctx.createdAtMs ?? null,
    actorId: ctx.actorId ?? null,
    origin: ctx.origin ?? null,
    attribute: ctx.attribute ?? null,
    difficulty: ctx.difficulty ?? null,
    isSpecialized: ctx.isSpecialized ?? null,
    useWillpower: ctx.useWillpower ?? null,
    autoSuccesses: ctx.autoSuccesses ?? null,
  };
}

/**
 * Set or replace the pending context for the given user.
 *
 * @param {string} userId
 * @param {object} ctx
 */
export function setPendingRollContext(userId, ctx) {
  const store = getGlobalStore();

  const createdAtMs = Date.now();
  const next = {
    ...ctx,
    createdAtMs,
  };

  store.pendingByUserId[userId] = next;

  debug("setPendingRollContext", {
    userId,
    createdAtMs,
    ctx: summarizeCtx(next),
  });
}

/**
 * Set auto-successes for the user's current pending context (best-effort).
 *
 * @param {string} userId
 * @param {{ actorId?: string, attribute?: string, autoSuccesses?: number }} params
 */
export function setPendingAutoSuccesses(userId, params) {
  const store = getGlobalStore();
  const ctx = store.pendingByUserId?.[userId];

  if (!ctx) {
    debug("setPendingAutoSuccesses: skipped (no pending ctx)", {
      userId,
      params,
    });
    return;
  }

  // Guard: try to avoid attaching an unrelated auto-buff to a different pending roll.
  if (params?.actorId && ctx.actorId && params.actorId !== ctx.actorId) {
    debug("setPendingAutoSuccesses: skipped (actorId mismatch)", {
      userId,
      rollTraceId: ctx.rollTraceId ?? null,
      pendingActorId: ctx.actorId,
      paramsActorId: params.actorId,
      params,
    });
    return;
  }
  if (params?.attribute && ctx.attribute && params.attribute !== ctx.attribute) {
    debug("setPendingAutoSuccesses: skipped (attribute mismatch)", {
      userId,
      rollTraceId: ctx.rollTraceId ?? null,
      pendingAttribute: ctx.attribute,
      paramsAttribute: params.attribute,
      params,
    });
    return;
  }

  const v = Number.parseInt(params?.autoSuccesses ?? 0, 10);
  ctx.autoSuccesses = Number.isFinite(v) && v > 0 ? v : 0;

  debug("setPendingAutoSuccesses", {
    userId,
    rollTraceId: ctx.rollTraceId ?? null,
    actorId: params?.actorId ?? null,
    attribute: params?.attribute ?? null,
    rawAutoSuccesses: params?.autoSuccesses ?? null,
    parsedAutoSuccesses: v,
    storedAutoSuccesses: ctx.autoSuccesses,
    ctx: summarizeCtx(ctx),
  });
}

/**
 * Consume and clear the pending context for the given user.
 *
 * @param {string} userId
 * @param {number} [maxAgeMs=4000]
 * @returns {object|null}
 */
export function consumePendingRollContext(userId, maxAgeMs = 4000) {
  const store = getGlobalStore();
  const ctx = store.pendingByUserId?.[userId];
  if (!ctx) {
    debug("consumePendingRollContext: none", { userId, maxAgeMs });
    return null;
  }

  const now = Date.now();
  const createdAt = ctx.createdAtMs || 0;
  const age = now - createdAt;

  if (age > maxAgeMs) {
    warn("Pending roll context is stale; dropping", {
      userId,
      maxAgeMs,
      now,
      createdAtMs: createdAt,
      ageMs: age,
      ctx: summarizeCtx(ctx),
    });
    delete store.pendingByUserId[userId];
    return null;
  }

  delete store.pendingByUserId[userId];

  debug("consumePendingRollContext", {
    userId,
    maxAgeMs,
    now,
    createdAtMs: createdAt,
    ageMs: age,
    ctx: summarizeCtx(ctx),
  });

  return ctx;
}
