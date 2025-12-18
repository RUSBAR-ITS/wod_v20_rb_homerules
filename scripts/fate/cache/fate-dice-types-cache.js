import { debugNs } from "../../logger/ns.js";

const { debug, warn } = debugNs("fate:cache:dice-types");

/**
 * A small in-memory cache used as a reliable transport between:
 * - preCreateChatMessage (where we can compute diceTypes)
 * - renderChatMessageHTML (where we need diceTypes to alter the rendered output)
 *
 * Why we need this:
 * In Foundry v13, other modules (or internal cloning) may overwrite ChatMessage.flags
 * during creation. The debug logs have shown cases where diceTypes are set in the
 * preCreate hook but are missing on the final ChatMessage document at render time.
 *
 * This cache is intentionally best-effort:
 * - entries are short-lived (TTL)
 * - we keep a small queue per key to avoid collisions when rolls happen close together
 * - we always prefer message.flags when available
 */

const TTL_MS = 60_000;
const MAX_QUEUE_PER_KEY = 5;

/** @type {Map<string, Array<{ createdAt: number, diceTypes: string[] }>>} */
const _cache = new Map();

/**
 * Build a stable cache key from message draft data.
 *
 * @param {object} speaker
 * @param {number} timestamp
 * @param {number} rollCount
 * @returns {string}
 */
function buildKey(speaker, timestamp, rollCount) {
  const actorId = speaker?.actor ?? "";
  const tokenId = speaker?.token ?? "";
  const sceneId = speaker?.scene ?? "";
  const ts = Number.isFinite(timestamp) ? timestamp : 0;
  const rc = Number.isFinite(rollCount) ? rollCount : 0;
  return `${sceneId}:${tokenId}:${actorId}:${ts}:${rc}`;
}

/**
 * Prune old entries (TTL-based) to prevent memory leaks.
 */
function prune() {
  const now = Date.now();

  for (const [key, queue] of _cache.entries()) {
    const fresh = queue.filter((e) => now - e.createdAt <= TTL_MS);

    if (fresh.length === 0) _cache.delete(key);
    else _cache.set(key, fresh);
  }
}

/**
 * Store diceTypes computed in preCreateChatMessage.
 *
 * @param {object} data The raw ChatMessage creation data.
 * @param {string[]} diceTypes Array aligned with the draft `rolls` array.
 */
export function cacheDiceTypesForMessageDraft(data, diceTypes) {
  prune();

  const speaker = data?.speaker ?? {};
  const timestamp = Number(data?.timestamp ?? 0);
  const rollCount = Array.isArray(data?.rolls) ? data.rolls.length : 0;

  const key = buildKey(speaker, timestamp, rollCount);

  const entry = {
    createdAt: Date.now(),
    diceTypes: Array.isArray(diceTypes) ? [...diceTypes] : [],
  };

  const queue = _cache.get(key) ?? [];
  queue.push(entry);

  if (queue.length > MAX_QUEUE_PER_KEY) {
    // Keep only the newest few entries.
    queue.splice(0, queue.length - MAX_QUEUE_PER_KEY);
    warn("Cache queue exceeded max size; trimming", { key, size: queue.length });
  }

  _cache.set(key, queue);

  debug("Cached diceTypes for message draft", {
    key,
    queued: queue.length,
    diceTypes: entry.diceTypes.length,
  });
}

/**
 * Consume diceTypes for an already created ChatMessage.
 *
 * This is a one-shot read: once consumed, the entry is removed from the queue.
 *
 * @param {ChatMessage} message
 * @returns {string[] | null}
 */
export function consumeCachedDiceTypesForMessage(message) {
  prune();

  const speaker = message?.speaker ?? {};
  const timestamp = Number(message?.timestamp ?? 0);
  const rollCount = Array.isArray(message?.rolls) ? message.rolls.length : 0;

  const key = buildKey(speaker, timestamp, rollCount);
  const queue = _cache.get(key);

  if (!Array.isArray(queue) || queue.length === 0) {
    debug("Cache miss for message", { key });
    return null;
  }

  const entry = queue.shift();
  if (queue.length === 0) _cache.delete(key);
  else _cache.set(key, queue);

  debug("Cache hit for message", {
    key,
    remaining: queue.length,
    diceTypes: entry?.diceTypes?.length ?? 0,
  });

  return Array.isArray(entry?.diceTypes) ? entry.diceTypes : null;
}
