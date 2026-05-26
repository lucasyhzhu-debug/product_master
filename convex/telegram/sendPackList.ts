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
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      throw new Error("Telegram env vars missing (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
    }

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
    for (const chunk of chunks) {
      await sendTelegramHtml(token, chatId, chunk);
    }

    return { chunkCount: chunks.length, orderCount: data.totalCount };
  },
});
