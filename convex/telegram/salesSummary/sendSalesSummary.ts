// convex/telegram/salesSummary/sendSalesSummary.ts
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { sendTelegramHtml } from "../../lib/telegramHtml";
import { formatSalesSummary, type RefreshStatus } from "./salesSummaryFormat";
import {
  RESILIENT_MAX_ATTEMPTS,
  resilientRetryDelayMs,
  isTransientError,
} from "../cronRetry";

export const sendSalesSummary = internalAction({
  args: {
    cadence: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
  },
  // Explicit return type breaks circular type inference (same reason as sendPackList).
  handler: async (ctx, args): Promise<{ chunkCount: number; channelCount: number }> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Telegram env var missing (TELEGRAM_BOT_TOKEN)");

    // Resolve the delivery destination first — getChatIdByRole throws when no
    // chat is assigned to "sales-updates" (no env fallback). Failing fast here
    // avoids wasting the 3 best-effort syncs + the O(rows) summary query on a
    // misconfigured cron run (which surfaces as a failed cron in the dashboard).
    const chatId = await ctx.runQuery(
      internal.telegram.chatRegistry.getChatIdByRole,
      { role: "sales-updates" },
    );

    const refresh: RefreshStatus = { gofood: "skip", k3mart: "skip", direct: "skip" };

    if (args.cadence === "daily") {
      // Best-effort: one failed sync must not block the others or the summary.
      // NB: syncK3MartSales / syncInternalOrders are public `action`s (resolve
      // creds internally, no session token) — call them via `api.*`, matching
      // the existing hourly "sync internal orders revenue" cron. autoSyncGoBizRevenue
      // is an internalAction (`internal.*`). Do NOT normalize all three to one namespace.
      try {
        await ctx.runAction(internal.integrations.gobiz.adapter.autoSyncGoBizRevenue, {});
        refresh.gofood = "ok";
      } catch (e) {
        refresh.gofood = "fail";
        console.warn("sales-summary: GoFood sync failed", e);
      }
      try {
        await ctx.runAction(api.integrations.k3mart.adapter.syncK3MartSales, {
          triggeredBy: "cron",
        });
        refresh.k3mart = "ok";
      } catch (e) {
        refresh.k3mart = "fail";
        console.warn("sales-summary: K3Mart sync failed", e);
      }
      try {
        await ctx.runAction(api.integrations.internal.adapter.syncInternalOrders, {
          triggeredBy: "cron",
        });
        refresh.direct = "ok";
      } catch (e) {
        refresh.direct = "fail";
        console.warn("sales-summary: Internal sync failed", e);
      }
    }

    const data = await ctx.runQuery(
      internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: args.cadence },
    );
    const chunks = formatSalesSummary({ data, refresh });

    let sent = 0;
    try {
      for (const chunk of chunks) {
        await sendTelegramHtml(token, chatId, chunk);
        sent++;
      }
    } catch (err) {
      if (sent > 0) {
        try {
          await sendTelegramHtml(
            token,
            chatId,
            `<i>⚠️ Sales summary send failed after ${sent}/${chunks.length} chunks. Check Convex logs.</i>`,
          );
        } catch {
          /* best-effort breadcrumb — ignore secondary failure */
        }
      }
      throw err;
    }

    return { chunkCount: chunks.length, channelCount: data.channels.length };
  },
});

// ─── sendSalesSummaryResilient ───────────────────────────────────────────────

/**
 * Cron-resilient wrapper for sendSalesSummary. See convex/telegram/cronRetry.ts
 * for the shared transient-retry playbook. Crons point HERE.
 *
 * Retry safety: a transient error can only escape before the send loop (at the
 * getChatIdByRole / getSalesSummary runQueries — the daily best-effort syncs are
 * already try/catch'd and are idempotent incremental syncs, so re-running them
 * on retry is harmless). A mid-chunk Telegram failure is non-transient and is
 * never retried.
 */
export const sendSalesSummaryResilient = internalAction({
  args: {
    cadence: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const attempt = args.attempt ?? 0;
    try {
      await ctx.runAction(
        internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
        { cadence: args.cadence },
      );
    } catch (err) {
      if (isTransientError(err) && attempt + 1 < RESILIENT_MAX_ATTEMPTS) {
        const delayMs = resilientRetryDelayMs(attempt);
        console.warn(
          `[sendSalesSummaryResilient] transient error on attempt ${attempt + 1}/${RESILIENT_MAX_ATTEMPTS} (cadence=${args.cadence}); retrying in ${delayMs}ms`,
        );
        await ctx.scheduler.runAfter(
          delayMs,
          internal.telegram.salesSummary.sendSalesSummary.sendSalesSummaryResilient,
          { cadence: args.cadence, attempt: attempt + 1 },
        );
        return;
      }
      throw err;
    }
  },
});
