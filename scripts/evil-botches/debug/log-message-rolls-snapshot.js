/**
 * Log message rolls and extracted d10 values snapshot.
 */
export function logMessageRollsSnapshot(debug, message, rollCtx, { msgRolls, dieValues, safeJsonStringify }) {
  debug("Evil Botches: message rolls snapshot", {
    messageId: message?.id ?? null,
    rollTraceId: rollCtx?.rollTraceId ?? null,
    rollsCount: msgRolls.length,
    hasMessageRoll: Boolean(message?.roll),
    hasMessageRolls: Array.isArray(message?.rolls) && message.rolls.length > 0,
    d10ValuesCount: dieValues.length,
    d10ValuesJson: safeJsonStringify(dieValues),
  });
}
