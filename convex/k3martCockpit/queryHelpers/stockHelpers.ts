/**
 * Stock summary and outlet settings computation helpers.
 * Helper functions that transform pre-fetched snapshot + revenue data into display-ready objects.
 * Note: accumulateSnapshotStock and enrichMappingPrices mutate their input maps in-place for efficiency.
 */

import type { Id } from "../../_generated/dataModel";

// ─── Types ───

export interface OutletProduct {
  externalProductId: string;
  externalProductCode: string;
  productName: string;
  quantity: number;
  price: number;
  soldToday: number;
  avgDailySales7d: number;
  menuProductId: string | null;
}

export interface ProductSetting {
  productKey: string;
  menuProductId: string | undefined;
  externalProductName: string;
  productName: string;
  defaultPrice: number;
  weekdayTarget: number;
  weekendTarget: number;
  customPrice: number | null;
  isHidden: boolean;
}

export interface StockSnapshot {
  externalProductId: string;
  externalProductCode: string;
  productName: string;
  quantity: number;
  price: number;
}

// ─── Stock summary helpers ───

/**
 * Build product list with sales data for a single outlet snapshot.
 * Pure function: given pre-fetched snapshot products and filtered revenue,
 * computes today's sales, 7-day averages, and maps to menu product IDs.
 */
export function buildOutletProducts(
  snapshotProducts: StockSnapshot[],
  outletRevenue: Array<{
    externalProductCode?: string;
    periodStart: number;
    quantitySold?: number;
  }>,
  todayStart: number,
  todayEnd: number,
  sevenDaysAgo: number,
  codeToMenuProduct: Map<string, string>
): OutletProduct[] {
  return snapshotProducts.map((sp) => {
    // Today's sales for this product
    const todaySales = outletRevenue
      .filter(
        (r) =>
          r.externalProductCode === sp.externalProductCode &&
          r.periodStart >= todayStart &&
          r.periodStart < todayEnd
      )
      .reduce((sum, r) => sum + (r.quantitySold ?? 0), 0);

    // Last 7 days sales for avg calculation
    const sevenDaySales = outletRevenue
      .filter(
        (r) =>
          r.externalProductCode === sp.externalProductCode &&
          r.periodStart >= sevenDaysAgo &&
          r.periodStart < todayEnd
      )
      .reduce((sum, r) => sum + (r.quantitySold ?? 0), 0);

    const avgDailySales7d = sevenDaySales / 7;

    return {
      externalProductId: sp.externalProductId,
      externalProductCode: sp.externalProductCode,
      productName: sp.productName,
      quantity: sp.quantity,
      price: sp.price,
      soldToday: todaySales,
      avgDailySales7d,
      menuProductId: codeToMenuProduct.get(sp.externalProductCode) ?? null,
    };
  });
}

// ─── Snapshot stock/price map builder ───

/**
 * Build stock and price lookup maps from pre-fetched snapshot products.
 * Used by both getOutletStockSummaryInternal and getWeeklyDispatchPlans
 * to avoid duplicating the same aggregation pattern.
 */
export function buildStockAndPriceMaps(
  outletId: string,
  snapshotProducts: Array<{ externalProductCode: string; quantity: number; price: number }>
): {
  stockEntries: Array<[string, number]>;
  priceEntries: Array<[string, number]>;
} {
  const stockEntries: Array<[string, number]> = [];
  const priceEntries: Array<[string, number]> = [];

  for (const sp of snapshotProducts) {
    const key = `${outletId}_${sp.externalProductCode}`;
    stockEntries.push([key, sp.quantity]);
    priceEntries.push([key, sp.price]);
  }

  return { stockEntries, priceEntries };
}

// ─── Outlet settings helpers ───

/**
 * Build product settings array for a single outlet.
 * Pure function: given the outlet's restock targets and product mapping info,
 * produces the display-ready product settings list.
 */
export function buildProductSettings(
  outletTargets: Array<{
    productKey: string;
    menuProductId?: Id<"menuProducts">;
    weekdayTarget: number;
    weekendTarget: number;
    customPrice?: number;
    isHidden?: boolean;
  }>,
  mappingByCode: Map<string, {
    externalName: string;
    menuProductName: string | null;
    snapshotPrice: number;
  }>
): ProductSetting[] {
  return outletTargets.map((t) => {
    const mapping = mappingByCode.get(t.productKey);
    return {
      productKey: t.productKey,
      menuProductId: t.menuProductId as string | undefined,
      // Show K3Mart name (externalProductName) as primary display
      externalProductName: mapping?.externalName ?? t.productKey,
      // Show POS/menu product name as secondary
      productName: mapping?.menuProductName ?? mapping?.externalName ?? t.productKey,
      // Real default price from snapshot (not 0)
      defaultPrice: mapping?.snapshotPrice ?? 0,
      weekdayTarget: t.weekdayTarget,
      weekendTarget: t.weekendTarget,
      customPrice: t.customPrice ?? null,
      isHidden: t.isHidden ?? false,
    };
  });
}

