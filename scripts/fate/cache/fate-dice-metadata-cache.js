import { MODULE_ID } from "../../constants/module-id.js";
import { debugNs } from "../../logger/ns.js";

const { debug, warn } = debugNs("fate:chat:cache");

/**
 * In-memory, short-lived cache that links a single ChatMessage to metadata we
 * cannot reliably persist via ChatMessage flags (some stacks rewrite them).
 *
 * We store a `cacheId` in message flags (best-effort) AND also inject a hidden
 * HTML comment marker into message content as a fallback.
 */

/** @type {Map<string, { createdAt: number } & Record<string, any>>} */
const _cache = new Map();

// Safety caps: keep cache small and self-cleaning.
const MAX_ENTRIES = 250;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a reasonably unique id for linking metadata to a message.
 *
 * NOTE: crypto.randomUUID is supported in modern browsers and Foundry v13.
 * If unavailable, we fallback to a timestamp + random string.
 *
 * @returns {string}
 */
export function createFateDiceCacheId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_err) {
    // ignore
  }

  const ts = Date.now();
  const rnd = Math.random().toString(16).slice(2);
  return `rb-fate-${ts}-${rnd}`;
}

/**
 * Store metadata for a single message.
 *
 * @param {string} cacheId
 * @param {Record<string, any>} meta
 */
export function putFateDiceMetadata(cacheId, meta) {
  if (typeof cacheId !== "string" || cacheId.length === 0) return;

  cleanupFateDiceMetadataCache();

  _cache.set(cacheId, {
    createdAt: Date.now(),
    ...meta,
  });

  // Enforce a hard cap (drop oldest entries).
  if (_cache.size > MAX_ENTRIES) {
    const entries = Array.from(_cache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < entries.length - MAX_ENTRIES; i += 1) {
      _cache.delete(entries[i][0]);
    }
  }

  debug("Cache put", { cacheId, keys: Object.keys(meta ?? {}), size: _cache.size });
}

/**
 * Retrieve cached metadata.
 *
 * @param {string} cacheId
 * @returns {Record<string, any> | null}
 */
export function getFateDiceMetadata(cacheId) {
  if (typeof cacheId !== "string" || cacheId.length === 0) return null;

  const hit = _cache.get(cacheId);
  if (!hit) return null;

  // TTL check
  if (Date.now() - hit.createdAt > TTL_MS) {
    _cache.delete(cacheId);
    return null;
  }

  return hit;
}

/**
 * Remove a cache entry.
 *
 * @param {string} cacheId
 */
export function deleteFateDiceMetadata(cacheId) {
  if (typeof cacheId !== "string" || cacheId.length === 0) return;
  _cache.delete(cacheId);
  debug("Cache delete", { cacheId, size: _cache.size });
}

/**
 * Cleanup expired entries.
 */
export function cleanupFateDiceMetadataCache() {
  const now = Date.now();
  let removed = 0;

  for (const [id, v] of _cache.entries()) {
    if (now - v.createdAt > TTL_MS) {
      _cache.delete(id);
      removed += 1;
    }
  }

  if (removed > 0) debug("Cache cleanup", { removed, size: _cache.size });
}

/**
 * Append an invisible marker comment to message content.
 *
 * @param {string} html
 * @param {string} cacheId
 * @returns {string}
 */
export function appendFateCacheIdMarkerToContent(html, cacheId) {
  if (typeof html !== "string" || html.length === 0) return html;
  if (typeof cacheId !== "string" || cacheId.length === 0) return html;

  // Do not double-inject.
  const marker = `rb-fate-cacheid:${cacheId}`;
  if (html.includes(marker)) return html;

  return `${html}\n<!-- ${marker} -->`;
}

/**
 * Try to extract cacheId from rendered HTML (fallback when flags were rewritten).
 *
 * @param {string} html
 * @returns {string|null}
 */
export function extractFateCacheIdFromContent(html) {
  if (typeof html !== "string" || html.length === 0) return null;

  // Marker format: <!-- rb-fate-cacheid:... -->
  const m = html.match(/rb-fate-cacheid:([a-zA-Z0-9\-_.:]+)/);
  if (!m) return null;
  return m[1] ?? null;
}

/**
 * Debug helper: dump a compact snapshot of what we see on a ChatMessage.
 *
 * @param {ChatMessage} message
 */
export function logFateCacheKeyDiagnostics(message) {
  try {
    const moduleFlags = message?.flags?.[MODULE_ID] ?? {};
    const flagKeys = Object.keys(moduleFlags);
    warn("Fate cache diagnostics", {
      messageId: message?.id,
      speakerActorId: message?.speaker?.actor,
      moduleFlagKeys: flagKeys,
      fateCacheId: moduleFlags.fateCacheId,
      diceTypesVersion: moduleFlags.diceTypesVersion,
      diceTypesLength: Array.isArray(moduleFlags.diceTypes) ? moduleFlags.diceTypes.length : null,
    });
  } catch (_err) {
    // ignore
  }
}
