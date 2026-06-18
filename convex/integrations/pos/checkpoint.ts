import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";

export const getCheckpoint = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("posSyncCheckpoint").first();
    return row ? { salesCursor: row.salesCursor, refundsCursor: row.refundsCursor } : null;
  },
});

async function upsert(ctx: MutationCtx, patch: { salesCursor?: string; refundsCursor?: string }) {
  const row = await ctx.db.query("posSyncCheckpoint").first();
  if (row) await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now() });
  else await ctx.db.insert("posSyncCheckpoint", { ...patch, updatedAt: Date.now() });
}

export const persistSalesCursor = internalMutation({
  args: { cursor: v.string() },
  handler: (ctx, { cursor }) => upsert(ctx, { salesCursor: cursor }),
});

export const persistRefundsCursor = internalMutation({
  args: { cursor: v.string() },
  handler: (ctx, { cursor }) => upsert(ctx, { refundsCursor: cursor }),
});
