// convex/telegram/salesSummary/sendSalesSummary.ts
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { sendTelegramHtml } from "../../lib/telegramHtml";
import { formatSalesSummary, type RefreshStatus } from "./salesSummaryFormat";

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

    const refresh: RefreshStatus = { gofood: "skip", k3mart: "skip", direct: "skip" };

    if (args.cadence === "daily") {
      // Best-effort: one failed sync must not block the others or the summary.
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
    const chatId = await ctx.runQuery(
      internal.telegram.chatRegistry.getChatIdByRole,
      { role: "sales-updates" },
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
