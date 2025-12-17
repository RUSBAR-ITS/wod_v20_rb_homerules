import { MODULE_ID } from "../constants/module-id.js";
import { isDebugEnabled } from "./state.js";

/**
 * Prefix builder for all module logs.
 *
 * We include the module id and an optional namespace so logs are easy to filter:
 *   [rusbar-homerules-for-wod-v20-system:fate:render] ...
 */
function prefix(ns) {
  return `[${MODULE_ID}${ns ? `:${ns}` : ""}]`;
}

/**
 * Create a namespaced logger.
 *
 * Design goals:
 * - Always available and safe to use.
 * - debug(...) is suppressed unless enableDebug=true.
 * - info/warn/error always print (they are high-signal).
 *
 * Usage:
 *   const { debug, info, warn, error } = debugNs("fate:render");
 *   debug("Inserted", { ... });
 */
export function debugNs(ns) {
  const p = prefix(ns);

  return {
    /**
     * Verbose logs (only when debug is enabled).
     */
    debug: (...args) => {
      if (!isDebugEnabled()) return;
      console.debug(p, ...args);
    },

    /**
     * Normal informational logs (always on).
     */
    info: (...args) => console.info(p, ...args),

    /**
     * Warnings (always on).
     */
    warn: (...args) => console.warn(p, ...args),

    /**
     * Errors (always on).
     */
    error: (...args) => console.error(p, ...args),
  };
}
