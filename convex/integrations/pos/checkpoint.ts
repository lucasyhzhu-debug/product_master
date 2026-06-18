import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";
import { requireRole } from "../../lib/auth";

export const getCheckpoint = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("posSyncCheckpoint").first();
    return row ? { salesCursor: row.salesCursor, refundsCursor: row.refundsCursor } : null;
  },
});

// Action-auth seam: requireRole needs QueryCtx/MutationCtx, and queries can't
// live in the "use node" sync.ts. triggerPosSync calls this via ctx.runQuery.
export const assertAdmin = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, ["admin"]);
    return null;
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
