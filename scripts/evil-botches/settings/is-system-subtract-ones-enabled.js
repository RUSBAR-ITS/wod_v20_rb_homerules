/**
 * Evil Botches must only apply when the SYSTEM would actually subtract ones.
 *
 * The WoD system uses `CONFIG.worldofdarkness.handleOnes` as the global gate.
 */
export function isSystemSubtractOnesEnabled() {
  return CONFIG?.worldofdarkness?.handleOnes === true;
}
