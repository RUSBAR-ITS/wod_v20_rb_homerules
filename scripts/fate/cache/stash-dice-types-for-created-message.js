import { debugNs } from "../../logger/ns.js";
import { getFateDiceTypesCacheState } from "./get-fate-dice-types-cache-state.js";

const { debug, warn } = debugNs("fate:cache:dice-types");

/**
 * Move one cached draft entry (queued under draft key) to a stable message.id key.
 *
 * This runs on createChatMessage, where message.id is available and stable.
 *
 * @param {ChatMessage} message
 */
export function stashDiceTypesForCreatedMessage(message) {
  const state = getFateDiceTypesCacheState();
  prune(state);

  const speaker = message?.speaker ?? {};
  const timestamp = Number(message?.timestamp ?? 0);
  const rollCount = Array.isArray(message?.rolls) ? message.rolls.length : 0;

  const key = buildDraftKey(speaker, timestamp, rollCount);
  const queue = state.draftQueueByKey.get(key);

  if (!Array.isArray(queue) || queue.length === 0) {
    debug("Stash step: draft cache miss (no queued entries for key)", {
      messageId: message?.id,
      key,
      timestamp,
      rollCount,
      speaker: {
        scene: speaker?.scene ?? null,
        token: speaker?.token ?? null,
        actor: speaker?.actor ?? null,
      },
    });
    return;
  }

  const entry = queue.shift();
  if (queue.length === 0) state.draftQueueByKey.delete(key);
  else state.draftQueueByKey.set(key, queue);

  if (!message?.id) {
    warn("Stash step: message has no id; cannot store by message.id", { key });
    return;
  }

  state.diceTypesByMessageId.set(message.id, {
    createdAt: Date.now(),
    diceTypes: Array.isArray(entry?.diceTypes) ? entry.diceTypes : [],
  });

  debug("Stashed diceTypes under message.id", {
    messageId: message.id,
    fromKey: key,
    remainingInQueue: queue.length,
    diceTypes: Array.isArray(entry?.diceTypes) ? entry.diceTypes.length : 0,
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

  for (const [key, queue] of state.draftQueueByKey.entries()) {
    const fresh = queue.filter((e) => now - e.createdAt <= state.TTL_MS);
    if (fresh.length === 0) state.draftQueueByKey.delete(key);
    else state.draftQueueByKey.set(key, fresh);
  }

  for (const [messageId, entry] of state.diceTypesByMessageId.entries()) {
    if (!entry || now - entry.createdAt > state.TTL_MS) state.diceTypesByMessageId.delete(messageId);
  }
}
