import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { parseCommand } from "./chatRegistry";

interface WebhookResult {
  status: number;
  body: string;
}

export interface WebhookDeps {
  /**
   * R5: collapsed read+write into a single atomic mutation. Returns true if
   * THIS call inserted the row, false if it already existed. Eliminates the
   * read-then-write race window between isDuplicate and recordUpdate.
   */
  recordIfNew: (updateId: number) => Promise<boolean>;
  /** Dispatch /pack — schedule sendPackList. */
  runPack: () => Promise<void>;
  /** Dispatch /register — schedule registerChat. */
  runRegister: (args: {
    chatId: string;
    chatType: "private" | "group" | "supergroup";
    title: string;
    registeredBy: number | undefined;
  }) => Promise<void>;
  /** Dispatch /start — schedule replyStartHelp. */
  runStart: (chatId: string) => Promise<void>;
  /** Dispatch non-command messages — fire-and-forget touchChatLastSeen. */
  touchLastSeen: (chatId: string) => Promise<void>;
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string; title?: string };
    from?: { id?: number };
  };
}

/**
 * Constant-time string compare to avoid timing attacks on the webhook secret.
 * (Pattern from convex/integrations/qris/webhooks.ts:18-24.)
 */
function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    // charCodeAt past the end is NaN; (NaN || 0) === 0 keeps the XOR well-defined.
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

/**
 * Pure handler core — no Convex runtime dependency. Returns the HTTP status
 * and body to send back to Telegram. The real `handleTelegramWebhook` httpAction
 * wires `ctx.db` + `ctx.scheduler` into the `deps` interface.
 */
export async function decideWebhookOutcome(input: {
  providedSecret: string | null;
  expectedSecret: string | undefined;
  body: TelegramUpdate;
  deps: WebhookDeps;
}): Promise<WebhookResult> {
  // Auth — 401 before any state change.
  if (!input.expectedSecret || !input.providedSecret) {
    return { status: 401, body: "unauthorized" };
  }
  if (!constantTimeEqual(input.providedSecret, input.expectedSecret)) {
    return { status: 401, body: "unauthorized" };
  }

  // Validate envelope.
  const updateId = input.body.update_id;
  const msg = input.body.message;
  if (typeof updateId !== "number") return { status: 200, body: "ok" };
  if (!msg) return { status: 200, body: "ok" };

  const chatIdNum = msg.chat?.id;
  if (typeof chatIdNum !== "number") return { status: 200, body: "ok" };
  const chatIdStr = String(chatIdNum);

  const text = msg.text;
  if (typeof text !== "string") {
    // Non-text update (sticker, photo, etc.) — best-effort touch, no dedupe.
    try { await input.deps.touchLastSeen(chatIdStr); } catch { /* best-effort — lastSeen is non-critical */ }
    return { status: 200, body: "ok" };
  }

  const command = parseCommand(text);

  // Non-command text path.
  if (!command) {
    if (text.trim().startsWith("/")) {
      // Unknown slash command — silent 200-ack, no touch, no dedupe.
      return { status: 200, body: "ok" };
    }
    // Regular non-command text → best-effort lastSeen stamp (NOT deduped by update_id).
    try { await input.deps.touchLastSeen(chatIdStr); } catch { /* best-effort — lastSeen is non-critical */ }
    return { status: 200, body: "ok" };
  }

  // Known command path — atomic R5 dedupe, then dispatch.
  const isNew = await input.deps.recordIfNew(updateId);
  if (!isNew) {
    return { status: 200, body: "ok" };
  }
  // C3 (triple-review): never return non-200 once we've already recorded the
  // update_id. If dispatch throws (e.g. scheduler hiccup), returning 500
  // would have Telegram retry — but on retry `recordIfNew` returns false and
  // we skip dispatch entirely, so the failure becomes a permanent 500 loop
  // until Telegram gives up (~24h). Mirror the QRIS pattern: log and ACK 200.
  try {
    if (command === "pack") {
      await input.deps.runPack();
    } else if (command === "register") {
      const rawType = msg.chat?.type;
      const chatType: "private" | "group" | "supergroup" =
        rawType === "private" || rawType === "group" || rawType === "supergroup"
          ? rawType
          : "group";
      await input.deps.runRegister({
        chatId: chatIdStr,
        chatType,
        title: msg.chat?.title ?? "(untitled)",
        registeredBy: msg.from?.id,
      });
    } else {
      // "start"
      await input.deps.runStart(chatIdStr);
    }
  } catch (err) {
    console.warn("[telegram] command dispatch failed after recordIfNew committed", err);
  }
  return { status: 200, body: "ok" };
}

// ─── Convex glue: atomic recordIfNew mutation + httpAction ───────────────────

/**
 * R5: atomic dedupe in one mutation. Reads the index, inserts if absent,
 * returns whether THIS call inserted. Convex serializes mutations on the
 * read set, so two concurrent deliveries with the same update_id can't both
 * return true.
 */
export const recordIfNew = internalMutation({
  args: { updateId: v.number() },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query("telegramUpdates")
      .withIndex("by_update_id", (q) => q.eq("updateId", args.updateId))
      .unique();
    if (existing) return false;
    await ctx.db.insert("telegramUpdates", {
      updateId: args.updateId,
      receivedAt: Date.now(),
    });
    return true;
  },
});

export const handleTelegramWebhook = httpAction(async (ctx, request) => {
  let body: TelegramUpdate;
  try {
    body = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const outcome = await decideWebhookOutcome({
    providedSecret: request.headers.get("X-Telegram-Bot-Api-Secret-Token"),
    expectedSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    body,
    deps: {
      recordIfNew: (updateId) =>
        ctx.runMutation(internal.telegram.webhook.recordIfNew, { updateId }),
      runPack: async () => {
        await ctx.scheduler.runAfter(0, internal.telegram.sendPackList.sendPackList, {
          reason: "command",
        });
      },
      runRegister: async (args) => {
        await ctx.scheduler.runAfter(0, internal.telegram.chatRegistry.registerChat, args);
      },
      runStart: async (chatId) => {
        await ctx.scheduler.runAfter(0, internal.telegram.chatRegistry.replyStartHelp, { chatId });
      },
      touchLastSeen: async (chatId) => {
        // NOT scheduled — direct mutation (no dedupe necessary).
        await ctx.runMutation(internal.telegram.chatRegistry.touchChatLastSeen, { chatId });
      },
    },
  });
  return new Response(outcome.body, { status: outcome.status });
});
