/**
 * Safely stringify data for file logs.
 *
 * Foundry log files often collapse nested objects to "Object".
 * By converting important payloads to strings explicitly, we ensure
 * the diagnostics remain readable and actionable.
 */
export function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return "<unserializable>";
  }
}
