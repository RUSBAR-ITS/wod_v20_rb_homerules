/**
 * Log how many roll areas were updated.
 */
export function logReplaced(debug, message, rollCtx, { difficulty, rollAreasCount, replaced }) {
  if (replaced > 0) {
    debug("Evil Botches replaced vanilla result line(s)", {
      messageId: message?.id ?? null,
      rollTraceId: rollCtx?.rollTraceId ?? null,
      difficulty,
      rollAreas: rollAreasCount,
      replaced,
    });
  }
}
