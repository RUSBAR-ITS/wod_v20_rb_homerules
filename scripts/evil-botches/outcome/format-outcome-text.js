/**
 * Convert an outcome object to a localized chat line.
 *
 * This uses the existing localization keys and preserves the original display.
 */
export function formatOutcomeText(out) {
  if (out?.kind === "botch") {
    return game.i18n.format("rusbar.homerules.evilBotches.chat.botch", { value: out.value });
  }

  if (out?.kind === "success") {
    return game.i18n.format("rusbar.homerules.evilBotches.chat.success", { value: out.value });
  }

  return game.i18n.localize("rusbar.homerules.evilBotches.chat.failure");
}
