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
import { salesSlotKey } from "../deliveryReceipts";

/**
 * Run one idempotent best-effort channel sync for the daily summary.
 * - Success → "ok".
 * - Non-transient failure → swallow + warn, return "fail" (channel renders ✗;
 *   the summary still ships with the other channels).
 * - TRANSIENT failure → rethrow so sendSalesSummaryResilient retries the whole
 *   run rather than stranding the channel's data for the day (see cronRetry.ts).
 */
async function runBestEffortSync(
  label: string,
  run: () => Promise<unknown>,
): Promise<"ok" | "fail"> {
  try {
    await run();
    return "ok";
  } catch (e) {
    if (isTransientError(e)) throw e;
    console.warn(`sales-summary: ${label} sync failed`, e);
    return "fail";
  }
}

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

    const refresh: RefreshStatus = { gofood: "skip", k3mart: "skip", direct: "skip", pos: "skip" };

    if (args.cadence === "daily") {
      // Best-effort: a NON-transient sync failure must not block the others or the
      // summary — it surfaces as a ✗ and the report still ships. A TRANSIENT Convex
      // error (capacity / InternalServerError) is the exception: swallowing it into a
      // ✗ permanently strands that channel's data for the day (bit GoFood 2026-05-31),
      // so we rethrow it and let sendSalesSummaryResilient retry the WHOLE run. These
      // syncs are idempotent incremental syncs, so re-running them is safe (and the
      // send loop hasn't run yet, so nothing double-posts) — see cronRetry.ts.
      //
      // NB: syncK3MartSales / syncInternalOrders are public `action`s (resolve
      // creds internally, no session token) — call them via `api.*`, matching
      // the existing hourly "sync internal orders revenue" cron. autoSyncGoBizRevenue
      // is an internalAction (`internal.*`). Do NOT normalize all three to one namespace.
      refresh.gofood = await runBestEffortSync("GoFood", () =>
        ctx.runAction(internal.integrations.gobiz.adapter.autoSyncGoBizRevenue, {}),
      );
      refresh.k3mart = await runBestEffortSync("K3Mart", () =>
        ctx.runAction(api.integrations.k3mart.adapter.syncK3MartSales, { triggeredBy: "cron" }),
      );
      refresh.direct = await runBestEffortSync("Internal", () =>
        ctx.runAction(api.integrations.internal.adapter.syncInternalOrders, { triggeredBy: "cron" }),
      );
      // POS (Block M) — internalAction; no-ops when creds/base URL are unset. This
      // is the ONLY scheduled POS pull (the standalone hourly cron was retired): the
      // daily report + the /sales command are the moments POS data needs to be fresh.
      refresh.pos = await runBestEffortSync("POS", () =>
        ctx.runAction(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "cron" }),
      );
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

    // Record a delivery receipt so watchdogSalesSummary knows this slot shipped.
    // Best-effort: a recording failure must NOT cause sendSalesSummaryResilient
    // to retry (the summary already went out — a retry would double-post). Worst
    // case the watchdog resends once. runSalesOnDemand also lands here and
    // records the daily slot, which harmlessly satisfies the daily watchdog.
    try {
      await ctx.runMutation(internal.telegram.deliveryReceipts.recordDelivery, {
        slotKey: salesSlotKey(args.cadence, Date.now()),
      });
    } catch (e) {
      console.warn("sendSalesSummary: failed to record delivery receipt", e);
    }

    return { chunkCount: chunks.length, channelCount: data.channels.length };
  },
});

// ─── runSalesOnDemand ────────────────────────────────────────────────────────

/**
 * On-demand entrypoint for the /sales command. Sends an immediate ack to the
 * requesting chat (so the operator sees it working), then reuses the EXACT daily
 * process (3 best-effort syncs + summary → sales-updates group). On failure after
 * the ack, sends a breadcrumb so the operator is never left hanging, then rethrows
 * so the failure surfaces in the Convex dashboard.
 *
 * Direct (non-resilient) call: on-demand favors fast failure + retry-by-re-typing
 * over multi-minute silent retry loops. Crons keep using sendSalesSummaryResilient.
 */
export const runSalesOnDemand = internalAction({
  args: { chatId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Telegram env var missing (TELEGRAM_BOT_TOKEN)");

    await sendTelegramHtml(
      token,
      args.chatId,
      "✅ Acknowledged — updating sales channels, then coming back with your report…",
    );

    try {
      await ctx.runAction(
        internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
        { cadence: "daily" },
      );
    } catch (err) {
      try {
        await sendTelegramHtml(
          token,
          args.chatId,
          "⚠️ Sales update failed — check Convex logs.",
        );
      } catch {
        /* best-effort breadcrumb — ignore secondary failure */
      }
      throw err;
    }
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

// ─── watchdogSalesSummary ────────────────────────────────────────────────────

/**
 * Verification cron. Fires ~15min after each sales-summary slot. If no delivery
 * receipt exists for the slot, re-fires the resilient sender. Covers the gap
 * where the primary run AND its scheduled retry both die to a platform-level
 * transient (incident 2026-06-02). See watchdogPackList for the same rationale,
 * including why a failed receipt check rethrows rather than blind-resends.
 */
export const watchdogSalesSummary = internalAction({
  args: {
    cadence: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const slotKey = salesSlotKey(args.cadence, Date.now());
    const delivered = await ctx.runQuery(
      internal.telegram.deliveryReceipts.wasDelivered,
      { slotKey },
    );
    if (delivered) return;
    console.warn(
      `[watchdogSalesSummary] no receipt for ${slotKey}; re-firing resilient sender`,
    );
    await ctx.runAction(
      internal.telegram.salesSummary.sendSalesSummary.sendSalesSummaryResilient,
      { cadence: args.cadence },
    );
  },
});
