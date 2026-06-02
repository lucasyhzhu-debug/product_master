import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { sendTelegramHtml } from "../lib/telegramHtml";
import { formatPackList, formatUnpaidAlert } from "./packListFormat";
import {
  RESILIENT_MAX_ATTEMPTS,
  resilientRetryDelayMs,
  isTransientError,
} from "./cronRetry";
import { packSlotKey } from "./deliveryReceipts";

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
    // Use the SAME instant the query bucketed against — avoids a Date.now() drift
    // where an order buckets as overdue but renders "0 days late" near WIB midnight.
    const packChunks = formatPackList({
      reason: args.reason,
      overdue: data.overdue,
      dueToday: data.dueToday,
      counts: {
        total: data.totalCount,
        delivery: data.deliveryCount,
        pickup: data.pickupCount,
      },
      generatedAt: data.generatedAt,
    });
    // Unpaid past-due alert is a SEPARATE message (own header) — empty array sends nothing.
    // Fires for every reason (morning/midday/command); no `reason` needed.
    const alertChunks = formatUnpaidAlert({
      unpaidOverdue: data.unpaidOverdue,
      generatedAt: data.generatedAt,
    });
    const chunks = [...packChunks, ...alertChunks];

    // Sequential send to preserve order — chunks reference each other ("continued (2)" etc).
    // I2 (triple-review): if chunk N+1 fails after chunk N already sent, staff
    // see a truncated message and /pack retry is dedupe-blocked. Send a best-effort
    // breadcrumb so staff know to re-run /pack later.
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
            `<i>⚠️ Pack list + alert send failed after ${sentCount}/${chunks.length} chunks. Check Convex logs.</i>`,
          );
        } catch {
          // best-effort — primary throw is what matters
        }
      }
      throw err;
    }

    // Record a delivery receipt so the watchdog cron knows this slot was sent.
    // Only the scheduled morning/midday slots are watchdog'd; the on-demand
    // `/pack` command (reason="command") has a human in the loop and needs no
    // receipt. Best-effort: a recording failure must NOT cause the resilient
    // wrapper to retry (the message already went out — a retry would double-post).
    // Worst case the watchdog resends once; that's the rarer, more tolerable miss.
    if (args.reason !== "command") {
      try {
        await ctx.runMutation(internal.telegram.deliveryReceipts.recordDelivery, {
          slotKey: packSlotKey(args.reason, data.generatedAt),
        });
      } catch (e) {
        console.warn("sendPackList: failed to record delivery receipt", e);
      }
    }

    return { chunkCount: chunks.length, orderCount: data.totalCount };
  },
});

// ─── sendPackListResilient ───────────────────────────────────────────────────

/**
 * Cron-resilient wrapper for sendPackList. See convex/telegram/cronRetry.ts for
 * the shared transient-retry playbook (and the 2026-05-29 incident that drove
 * it). Crons point HERE; raw sendPackList stays the on-demand /pack entrypoint.
 */
export const sendPackListResilient = internalAction({
  args: {
    reason: v.union(v.literal("morning"), v.literal("midday")),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const attempt = args.attempt ?? 0;
    try {
      await ctx.runAction(internal.telegram.sendPackList.sendPackList, {
        reason: args.reason,
      });
    } catch (err) {
      if (isTransientError(err) && attempt + 1 < RESILIENT_MAX_ATTEMPTS) {
        const delayMs = resilientRetryDelayMs(attempt);
        console.warn(
          `[sendPackListResilient] transient error on attempt ${attempt + 1}/${RESILIENT_MAX_ATTEMPTS} (reason=${args.reason}); retrying in ${delayMs}ms`,
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

// ─── watchdogPackList ────────────────────────────────────────────────────────

/**
 * Verification cron. Fires ~15min after each pack-list slot. If no delivery
 * receipt exists for today's slot, re-fires the resilient sender. Covers the
 * gap where the primary run AND its scheduled retry both die to a platform-level
 * transient (incident 2026-06-02) — a fresh launch at a later time isn't coupled
 * to the dead retry chain.
 *
 * If the receipt check itself throws (deep platform outage), we rethrow rather
 * than blind-resend — a double-post erodes trust in the bot, and manual `/pack`
 * remains the human fallback. The throw surfaces in the Convex dashboard.
 */
export const watchdogPackList = internalAction({
  args: { reason: v.union(v.literal("morning"), v.literal("midday")) },
  handler: async (ctx, args): Promise<void> => {
    const slotKey = packSlotKey(args.reason, Date.now());
    const delivered = await ctx.runQuery(
      internal.telegram.deliveryReceipts.wasDelivered,
      { slotKey },
    );
    if (delivered) return;
    console.warn(
      `[watchdogPackList] no receipt for ${slotKey}; re-firing resilient sender`,
    );
    await ctx.runAction(internal.telegram.sendPackList.sendPackListResilient, {
      reason: args.reason,
    });
  },
});
