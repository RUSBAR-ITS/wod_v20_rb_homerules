/**
 * Log why the gating layer skipped Evil Botches.
 */
export function logGateSkip(debug, message, rollCtx, gate, safeJsonStringify) {
  debug("Evil Botches: gating skipped", {
    messageId: message?.id ?? null,
    rollTraceId: rollCtx?.rollTraceId ?? null,
    reason: gate?.reason ?? null,
    detailsJson: safeJsonStringify(gate?.details ?? null),
  });
}
