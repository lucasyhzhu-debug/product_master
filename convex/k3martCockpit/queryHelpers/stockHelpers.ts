/**
 * Stock summary and outlet settings computation helpers.
 * Pure functions that transform pre-fetched snapshot + revenue data into display-ready objects.
 */

import type { Id, Doc } from "../../_generated/dataModel";

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
    externalProductCode: string;
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
