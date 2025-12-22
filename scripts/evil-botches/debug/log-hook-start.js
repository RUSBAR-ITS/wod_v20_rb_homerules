/**
 * Log initial message/context snapshot for Evil Botches.
 */
export function logHookStart(debug, message, rollCtx, settingsSnapshot, safeJsonStringify) {
  debug("Evil Botches: hook start", {
    messageId: message?.id ?? null,
    rollTraceId: rollCtx?.rollTraceId ?? null,
    userId: message?.user?.id ?? null,
    speaker: message?.speaker ?? null,
    flagsHasRollContext: Boolean(rollCtx),
    // Log as strings so that file logs remain readable (no collapsed "Object").
    rollCtxJson: safeJsonStringify(rollCtx),
    settingsSnapshotJson: safeJsonStringify(settingsSnapshot),
  });
}
