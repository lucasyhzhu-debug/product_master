/**
 * Consignment Settlement Queries
 *
 * Read queries for consignment outlet management with running totals
 * and settlement history per outlet.
 */

import { query, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";

/**
 * Get all consignment outlets with computed running totals.
 * Totals include: totalRevenue, totalRevShare, totalFrollie,
 * outstanding (pending payments), paidTotal, and settlementCount.
 */
export const getOutletsWithTotals = query({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Fetch outlets based on active status
    let outlets;
    if (args.includeArchived) {
      outlets = await ctx.db.query("consignmentOutlets").collect();
    } else {
      outlets = await ctx.db
        .query("consignmentOutlets")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }

    // Compute per-outlet totals
    const results = [];
    for (const outlet of outlets) {
      const settlements = await ctx.db
        .query("consignmentSettlements")
        .withIndex("by_outlet", (q) => q.eq("outletId", outlet._id))
        .collect();

      let totalRevenue = 0;
      let totalRevShare = 0;
      let totalFrollie = 0;
      let outstanding = 0;
      let paidTotal = 0;

      for (const s of settlements) {
        totalRevenue += s.totalRevenue;
        totalRevShare += s.revShareAmount;
        totalFrollie += s.frolliePayment;
        if (s.status === "pending") {
          outstanding += s.frolliePayment;
        } else if (s.status === "paid") {
          paidTotal += s.frolliePayment;
        }
      }

      results.push({
        ...outlet,
        totals: {
          totalRevenue,
          totalRevShare,
          totalFrollie,
          outstanding,
          paidTotal,
          settlementCount: settlements.length,
        },
      });
    }

    return results;
  },
});

/**
 * Get all settlements for a specific outlet, newest first.
 */
export const getSettlementsByOutlet = query({
  args: {
    outletId: v.id("consignmentOutlets"),
  },
  handler: async (ctx, args) => {
    const settlements = await ctx.db
      .query("consignmentSettlements")
      .withIndex("by_outlet", (q) => q.eq("outletId", args.outletId))
      .collect();

    // Sort by periodStart descending (newest first)
    settlements.sort((a, b) => b.periodStart - a.periodStart);

    return settlements;
  },
});

/**
 * Get global consignment summary across all active outlets.
 * Returns total revenue, outstanding, paid, and active outlet count.
 */
export const getGlobalSummary = query({
  args: {},
  handler: async (ctx) => {
    // Count active outlets
    const activeOutlets = await ctx.db
      .query("consignmentOutlets")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Sum across ALL settlements (not just active outlets)
    const allSettlements = await ctx.db
      .query("consignmentSettlements")
      .collect();

    let totalRevenue = 0;
    let totalOutstanding = 0;
    let totalPaid = 0;

    for (const s of allSettlements) {
      totalRevenue += s.totalRevenue;
      if (s.status === "pending") {
        totalOutstanding += s.frolliePayment;
      } else if (s.status === "paid") {
        totalPaid += s.frolliePayment;
      }
    }

    return {
      totalRevenue,
      totalOutstanding,
      totalPaid,
      activeOutletCount: activeOutlets.length,
    };
  },
});

/**
 * Phase 74.5.2 Plan 07 — Per-settlement item breakdown query.
 *
 * Returns `externalRevenueItems` joined to the settlement's `linkedRevenueId`,
 * enriched with the linked menuProduct doc for display. Admin + manager gated
 * (financial detail exposure — matches the gate on other consignment reads
 * that surface money-adjacent data via mutations).
 *
 * Pre-74.5.1 settlements (or any settlement missing `linkedRevenueId`) return
 * `[]` — no items were emitted before the `saveRevenueItems` hook landed.
 * The UI handles this as empty-state ("no per-product breakdown available"),
 * NOT an error.
 *
 * Items are fetched via the `by_revenue` index on `externalRevenueItems`
 * (already exists), and each item is enriched with `menuProduct: Doc | null`
 * via `Promise.all` for parallel fetches.
 */
/**
 * Inner handler for {@link getSettlementItems}. Exported (with `_` prefix)
 * so tests can invoke the logic directly via `t.run(ctx => ...)`, bypassing
 * convex-test's module-resolution path that currently fails for the
 * `consignment/*` subtree (same class of bug as Plan 01 / D74.5.2-L1 for
 * `productInventory/*`).
 *
 * Does NOT perform the admin/manager role check — the public wrapper below
 * does that. Tests exercise the gate via the wrapper's handler path (see
 * `_getSettlementItemsWithAuthForTest`).
 */
export async function _getSettlementItemsForTest(
  ctx: QueryCtx,
  settlementId: Id<"consignmentSettlements">,
): Promise<
  Array<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
> {
  const settlement = await ctx.db.get(settlementId);
  if (!settlement || !settlement.linkedRevenueId) return [];

  const linkedRevenueId = settlement.linkedRevenueId;
  const items = await ctx.db
    .query("externalRevenueItems")
    .withIndex("by_revenue", (q) => q.eq("revenueId", linkedRevenueId))
    .collect();

  // Enrich each item with its linked menuProduct (or null) for display.
  const enriched = await Promise.all(
    items.map(async (item) => ({
      ...item,
      menuProduct: item.linkedMenuProductId
        ? await ctx.db.get(item.linkedMenuProductId)
        : null,
    })),
  );
  return enriched;
}

/**
 * Variant exercising the role-gate path for tests. Mirrors the public
 * wrapper's `requireRole` → `_getSettlementItemsForTest` sequence.
 */
export async function _getSettlementItemsWithAuthForTest(
  ctx: QueryCtx,
  settlementId: Id<"consignmentSettlements">,
  token: string,
): Promise<
  Array<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
> {
  await requireRole(ctx, token, ["admin", "manager"]);
  return _getSettlementItemsForTest(ctx, settlementId);
}

export const getSettlementItems = query({
  args: {
    settlementId: v.id("consignmentSettlements"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);
    return _getSettlementItemsForTest(ctx, args.settlementId);
  },
});
