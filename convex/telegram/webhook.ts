import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

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
  runAction: () => Promise<void>;
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number };
  };
}

/**
 * Constant-time string compare to avoid timing attacks on the webhook secret.
 * (Pattern from convex/integrations/qris/webhooks.ts:18-24.)
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
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
  const text = input.body.message?.text;
  if (typeof updateId !== "number") return { status: 200, body: "ok" };
  if (typeof text !== "string") return { status: 200, body: "ok" };

  // Match /pack or /pack@<botname> EXACTLY. Telegram sends the @bot suffix in groups.
  // Strict mode (full-string match): "/pack now please" does NOT match — trailing
  // args are likely typos or accidental sends, and /pack takes no parameters in v1.
  // If lenient args support is desired in a future version, change to a head-only match.
  const trimmed = text.trim();
  const isPackCommand = /^\/pack(@[A-Za-z0-9_]+)?$/.test(trimmed);
  if (!isPackCommand) return { status: 200, body: "ok" };

  // Atomic idempotency check + record (R5). recordIfNew returns false if the
  // update_id was already stored — in which case we ACK 200 without re-firing.
  const isNew = await input.deps.recordIfNew(updateId);
  if (!isNew) {
    return { status: 200, body: "ok" };
  }
  // C3 (triple-review): never return non-200 once we've already recorded the
  // update_id. If `runAction` throws (e.g. scheduler hiccup), returning 500
  // would have Telegram retry — but on retry `recordIfNew` returns false and
  // we skip `runAction` entirely, so the failure becomes a permanent 500 loop
  // until Telegram gives up (~24h). Mirror the QRIS pattern: log and ACK 200.
  try {
    await input.deps.runAction();
  } catch (err) {
    console.warn("[telegram] runAction failed after recordIfNew committed", err);
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
      runAction: async () => {
        await ctx.scheduler.runAfter(0, internal.telegram.sendPackList.sendPackList, {
          reason: "command",
        });
      },
    },
  });
  return new Response(outcome.body, { status: outcome.status });
});
