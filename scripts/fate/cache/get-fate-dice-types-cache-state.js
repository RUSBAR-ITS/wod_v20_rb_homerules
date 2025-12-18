/**
 * Return a singleton state for the Fate diceTypes in-memory transport cache.
 *
 * Exported as a function (not a module-level exported object) so that:
 * - the file keeps a single exported function (module rule),
 * - consumers cannot accidentally reassign the maps.
 *
 * NOTE:
 * This cache is intentionally short-lived and best-effort.
 */
export function getFateDiceTypesCacheState() {
  if (getFateDiceTypesCacheState._state) return getFateDiceTypesCacheState._state;

  getFateDiceTypesCacheState._state = {
    TTL_MS: 60_000,
    MAX_QUEUE_PER_KEY: 5,
    draftQueueByKey: new Map(), // key -> Array<{ createdAt, diceTypes }>
    diceTypesByMessageId: new Map(), // message.id -> { createdAt, diceTypes }
  };

  return getFateDiceTypesCacheState._state;
}
