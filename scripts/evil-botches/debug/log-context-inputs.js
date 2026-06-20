/**
 * Log derived context inputs used for calculation.
 */
export function logContextInputs(debug, message, rollCtx, { origin, isSpecialized, isWillpowerUsed }) {
  debug("Evil Botches: context inputs", {
    messageId: message?.id ?? null,
    rollTraceId: rollCtx?.rollTraceId ?? null,
    origin,
    isSpecialized,
    isWillpowerUsed,
    source: {
      origin: "flags",
      isSpecialized: "flags",
      useWillpower: "flags",
    },
    rawFlags: {
      difficulty: rollCtx?.difficulty ?? null,
      isSpecialized: rollCtx?.isSpecialized ?? null,
      useWillpower: rollCtx?.useWillpower ?? null,
      actorId: rollCtx?.actorId ?? null,
      attribute: rollCtx?.attribute ?? null,
      autoSuccesses: rollCtx?.autoSuccesses ?? null,
    },
  });
}
