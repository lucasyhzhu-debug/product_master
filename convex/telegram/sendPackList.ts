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
