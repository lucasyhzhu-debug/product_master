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
    // Phase 21-08: Actual cook fields
    chefName?: string;
    chefUserId?: string;
    produced: Array<{ menuProductId: string; quantity: number }>;
    waste: Array<{ menuProductId: string; reason: string; quantity: number }>;
    // Phase 69: Component production data (unit optional; legacy records have no unit, default to "g" on read)
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
    // Phase 21-08: Actual cook fields (pass through, may be undefined)
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
    // Phase 69: Component production data (pass through)
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
          // Phase 69: Pass through component production data
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
 * Returns per-component totals with per-person attribution (Phase 69).
 * No auth required — kitchen staff need to view daily summaries.
 */
export const getDailyComponentSummary = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("kitchenShiftRecords")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Aggregate per component
    const componentMap = new Map<
      string,
      {
        code: string;
        name: string;
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
              totalProducedGrams: 0,
              totalWasteGrams: 0,
              perPerson: [],
            });
          }
          const entry = componentMap.get(item.kitchenComponentCode)!;
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
              totalProducedGrams: 0,
              totalWasteGrams: 0,
              perPerson: [],
            });
          }
          const entry = componentMap.get(item.kitchenComponentCode)!;
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
          // Phase 69: Pass through component production data
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

    const records = await ctx.db
      .query("kitchenShiftRecords")
      .withIndex("by_date", (q) =>
        q.gte("date", args.startDate).lte("date", args.endDate)
      )
      .collect();

    // Collect all unique menu product IDs for name + BOM enrichment
    const allProductIds = new Set<string>();
    for (const record of records) {
      for (const p of record.produced) allProductIds.add(String(p.menuProductId));
      for (const w of record.waste) allProductIds.add(String(w.menuProductId));
    }

    // Pre-fetch componentTypes once (small, stable table) to avoid N+1 reads
    const allComponentTypes = await ctx.db.query("componentTypes").collect();
    const componentTypeMap = new Map(
      allComponentTypes.map((ct) => [ct._id.toString(), ct])
    );

    // Fetch product names and BOM ball counts in parallel
    const productNameMap = new Map<string, string>();
    const productBallCountMap = new Map<string, number>();
    await Promise.all(
      Array.from(allProductIds).map(async (id) => {
        // Fetch product name and BOM components concurrently
        const [product, components] = await Promise.all([
          ctx.db.get(id as Id<"menuProducts">),
          ctx.db
            .query("menuProductComponents")
            .withIndex("by_menu_product", (q) => q.eq("menuProductId", id as Id<"menuProducts">))
            .collect(),
        ]);

        productNameMap.set(id, product?.name ?? id);

        // Resolve BOM: count production components (balls) using pre-fetched lookup
        let ballCount = 0;
        for (const comp of components) {
          const compType = componentTypeMap.get(comp.componentTypeId.toString());
          if (compType?.category === "production") {
            ballCount += comp.quantity;
          }
        }
        // Fall back to 1 if no BOM (legacy product without components)
        productBallCountMap.set(id, ballCount > 0 ? ballCount : 1);
      })
    );

    // Aggregate per staff member
    const staffMap = new Map<
      string,
      {
        staffKey: string;
        chefName: string;
        chefUserId: string | null;
        totalBallsProduced: number;
        productBreakdown: Map<string, { name: string; quantity: number; ballCount: number }>;
        totalComponentGrams: number;
        componentBreakdown: Map<string, { name: string; grams: number }>;
        totalComponentWasteGrams: number;
        componentWasteBreakdown: Map<string, { name: string; grams: number }>;
        totalWaste: number;
        wasteByReason: Map<string, number>;
        wasteProductBreakdown: Map<string, { name: string; quantity: number }>;
        shiftCount: number;
        daysWorked: Set<string>;
      }
    >();

    for (const record of records) {
      // Use chefName/chefUserId if available, fall back to submittedBy
      const name = record.chefName ?? record.submittedBy;
      const userId = record.chefUserId ? String(record.chefUserId) : null;
      const staffKey = userId ?? name;

      if (!staffMap.has(staffKey)) {
        staffMap.set(staffKey, {
          staffKey,
          chefName: name,
          chefUserId: userId,
          totalBallsProduced: 0,
          productBreakdown: new Map(),
          totalComponentGrams: 0,
          componentBreakdown: new Map(),
          totalComponentWasteGrams: 0,
          componentWasteBreakdown: new Map(),
          totalWaste: 0,
          wasteByReason: new Map(),
          wasteProductBreakdown: new Map(),
          shiftCount: 0,
          daysWorked: new Set(),
        });
      }

      const staff = staffMap.get(staffKey)!;
      staff.shiftCount++;
      staff.daysWorked.add(record.date);

      // Aggregate produced — resolve BOM ball count per product
      for (const p of record.produced) {
        const pid = String(p.menuProductId);
        const ballsPerUnit = productBallCountMap.get(pid) ?? 1;
        const totalBalls = p.quantity * ballsPerUnit;
        staff.totalBallsProduced += totalBalls;

        const existing = staff.productBreakdown.get(pid);
        if (existing) {
          existing.quantity += p.quantity;
          existing.ballCount += totalBalls;
        } else {
          staff.productBreakdown.set(pid, {
            name: productNameMap.get(pid) ?? pid,
            quantity: p.quantity,
            ballCount: totalBalls,
          });
        }
      }

      // Aggregate product-level waste
      for (const w of record.waste) {
        staff.totalWaste += w.quantity;
        const reason = w.reason;
        staff.wasteByReason.set(reason, (staff.wasteByReason.get(reason) ?? 0) + w.quantity);
        const wid = String(w.menuProductId);
        const existingWaste = staff.wasteProductBreakdown.get(wid);
        if (existingWaste) {
          existingWaste.quantity += w.quantity;
        } else {
          staff.wasteProductBreakdown.set(wid, {
            name: productNameMap.get(wid) ?? wid,
            quantity: w.quantity,
          });
        }
      }

      // Aggregate component production (grams)
      if (record.componentProduced) {
        for (const c of record.componentProduced) {
          if (c.grams <= 0) continue;
          staff.totalComponentGrams += c.grams;
          const existing = staff.componentBreakdown.get(c.kitchenComponentCode);
          if (existing) {
            existing.grams += c.grams;
          } else {
            staff.componentBreakdown.set(c.kitchenComponentCode, {
              name: c.kitchenComponentName,
              grams: c.grams,
            });
          }
        }
      }

      // Aggregate component waste (grams)
      if (record.componentWaste) {
        for (const c of record.componentWaste) {
          if (c.grams <= 0) continue;
          staff.totalComponentWasteGrams += c.grams;
          const existing = staff.componentWasteBreakdown.get(c.kitchenComponentCode);
          if (existing) {
            existing.grams += c.grams;
          } else {
            staff.componentWasteBreakdown.set(c.kitchenComponentCode, {
              name: c.kitchenComponentName,
              grams: c.grams,
            });
          }
        }
      }
    }

    // Convert Maps/Sets to serializable arrays and sort by total produced desc
    const results = Array.from(staffMap.values()).map((s) => ({
      staffKey: s.staffKey,
      chefName: s.chefName,
      chefUserId: s.chefUserId,
      totalBallsProduced: s.totalBallsProduced,
      productBreakdown: Array.from(s.productBreakdown.entries()).map(([id, val]) => ({
        menuProductId: id,
        name: val.name,
        quantity: val.quantity,
        ballCount: val.ballCount,
      })),
      totalComponentGrams: s.totalComponentGrams,
      componentBreakdown: Array.from(s.componentBreakdown.entries()).map(([code, val]) => ({
        code,
        name: val.name,
        grams: val.grams,
      })),
      totalComponentWasteGrams: s.totalComponentWasteGrams,
      componentWasteBreakdown: Array.from(s.componentWasteBreakdown.entries()).map(([code, val]) => ({
        code,
        name: val.name,
        grams: val.grams,
      })),
      totalWaste: s.totalWaste,
      wasteByReason: Array.from(s.wasteByReason.entries()).map(([reason, qty]) => ({
        reason,
        quantity: qty,
      })),
      wasteProductBreakdown: Array.from(s.wasteProductBreakdown.entries()).map(([id, val]) => ({
        menuProductId: id,
        name: val.name,
        quantity: val.quantity,
      })),
      shiftCount: s.shiftCount,
      daysWorked: s.daysWorked.size,
    }));

    results.sort((a, b) => b.totalBallsProduced - a.totalBallsProduced);

    return {
      startDate: args.startDate,
      endDate: args.endDate,
      totalRecords: records.length,
      staff: results,
    };
  },
});
