import { MODULE_ID } from "../constants/module-id.js";

/**
 * Generate a correlation id for a single roll flow.
 *
 * Purpose:
 * - Allows correlating logs across: dialog patch -> pending store -> chat attach -> evil-botches calc.
 *
 * NOTE:
 * - This is diagnostic-only data and must not affect roll logic.
 *
 * @param {string} [userId]
 * @returns {string}
 */
export function createRollTraceId(userId) {
  const uid = userId ?? game?.user?.id ?? "unknown-user";
  const ts = Date.now();
  // 6 hex chars is enough to avoid collisions within a session.
  const rnd = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `${MODULE_ID}:${uid}:${ts}:${rnd}`;
}
