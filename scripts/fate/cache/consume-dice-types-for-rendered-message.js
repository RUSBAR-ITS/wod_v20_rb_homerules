import { debugNs } from "../../logger/ns.js";
import { getFateDiceTypesCacheState } from "./get-fate-dice-types-cache-state.js";

const { debug } = debugNs("fate:cache:dice-types");

/**
 * Consume diceTypes for a rendered chat message by stable message.id key.
 *
 * One-shot: removes the entry to prevent accidental reuse.
 *
 * @param {ChatMessage} message
 * @returns {string[] | null}
 */
export function consumeDiceTypesForRenderedMessage(message) {
  const state = getFateDiceTypesCacheState();
  prune(state);

  const messageId = message?.id;
  if (!messageId) return null;

  const entry = state.diceTypesByMessageId.get(messageId);
  if (!entry) {
    debug("Consume step: message.id cache miss", { messageId });
    return null;
  }

  state.diceTypesByMessageId.delete(messageId);

  debug("Consume step: message.id cache hit", {
    messageId,
    diceTypes: Array.isArray(entry?.diceTypes) ? entry.diceTypes.length : 0,
  });

  return Array.isArray(entry?.diceTypes) ? entry.diceTypes : null;
}

function prune(state) {
  const now = Date.now();

  for (const [key, queue] of state.draftQueueByKey.entries()) {
    const fresh = queue.filter((e) => now - e.createdAt <= state.TTL_MS);
    if (fresh.length === 0) state.draftQueueByKey.delete(key);
    else state.draftQueueByKey.set(key, fresh);
  }

  for (const [messageId, entry] of state.diceTypesByMessageId.entries()) {
    if (!entry || now - entry.createdAt > state.TTL_MS) state.diceTypesByMessageId.delete(messageId);
  }
}
