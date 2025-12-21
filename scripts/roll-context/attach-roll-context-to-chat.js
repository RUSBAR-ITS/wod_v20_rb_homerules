import { debugNs } from "../logger/ns.js";
import { MODULE_ID } from "../constants/module-id.js";
import { consumePendingRollContext } from "./store.js";

const { debug, info, error } = debugNs("rollctx:chat");

/**
 * Attach our one-shot roll context to the next created ChatMessage.
 *
 * We use preCreateChatMessage so we can mutate the message data before it is persisted.
 */
export function registerRollContextChatAttachmentHook() {
  Hooks.on("preCreateChatMessage", (doc, data, _options, userId) => {
    try {
      // Only attach for the user who created the message.
      const uid = userId ?? game?.user?.id;
      if (!uid) return;

      // We only care about system roll cards. Avoid touching unrelated chat messages.
      const content = String(data?.content ?? "");
      if (!content.includes('class="wod20-roll"') && !content.includes("class='wod20-roll")) return;

      const ctx = consumePendingRollContext(uid);
      if (!ctx) return;

      // Attach under our module namespace.
      data.flags ??= {};
      data.flags[MODULE_ID] ??= {};
      data.flags[MODULE_ID].rollContext = ctx;

      debug("Attached roll context to ChatMessage", {
        userId: uid,
        messageId: doc?.id,
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
