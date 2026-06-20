import { debugNs } from "../../logger/ns.js";

const { debug, info, warn, error } = debugNs("fate:dsn:colorset");

/**
 * Dice So Nice integration:
 * Register a custom colorset for Fate dice (emerald + gold).
 *
 * This only registers a named colorset. Assigning that colorset to specific rolls
 * is done in `tag-fate-dice-types.js` by setting roll options for Fate dice.
 */
export function registerFateDiceSoNiceColorsetHook() {
  Hooks.once("diceSoNiceReady", (dice3d) => {
    try {
      if (!dice3d) {
        warn("diceSoNiceReady fired without dice3d instance");
        return;
      }

      if (typeof dice3d.addColorset !== "function") {
        warn("Dice So Nice detected, but dice3d.addColorset is not available. Skipping colorset registration.");
        return;
      }

      const COLORSET_NAME = "rb-fate-emerald";

      // If some properties are not supported by a specific DSN version,
      // they will be ignored gracefully.
      dice3d.addColorset(
        {
          name: COLORSET_NAME,
          description: "RUSBAR Fate dice (Emerald/Gold)",
          category: "RUSBAR",
          foreground: "#D4AF37", // gold numbers
          background: "#0E7A5C", // emerald body
          outline: "#000000", // black digit outline (optional)
          edge: "#000000", // black edges (optional)
        },
        false
      );

      info("Registered Dice So Nice colorset for Fate dice", { colorset: COLORSET_NAME });
    } catch (err) {
      error("Failed to register Dice So Nice colorset for Fate dice", err);
    }
  });

  debug("Registered diceSoNiceReady hook for Fate colorset");
}
