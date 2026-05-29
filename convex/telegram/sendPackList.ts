import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { sendTelegramHtml } from "../lib/telegramHtml";
import { formatPackList } from "./packListFormat";

export const sendPackList = internalAction({
  args: {
    reason: v.union(
      v.literal("morning"),
      v.literal("midday"),
      v.literal("command"),
    ),
  },
  // Explicit return type breaks the circular type inference that arises from
  // referencing `internal.*` inside the same module that contributes to it
  // (Convex's generated api includes this function; without an annotation, tsc
  // would need to resolve the api type before resolving this handler).
  handler: async (ctx, args): Promise<{ chunkCount: number; orderCount: number }> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("Telegram env var missing (TELEGRAM_BOT_TOKEN)");
    }
    // Resolve chatId by role — table first, env fallback (if TELEGRAM_FALLBACK_ROLE=pack-list).
    const chatId = await ctx.runQuery(
      internal.telegram.chatRegistry.getChatIdByRole,
      { role: "pack-list" },
    );

    const data = await ctx.runQuery(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      {},
    );
    const chunks = formatPackList({
      reason: args.reason,
      cards: data.orders,
      counts: {
        total: data.totalCount,
        delivery: data.deliveryCount,
        pickup: data.pickupCount,
      },
      generatedAt: Date.now(),
    });

    // Sequential send to preserve order — chunks reference each other ("continued (2)" etc).
    // I2 (triple-review): if chunk N+1 fails after chunk N already sent, staff
    // see a truncated message and `/pack` retry is dedupe-blocked. Send a
    // best-effort breadcrumb so staff know to re-run /pack later (after dedupe
    // row eventually expires, or to check the dashboard for the failed cron).
    let sentCount = 0;
    try {
      for (const chunk of chunks) {
        await sendTelegramHtml(token, chatId, chunk);
        sentCount++;
      }
    } catch (err) {
      if (sentCount > 0) {
        try {
          await sendTelegramHtml(
            token,
            chatId,
            `<i>⚠️ Pack list send failed after ${sentCount}/${chunks.length} chunks. Check Convex logs.</i>`,
          );
        } catch {
          // best-effort — primary throw is what matters
        }
      }
      throw err;
    }

    return { chunkCount: chunks.length, orderCount: data.totalCount };
  },
});

// ─── sendPackListResilient ───────────────────────────────────────────────────

/**
 * Convex system-overload errors ("no available workers ...") are transient and
 * occur BEFORE the send loop (at the getChatIdByRole runQuery, sendPackList.ts:25).
 * Crons get one shot with no auto-retry, so on 2026-05-29 the midday pack list
 * was silently dropped when a worker spike coincided with the 13:00 WIB firing.
 *
 * This wrapper re-runs the (idempotent-up-to-send) sendPackList and, on a
 * transient error only, self-reschedules a backed-off retry. It does NOT retry
 * non-transient errors (e.g. missing token, or a mid-chunk send failure that
 * already posted earlier chunks) — those would risk double-sending or are not
 * recoverable by waiting.
 *
 * Crons point HERE; the raw sendPackList stays the on-demand /pack entrypoint
 * (webhook.ts), where the user can simply re-issue /pack.
 */
const TRANSIENT_ERROR_SUBSTRINGS = ["no available workers"];

function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return TRANSIENT_ERROR_SUBSTRINGS.some((s) => msg.includes(s));
}

export const sendPackListResilient = internalAction({
  args: {
    reason: v.union(v.literal("morning"), v.literal("midday")),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const attempt = args.attempt ?? 0;
    const MAX_ATTEMPTS = 3; // initial + 2 retries
    try {
      await ctx.runAction(internal.telegram.sendPackList.sendPackList, {
        reason: args.reason,
      });
    } catch (err) {
      if (isTransientError(err) && attempt + 1 < MAX_ATTEMPTS) {
        const delayMs = 60_000 * (attempt + 1); // 60s, then 120s
        console.warn(
          `[sendPackListResilient] transient error on attempt ${attempt + 1}/${MAX_ATTEMPTS} (reason=${args.reason}); retrying in ${delayMs}ms`,
        );
        await ctx.scheduler.runAfter(
          delayMs,
          internal.telegram.sendPackList.sendPackListResilient,
          { reason: args.reason, attempt: attempt + 1 },
        );
        return;
      }
      throw err;
    }
  },
});
