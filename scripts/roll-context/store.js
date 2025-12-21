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
 * - Capture auto-successes when DiceRoller calls BonusHelper.GetAttributeAutoBuff().
 * - Attach the finalized context to the next ChatMessage in preCreateChatMessage.
 */

const GLOBAL_KEY = "__RUSBAR_HR_ROLL_CTX__";

function getGlobalStore() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      /** @type {Record<string, any>} */
      pendingByUserId: {},
    };
  }
  return globalThis[GLOBAL_KEY];
}

/**
 * Create a new pending roll context.
 *
 * @param {string} userId
 * @param {{
 *  actorId?: string,
 *  attribute?: string,
 *  origin?: string,
 *  difficulty?: number,
 *  isSpecialized?: boolean,
 *  useWillpower?: boolean,
 *  nonce?: string
 * }} params
 */
export function setPendingRollContext(userId, params) {
  const store = getGlobalStore();

  const now = Date.now();
  const ctx = {
    nonce: String(params?.nonce ?? crypto?.randomUUID?.() ?? `${now}-${Math.random()}`),
    createdAtMs: now,

    // Roll inputs we want to persist.
    actorId: params?.actorId ?? null,
    attribute: params?.attribute ?? null,
    origin: params?.origin ?? null,
    difficulty: Number.isFinite(Number(params?.difficulty)) ? Number(params.difficulty) : null,
    isSpecialized: params?.isSpecialized === true,
    useWillpower: params?.useWillpower === true,

    // Captured later inside DiceRoller via BonusHelper wrapper.
    autoSuccesses: 0,
  };

  store.pendingByUserId[userId] = ctx;
  debug("setPendingRollContext", { userId, ctx });
}

/**
 * Best-effort update of auto-successes for the pending context.
 *
 * This is called from our BonusHelper.GetAttributeAutoBuff wrapper.
 *
 * @param {string} userId
 * @param {{ actorId?: string, attribute?: string, autoSuccesses?: number }} params
 */
export function setPendingAutoSuccesses(userId, params) {
  const store = getGlobalStore();
  const ctx = store.pendingByUserId?.[userId];

  if (!ctx) return;

  // Guard: try to avoid attaching an unrelated auto-buff to a different pending roll.
  if (params?.actorId && ctx.actorId && params.actorId !== ctx.actorId) return;
  if (params?.attribute && ctx.attribute && params.attribute !== ctx.attribute) return;

  const v = Number.parseInt(params?.autoSuccesses ?? 0, 10);
  ctx.autoSuccesses = Number.isFinite(v) && v > 0 ? v : 0;
  debug("setPendingAutoSuccesses", { userId, actorId: params?.actorId, attribute: params?.attribute, v: ctx.autoSuccesses });
}

/**
 * Consume and clear the pending context for the given user.
 *
 * @param {string} userId
 * @param {number} [maxAgeMs=4000]
 */
export function consumePendingRollContext(userId, maxAgeMs = 4000) {
  const store = getGlobalStore();
  const ctx = store.pendingByUserId?.[userId];
  if (!ctx) return null;

  const age = Date.now() - (ctx.createdAtMs || 0);
  if (age > maxAgeMs) {
    warn("Pending roll context is stale; dropping", { userId, age, ctx });
    delete store.pendingByUserId[userId];
    return null;
  }

  delete store.pendingByUserId[userId];
  debug("consumePendingRollContext", { userId, ctx });
  return ctx;
}
