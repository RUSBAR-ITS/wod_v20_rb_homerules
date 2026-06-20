import { debugNs } from "../logger/ns.js";
import { MODULE_ID } from "../constants/module-id.js";
import { consumePendingRollContext } from "./store.js";

const { debug, info, error } = debugNs("rollctx:chat");

/**
 * Attach our one-shot roll context to the next created ChatMessage.
 *
 * We use preCreateChatMessage so we can mutate the message data before it is persisted.
 *
 * Diagnostics:
 * - Logs both "attach" and "skip" paths with all values we can observe.
 */
export function registerRollContextChatAttachmentHook() {
  Hooks.on("preCreateChatMessage", (doc, data, _options, userId) => {
    try {
      // Only attach for the user who created the message.
      const uid = userId ?? game?.user?.id;
      if (!uid) {
        debug("preCreateChatMessage: skipped (no userId)", { messageId: doc?.id ?? null });
        return;
      }

      const ctx = consumePendingRollContext(uid);

      if (!ctx) {
        debug("preCreateChatMessage: no pending roll context to attach", {
          userId: uid,
          messageId: doc?.id ?? null,
          // Useful to see if this is a roll message at all.
          type: data?.type ?? null,
          speaker: data?.speaker ?? null,
          flavor: data?.flavor ?? null,
        });
        return;
      }

      /**
       * Foundry v13 note:
       * Mutating the `data` argument in preCreateChatMessage is not reliable.
       * Persist changes using `doc.updateSource(...)` (same pattern as our Fate dice tagging).
       */
      const existingFlags = (data?.flags && typeof data.flags === "object") ? data.flags : {};
      const existingModuleFlags =
        (existingFlags[MODULE_ID] && typeof existingFlags[MODULE_ID] === "object")
          ? existingFlags[MODULE_ID]
          : {};

      const patchedFlags = foundry.utils.mergeObject(
        foundry.utils.deepClone(existingFlags),
        {
          [MODULE_ID]: {
            ...existingModuleFlags,
            rollContext: ctx,
            rollContextVersion: 1,
          },
        },
        { inplace: false }
      );

      // Persist into the creating document source.
      doc.updateSource({
        flags: patchedFlags,
      });

      debug("Attached roll context to ChatMessage", {
        userId: uid,
        messageId: doc?.id ?? null,
        flagsPath: `flags.${MODULE_ID}.rollContext`,
        persistedVia: "doc.updateSource",
        // Flatten the most important values so they show up in the console.
        rollTraceId: ctx.rollTraceId ?? null,
        actorId: ctx.actorId ?? null,
        origin: ctx.origin ?? null,
        attribute: ctx.attribute ?? null,
        difficulty: ctx.difficulty ?? null,
        isSpecialized: ctx.isSpecialized ?? null,
        useWillpower: ctx.useWillpower ?? null,
        autoSuccesses: ctx.autoSuccesses ?? null,
        // And keep full object for deep inspection when needed.
        ctx,
      });
    } catch (err) {
      error("preCreateChatMessage hook failed (roll context attach)", err);
      // Do not block message creation.
    }
  });

  // Best-effort log for visibility.
  info("Roll context chat attachment hook registered");
}
