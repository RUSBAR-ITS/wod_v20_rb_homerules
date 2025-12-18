import { debugNs } from "../../logger/ns.js";
import { getFateDiceTypesCacheState } from "./get-fate-dice-types-cache-state.js";

const { debug, warn } = debugNs("fate:cache:dice-types");

/**
 * Cache diceTypes computed in preCreateChatMessage under a "draft key".
 *
 * The draft key is built from speaker + timestamp + rollCount.
 * This is NOT perfectly stable across Foundry internals, which is why we
 * later move (stash) one queued entry under the created message.id.
 *
 * @param {object} data - Raw ChatMessage creation data (preCreateChatMessage)
 * @param {string[]} diceTypes - array aligned with draft data.rolls
 */
export function cacheDiceTypesForMessageDraft(data, diceTypes) {
  const state = getFateDiceTypesCacheState();
  prune(state);

  const speaker = data?.speaker ?? {};
  const timestamp = Number(data?.timestamp ?? 0);
  const rollCount = Array.isArray(data?.rolls) ? data.rolls.length : 0;

  const key = buildDraftKey(speaker, timestamp, rollCount);

  const entry = {
    createdAt: Date.now(),
    diceTypes: Array.isArray(diceTypes) ? [...diceTypes] : [],
  };

  const queue = state.draftQueueByKey.get(key) ?? [];
  queue.push(entry);

  if (queue.length > state.MAX_QUEUE_PER_KEY) {
    queue.splice(0, queue.length - state.MAX_QUEUE_PER_KEY);
    warn("Draft cache queue exceeded max size; trimming", { key, size: queue.length });
  }

  state.draftQueueByKey.set(key, queue);

  debug("Cached diceTypes for message draft", {
    key,
    queued: queue.length,
    diceTypes: entry.diceTypes.length,
    timestamp,
    rollCount,
    speaker: {
      scene: speaker?.scene ?? null,
      token: speaker?.token ?? null,
      actor: speaker?.actor ?? null,
    },
  });
}

function buildDraftKey(speaker, timestamp, rollCount) {
  const actorId = speaker?.actor ?? "";
  const tokenId = speaker?.token ?? "";
  const sceneId = speaker?.scene ?? "";
  const ts = Number.isFinite(timestamp) ? timestamp : 0;
  const rc = Number.isFinite(rollCount) ? rollCount : 0;
  return `${sceneId}:${tokenId}:${actorId}:${ts}:${rc}`;
}

function prune(state) {
  const now = Date.now();

  // prune draft queues
  for (const [key, queue] of state.draftQueueByKey.entries()) {
    const fresh = queue.filter((e) => now - e.createdAt <= state.TTL_MS);
    if (fresh.length === 0) state.draftQueueByKey.delete(key);
    else state.draftQueueByKey.set(key, fresh);
  }

  // prune messageId map
  for (const [messageId, entry] of state.diceTypesByMessageId.entries()) {
    if (!entry || now - entry.createdAt > state.TTL_MS) state.diceTypesByMessageId.delete(messageId);
  }
}
