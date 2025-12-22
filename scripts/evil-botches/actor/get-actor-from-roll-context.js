/**
 * Retrieve the Actor referenced by our structured roll context.
 *
 * We intentionally do not try to infer actor from the ChatMessage speaker,
 * because in some edge cases (GM whisper, synthetic speaker, macro rolls)
 * it may not match the actual roll source.
 */
export function getActorFromRollContext(rollCtx) {
  try {
    const actorId = rollCtx?.actorId ?? null;
    if (!actorId) return null;
    return game?.actors?.get(actorId) ?? null;
  } catch (_err) {
    return null;
  }
}
