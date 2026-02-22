/**
 * Kitchen Shift Records Queries
 *
 * Queries for reading shift record history with enriched product name data.
 *
 * Queries:
 *   getShiftRecordsByDate — Public: all kitchen roles can view records for a specific date.
 *   getShiftHistory       — Manager/admin only: date-ranged history with optional start/end.
 */

import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Enrich shift record produced/waste entries with product names.
 * Uses Promise.all for parallel fetches.
 */
async function enrichRecord(
  ctx: QueryCtx,
  record: {
    _id: string;
    date: string;
    submittedAt: number;
    submittedBy: string;
    produced: Array<{ menuProductId: string; quantity: number }>;
    waste: Array<{ menuProductId: string; reason: string; quantity: number }>;
    editedAt?: number;
    editedBy?: string;
    editNote?: string;
  }
) {
  // Collect unique product IDs
  const productIds = new Set([
    ...record.produced.map((p) => p.menuProductId),
    ...record.waste.map((w) => w.menuProductId),
  ]);

  // Fetch all product names in parallel
  const productNameMap = new Map<string, string>();
  await Promise.all(
    Array.from(productIds).map(async (productIdStr) => {
      const menuProduct = await ctx.db.get(
        productIdStr as Id<"menuProducts">
      );
      productNameMap.set(productIdStr, menuProduct?.name ?? productIdStr);
    })
  );

  return {
    _id: record._id,
    date: record.date,
    submittedAt: record.submittedAt,
    submittedBy: record.submittedBy,
    produced: record.produced.map((p) => ({
      menuProductId: p.menuProductId,
      menuProductName: productNameMap.get(p.menuProductId) ?? p.menuProductId,
      quantity: p.quantity,
    })),
    waste: record.waste.map((w) => ({
      menuProductId: w.menuProductId,
      menuProductName: productNameMap.get(w.menuProductId) ?? w.menuProductId,
      reason: w.reason,
      quantity: w.quantity,
    })),
    editedAt: record.editedAt,
    editedBy: record.editedBy,
    editNote: record.editNote,
  };
}

/**
 * getShiftRecordsByDate — Retrieve all shift records for a specific date.
 *
 * Public query — all kitchen roles can view today's records.
 * Returns enriched records with product names, ordered by submittedAt ascending.
 */
export const getShiftRecordsByDate = query({
  args: {
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("kitchenShiftRecords")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Sort by submittedAt ascending
    records.sort((a, b) => a.submittedAt - b.submittedAt);

    // Enrich each record with product names
    return await Promise.all(
      records.map((record) =>
        enrichRecord(ctx, {
          _id: String(record._id),
          date: record.date,
          submittedAt: record.submittedAt,
          submittedBy: record.submittedBy,
          produced: record.produced.map((p) => ({
            menuProductId: String(p.menuProductId),
            quantity: p.quantity,
          })),
          waste: record.waste.map((w) => ({
            menuProductId: String(w.menuProductId),
            reason: w.reason,
            quantity: w.quantity,
          })),
          editedAt: record.editedAt,
          editedBy: record.editedBy,
          editNote: record.editNote,
        })
      )
    );
  },
});

/**
 * getShiftHistory — Retrieve shift records for a date range.
 *
 * Manager/admin only.
 * Default range: last 7 days if no dates provided (WIB +7 offset).
 * Returns enriched records ordered by date descending, then submittedAt descending.
 */
export const getShiftHistory = query({
  args: {
    token: v.string(),
    startDate: v.optional(v.string()), // YYYY-MM-DD
    endDate: v.optional(v.string()),   // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // Compute default date range: last 7 days in WIB (UTC+7)
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowWib = new Date(Date.now() + WIB_OFFSET_MS);

    function toWibDateString(date: Date): string {
      return date.toISOString().slice(0, 10);
    }

    const effectiveEndDate =
      args.endDate ?? toWibDateString(nowWib);

    const sevenDaysAgoWib = new Date(nowWib.getTime() - 6 * 24 * 60 * 60 * 1000);
    const effectiveStartDate =
      args.startDate ?? toWibDateString(sevenDaysAgoWib);

    // Query with date range
    const records = await ctx.db
      .query("kitchenShiftRecords")
      .withIndex("by_date", (q) =>
        q.gte("date", effectiveStartDate).lte("date", effectiveEndDate)
      )
      .collect();

    // Sort: date descending, then submittedAt descending
    records.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.submittedAt - a.submittedAt;
    });

    // Enrich each record with product names
    return await Promise.all(
      records.map((record) =>
        enrichRecord(ctx, {
          _id: String(record._id),
          date: record.date,
          submittedAt: record.submittedAt,
          submittedBy: record.submittedBy,
          produced: record.produced.map((p) => ({
            menuProductId: String(p.menuProductId),
            quantity: p.quantity,
          })),
          waste: record.waste.map((w) => ({
            menuProductId: String(w.menuProductId),
            reason: w.reason,
            quantity: w.quantity,
          })),
          editedAt: record.editedAt,
          editedBy: record.editedBy,
          editNote: record.editNote,
        })
      )
    );
  },
});
