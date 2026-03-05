/**
 * K3 Mart Kitchen Summary Query
 *
 * Combines 4 existing data sources into a virtual "daily K3 Mart summary"
 * for the Kitchen view — no new schema tables needed.
 *
 * Sources:
 * 1. productionProductTargets (source="consignment", date=today)
 * 2. externalStockSnapshots (latest batch per outlet)
 * 3. externalRevenue (source="k3mart", today)
 * 4. externalProductMappings (source="k3mart") for code→menuProductId
 */
import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const getK3MartKitchenSummary = query({
  args: {
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    // 1. Fetch active K3 Mart outlets
    const k3martOutlets = await ctx.db
      // MIS-02: compound index
      .query("externalOutlets")
      .withIndex("by_source_active", (q) => q.eq("source", "k3mart").eq("isActive", true))
      .collect();

    if (k3martOutlets.length === 0) {
      return {
        items: [],
        lastSyncAt: null,
        totalOutlets: 0,
        syncStatus: null,
      };
    }

    // 2. Fetch latest snapshot batch per outlet → build per-outlet stock maps
    // Structure: Map<outletId, Map<externalProductCode, { quantity, productName }>>
    const outletStockMaps = new Map<
      string,
      { outletName: string; stockMap: Map<string, { quantity: number; productName: string }> }
    >();

    let latestSnapshotAt: number | null = null;

    for (const outlet of k3martOutlets) {
      const latestSnapshot = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", outlet._id))
        .order("desc")
        .first();

      if (!latestSnapshot) {
        outletStockMaps.set(outlet._id as string, {
          outletName: outlet.name,
          stockMap: new Map(),
        });
        continue;
      }

      // Track latest sync time across all outlets
      if (latestSnapshotAt === null || latestSnapshot.snapshotAt > latestSnapshotAt) {
        latestSnapshotAt = latestSnapshot.snapshotAt;
      }

      // Get all products from this batch for this outlet (IRB-06: compound index)
      const batchProducts = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_batch_outlet", (q) =>
          q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId).eq("outletId", outlet._id)
        )
        .collect();

      const stockMap = new Map<string, { quantity: number; productName: string }>();
      for (const sp of batchProducts) {
        stockMap.set(sp.externalProductCode, {
          quantity: sp.quantity,
          productName: sp.productName,
        });
      }

      outletStockMaps.set(outlet._id as string, {
        outletName: outlet.name,
        stockMap,
      });
    }

    // 3. Fetch product mappings: externalProductCode → menuProductId
    const mappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "k3mart"))
      .collect();

    const codeToMenuProductId = new Map<string, string>();
    for (const m of mappings) {
      if (m.menuProductId) {
        codeToMenuProductId.set(m.externalProductCode, m.menuProductId as string);
      }
    }

    // 4. Fetch today's K3 Mart sales
    const todayStart = new Date(args.date + "T00:00:00+07:00").getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    // IRB-02: both period bounds at index level
    const todayRevenues = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) =>
        q.eq("source", "k3mart").gte("periodStart", todayStart).lt("periodStart", todayEnd)
      )
      .collect();

    // Aggregate sales per outlet per externalProductCode
    // Map<outletId, Map<externalProductCode, quantitySold>>
    const outletSalesMap = new Map<string, Map<string, number>>();
    for (const rev of todayRevenues) {
      const outletKey = rev.outletId ? (rev.outletId as string) : "__no_outlet__";
      if (!outletSalesMap.has(outletKey)) {
        outletSalesMap.set(outletKey, new Map());
      }
      const salesMap = outletSalesMap.get(outletKey)!;
      const code = rev.externalProductCode ?? "__unknown__";
      salesMap.set(code, (salesMap.get(code) ?? 0) + (rev.quantitySold ?? 0));
    }

    // 5. Fetch consignment targets for today
    const consignmentTargets = await ctx.db
      .query("productionProductTargets")
      .withIndex("by_date_source", (q) =>
        q.eq("date", args.date).eq("source", "consignment")
      )
      .collect();

    const consignmentMap = new Map<string, number>();
    for (const t of consignmentTargets) {
      if (t.quantity > 0) {
        consignmentMap.set(t.menuProductId as string, t.quantity);
      }
    }

    // 6. Build reverse mapping: menuProductId → externalProductCodes[]
    const menuProductToCodes = new Map<string, string[]>();
    for (const [code, mpId] of codeToMenuProductId) {
      const existing = menuProductToCodes.get(mpId) ?? [];
      existing.push(code);
      menuProductToCodes.set(mpId, existing);
    }

    // 7. Collect all relevant menuProductIds (from targets + from stock via mappings)
    const allMenuProductIds = new Set<string>();
    for (const [mpId] of consignmentMap) {
      allMenuProductIds.add(mpId);
    }
    // Also add products visible in outlet stock (mapped ones)
    for (const [, { stockMap }] of outletStockMaps) {
      for (const [code] of stockMap) {
        const mpId = codeToMenuProductId.get(code);
        if (mpId) allMenuProductIds.add(mpId);
      }
    }

    // 8. Aggregate per menuProductId
    const items = [];
    for (const mpId of allMenuProductIds) {
      const menuProduct = await ctx.db.get(mpId as Id<"menuProducts">);
      if (!menuProduct) continue;

      const codes = menuProductToCodes.get(mpId) ?? [];
      const consignmentTarget = consignmentMap.get(mpId) ?? 0;

      let totalOutletStock = 0;
      let totalSoldToday = 0;
      const outletBreakdown: Array<{
        outletName: string;
        stock: number;
        soldToday: number;
      }> = [];

      for (const outlet of k3martOutlets) {
        const outletKey = outlet._id as string;
        const outletData = outletStockMaps.get(outletKey);
        if (!outletData) continue;

        let outletStock = 0;
        for (const code of codes) {
          outletStock += outletData.stockMap.get(code)?.quantity ?? 0;
        }

        let outletSold = 0;
        const salesForOutlet = outletSalesMap.get(outletKey);
        if (salesForOutlet) {
          for (const code of codes) {
            outletSold += salesForOutlet.get(code) ?? 0;
          }
        }

        totalOutletStock += outletStock;
        totalSoldToday += outletSold;

        outletBreakdown.push({
          outletName: outletData.outletName,
          stock: outletStock,
          soldToday: outletSold,
        });
      }

      items.push({
        menuProductId: mpId,
        productName: menuProduct.name,
        consignmentTarget,
        totalOutletStock,
        totalSoldToday,
        gapToTarget: Math.max(0, consignmentTarget - totalOutletStock),
        outletBreakdown,
      });
    }

    // Sort by consignment target desc (products with targets first), then by name
    items.sort((a, b) => {
      if (b.consignmentTarget !== a.consignmentTarget) {
        return b.consignmentTarget - a.consignmentTarget;
      }
      return a.productName.localeCompare(b.productName);
    });

    // 9. Get last K3 Mart sync log
    const lastSync = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .order("desc")
      .first();

    return {
      items,
      lastSyncAt: latestSnapshotAt ?? lastSync?.timestamp ?? null,
      totalOutlets: k3martOutlets.length,
      syncStatus: lastSync?.status === "success"
        ? ("success" as const)
        : lastSync?.status === "error"
          ? ("error" as const)
          : null,
    };
  },
});