// ─── Production readiness helpers ───

export interface ReadinessData {
  stickered: number;
  plannedToday: number;
  plannedTomorrow: number;
}

/**
 * Aggregate dispatch plans into a production readiness map.
 * Builds a map of menuProductId -> { stickered, plannedToday, plannedTomorrow }
 * from pre-fetched production counts and plan data. Excludes stock-out plans.
 */
export function buildProductionReadinessMap(
  productionCounts: Array<{ menuProductId: string; stickered: number }>,
  todayPlans: Array<{ menuProductId: string; isStockOut: boolean; plannedQty: number }>,
  tomorrowPlans: Array<{ menuProductId: string; isStockOut: boolean; plannedQty: number }>
): Map<string, ReadinessData> {
  const productMap = new Map<string, ReadinessData>();

  // Initialize with aggregated production counts
  for (const pc of productionCounts) {
    productMap.set(pc.menuProductId, {
      stickered: pc.stickered,
      plannedToday: 0,
      plannedTomorrow: 0,
    });
  }

  // Aggregate today's planned quantities (only stock-in)
  for (const plan of todayPlans) {
    if (!plan.isStockOut) {
      const existing = productMap.get(plan.menuProductId);
      if (existing) {
        existing.plannedToday += plan.plannedQty;
      } else {
        productMap.set(plan.menuProductId, {
          stickered: 0,
          plannedToday: plan.plannedQty,
          plannedTomorrow: 0,
        });
      }
    }
  }

  // Aggregate tomorrow's planned quantities (only stock-in)
  for (const plan of tomorrowPlans) {
    if (!plan.isStockOut) {
      const existing = productMap.get(plan.menuProductId);
      if (existing) {
        existing.plannedTomorrow += plan.plannedQty;
      } else {
        productMap.set(plan.menuProductId, {
          stickered: 0,
          plannedToday: 0,
          plannedTomorrow: plan.plannedQty,
        });
      }
    }
  }

  return productMap;
}

// ─── K3Mart stock aggregation helpers ───

/**
 * Aggregate K3Mart stock by externalProductCode into menuProductId totals.
 * Pure function: given a code-to-quantity map and code-to-menuProductId mapping,
 * produces a menuProductId-to-totalStock map.
 */
export function aggregateStockByMenuProduct(
  stockByCode: Map<string, number>,
  codeToMenuProduct: Map<string, string>
): Map<string, number> {
  const menuProductStockMap = new Map<string, number>();
  for (const [code, qty] of stockByCode) {
    const mpId = codeToMenuProduct.get(code);
    if (mpId) {
      const existing = menuProductStockMap.get(mpId) ?? 0;
      menuProductStockMap.set(mpId, existing + qty);
    }
  }
  return menuProductStockMap;
}

/**
 * Accumulate snapshot product quantities into a stock-by-code map.
 * Pure function used by getInventorySources to aggregate stock across outlets.
 */
export function accumulateSnapshotStock(
  snapshotProducts: Array<{ externalProductCode: string; quantity: number }>,
  stockMap: Map<string, number>
): void {
  for (const sp of snapshotProducts) {
    const existing = stockMap.get(sp.externalProductCode) ?? 0;
    stockMap.set(sp.externalProductCode, existing + sp.quantity);
  }
}

/**
 * Enrich a mapping-by-code map with snapshot prices.
 * Sets snapshotPrice on each mapping entry if not already set and snapshot has a price > 0.
 */
export function enrichMappingPrices(
  snapshotProducts: Array<{ externalProductCode: string; price: number }>,
  mappingByCode: Map<string, { externalName: string; menuProductName: string | null; snapshotPrice: number }>
): void {
  for (const sp of snapshotProducts) {
    const mapping = mappingByCode.get(sp.externalProductCode);
    if (mapping && mapping.snapshotPrice === 0 && sp.price > 0) {
      mapping.snapshotPrice = sp.price;
    }
  }
}
