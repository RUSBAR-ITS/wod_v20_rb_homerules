import { isDebugEnabled } from "../../logger/state.js";
import { safeJsonStringify } from "./safe-json-stringify.js";

/**
 * Centralized (opt-in) debug logging for Evil Botches.
 *
 * Rule:
 * - Any NEW, more verbose logging introduced during refactors must go through
 *   this helper so that the additional noise is only emitted when debug mode
 *   is enabled.
 *
 * Existing log statements may continue to use `debug()` directly to avoid
 * changing behavior; this helper is for *newly introduced* verbosity.
 *
 * @param {Function} debug - debug logger from debugNs(...)
 * @param {string} message
 * @param {any} payload
 */
export function evilBotchesDebugLog(debug, message, payload = null) {
  try {
    if (isDebugEnabled() !== true) return;

    // We stringify payloads to keep file logs readable.
    if (payload === null || payload === undefined) {
      debug(message);
      return;
    }

    debug(message, { payloadJson: safeJsonStringify(payload) });
  } catch (_err) {
    // Intentionally ignore logging failures.
  }
}
