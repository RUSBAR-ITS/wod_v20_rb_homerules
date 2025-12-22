/**
 * Get Roll objects from a ChatMessage in a version-tolerant way.
 * - Foundry usually provides message.rolls (array).
 * - Some cases may still provide message.roll (single).
 */
export function getMessageRolls(message) {
  try {
    if (Array.isArray(message?.rolls) && message.rolls.length > 0) return message.rolls;
    if (message?.roll) return [message.roll];
  } catch (_err) {
    // ignore
  }
  return [];
}
