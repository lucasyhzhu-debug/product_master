import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { externalSource } from "../schema";

/**
 * One-off cleanup: purge specific POS transactions (and their line items) from
 * externalRevenue, matched by exact externalTransactionId so it can never touch
 * real sales by accident.
 *
 * Created 2026-06-19 to remove the FrolliePOS smoke-test rows that the go-live
 * drain ingested per the producer handover §4.2:
 *   - "R-2026-0001" / "R-2026-0002"  — Rp 1,000 "Testproduct" sales (+ children)
 *   - "R-2026-0003|R|<createdAt>"    — the reason:"Test" refund (parent-only)
 *
 * Run (prod): npx convex run --prod migrations/posPurgeTestRows:purge \
 *   '{"txnIds":["R-2026-0001","R-2026-0002","R-2026-0003|R|1781758308932"]}'
 */
export const purge = internalMutation({
  args: {
    txnIds: v.array(v.string()),
    source: v.optional(externalSource),
  },
  handler: async (ctx, { txnIds, source }) => {
    const src = source ?? "pos";
    const results: Array<{ txnId: string; found: boolean; itemsDeleted: number }> = [];

    for (const txnId of txnIds) {
      const parent = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_txn", (q) =>
          q.eq("source", src).eq("externalTransactionId", txnId),
        )
        .first();

      if (!parent) {
        results.push({ txnId, found: false, itemsDeleted: 0 });
        continue;
      }

      const items = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", parent._id))
        .collect();
      for (const item of items) await ctx.db.delete(item._id);
      await ctx.db.delete(parent._id);

      results.push({ txnId, found: true, itemsDeleted: items.length });
    }

    return results;
  },
});
