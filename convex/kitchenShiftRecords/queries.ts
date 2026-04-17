/**
 * Kitchen Shift Records Queries
 *
 * Queries for reading shift record history with enriched product name data.
 *
 * Queries:
 *   getShiftRecordsByDate        — Public: all kitchen roles can view records for a specific date.
 *   getShiftHistory              — Manager/admin only: date-ranged history with optional start/end.
 *   getStaffPerformanceSummary   — Manager/admin only: per-staff aggregation over a date range.
 */

import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { aggregateStaffPerformance } from "../staffAttendance/aggregation";

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
    chefName?: string;
    chefUserId?: string;
    produced: Array<{ menuProductId: string; quantity: number }>;
    waste: Array<{ menuProductId: string; reason: string; quantity: number }>;
    // unit is optional; legacy records have no unit and default to "g" on read
    componentProduced?: Array<{ kitchenComponentCode: string; kitchenComponentName: string; grams: number; unit?: "g" | "pcs" }>;
    componentWaste?: Array<{ kitchenComponentCode: string; kitchenComponentName: string; reason: string; grams: number; unit?: "g" | "pcs" }>;
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
    chefName: record.chefName,
    chefUserId: record.chefUserId,
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
    componentProduced: record.componentProduced ?? [],
    componentWaste: record.componentWaste ?? [],
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
          chefName: record.chefName,
          chefUserId: record.chefUserId ? String(record.chefUserId) : undefined,
          produced: record.produced.map((p) => ({
            menuProductId: String(p.menuProductId),
            quantity: p.quantity,
          })),
          waste: record.waste.map((w) => ({
            menuProductId: String(w.menuProductId),
            reason: w.reason,
            quantity: w.quantity,
          })),
          componentProduced: record.componentProduced,
          componentWaste: record.componentWaste,
          editedAt: record.editedAt,
          editedBy: record.editedBy,
          editNote: record.editNote,
        })
      )
    );
  },
});

/**
 * getDailyComponentSummary — Aggregate component production across all shift records for a date.
 *
 * Returns per-component totals with per-person attribution.
 * No auth required — kitchen staff need to view daily summaries.
 */
export const getDailyComponentSummary = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("kitchenShiftRecords")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Aggregate per component and track the display unit. If two records for
    // the same code carry different units (rare — would only happen if a
    // manager changes the unit config mid-day), the last-seen unit wins.
    const componentMap = new Map<
      string,
      {
        code: string;
        name: string;
        unit: "g" | "pcs";
        totalProducedGrams: number;
        totalWasteGrams: number;
        perPerson: Array<{
          submittedBy: string;
          chefName?: string;
          producedGrams: number;
          wasteGrams: number;
        }>;
      }
    >();

    for (const record of records) {
      const personKey = record.chefName ?? record.submittedBy;

      // Process component produced
      if (record.componentProduced) {
        for (const item of record.componentProduced) {
          if (item.grams <= 0) continue;

          if (!componentMap.has(item.kitchenComponentCode)) {
            componentMap.set(item.kitchenComponentCode, {
              code: item.kitchenComponentCode,
              name: item.kitchenComponentName,
              unit: item.unit ?? "g",
              totalProducedGrams: 0,
              totalWasteGrams: 0,
              perPerson: [],
            });
          }
          const entry = componentMap.get(item.kitchenComponentCode)!;
          // Prefer an explicit stored unit over the default (g) so newer records
          // can upgrade the unit if the first record seen had no unit field.
          if (item.unit) entry.unit = item.unit;
          entry.totalProducedGrams += item.grams;

          // Per-person attribution
          const existing = entry.perPerson.find(
            (p) => (p.chefName ?? p.submittedBy) === personKey
          );
          if (existing) {
            existing.producedGrams += item.grams;
          } else {
            entry.perPerson.push({
              submittedBy: record.submittedBy,
              chefName: record.chefName,
              producedGrams: item.grams,
              wasteGrams: 0,
            });
          }
        }
      }

      // Process component waste
      if (record.componentWaste) {
        for (const item of record.componentWaste) {
          if (item.grams <= 0) continue;

          if (!componentMap.has(item.kitchenComponentCode)) {
            componentMap.set(item.kitchenComponentCode, {
              code: item.kitchenComponentCode,
              name: item.kitchenComponentName,
              unit: item.unit ?? "g",
              totalProducedGrams: 0,
              totalWasteGrams: 0,
              perPerson: [],
            });
          }
          const entry = componentMap.get(item.kitchenComponentCode)!;
          if (item.unit) entry.unit = item.unit;
          entry.totalWasteGrams += item.grams;

          // Per-person waste attribution
          const existing = entry.perPerson.find(
            (p) => (p.chefName ?? p.submittedBy) === personKey
          );
          if (existing) {
            existing.wasteGrams += item.grams;
          } else {
            entry.perPerson.push({
              submittedBy: record.submittedBy,
              chefName: record.chefName,
              producedGrams: 0,
              wasteGrams: item.grams,
            });
          }
        }
      }
    }

    return Array.from(componentMap.values());
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
          chefName: record.chefName,
          chefUserId: record.chefUserId ? String(record.chefUserId) : undefined,
          produced: record.produced.map((p) => ({
            menuProductId: String(p.menuProductId),
            quantity: p.quantity,
          })),
          waste: record.waste.map((w) => ({
            menuProductId: String(w.menuProductId),
            reason: w.reason,
            quantity: w.quantity,
          })),
          componentProduced: record.componentProduced,
          componentWaste: record.componentWaste,
          editedAt: record.editedAt,
          editedBy: record.editedBy,
          editNote: record.editNote,
        })
      )
    );
  },
});

/**
 * getStaffPerformanceSummary — Aggregate production data per staff member over a date range.
 *
 * Manager/admin only. Returns per-staff totals for BOM-resolved balls produced,
 * component grams (produced + waste), product waste, shift count, and days worked.
 * Designed for monthly payment reporting.
 *
 * Ball counting follows Business Rule 10/13: resolves BOM via menuProductComponents +
 * componentTypes (category="production") to count actual Big Ball + Mid Ball, not product units.
 */
export const getStaffPerformanceSummary = query({
  args: {
    token: v.string(),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(),   // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    return await aggregateStaffPerformance(ctx, {
      startDate: args.startDate,
      endDate: args.endDate,
    });
  },
});
