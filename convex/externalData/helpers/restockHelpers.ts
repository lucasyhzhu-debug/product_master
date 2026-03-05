/**
 * Restock overview computation helpers.
 * Pure functions that transform pre-fetched demand + stock data into product analysis lists.
 */
import type { Doc } from "../../_generated/dataModel";

/** Stock status for a single product. */
export type StockStatus = "critical" | "warning" | "ok";

/** Restock product summary (K3Mart outlet variant with guaranteed stock). */
export type K3MartRestockProduct = {
  productKey: string;
  productName: string;
  currentStock: number;
  dailyRate: number;
  daysRemaining: number;
  status: StockStatus;
};

/** Restock product summary (demand-based variant with optional stock). */
export type DemandRestockProduct = {
  productKey: string;
  productName: string;
  currentStock: number | undefined;
  dailyRate: number;
  daysRemaining: number | undefined;
  status: StockStatus | undefined;
};

/**
 * Build K3Mart outlet product list from stock snapshots and revenue demand.
 * Merges stock data with demand data, adding demand-only products as critical.
 *
 * @param stockProducts - Latest stock snapshot products for this outlet
 * @param revenue - Revenue records for past N days (used to build demand map)
 * @param daysWindow - Number of days in the demand window (typically 14)
 */
export function buildK3MartOutletProducts(
  stockProducts: Doc<"externalStockSnapshots">[],
  revenue: Doc<"externalRevenue">[],
  daysWindow: number
): {
  products: K3MartRestockProduct[];
  criticalCount: number;
  warningCount: number;
  totalDailyDemand: number;
} {
  // Aggregate demand by product
  const demandMap = new Map<string, { totalSold: number; productName: string }>();
  for (const r of revenue) {
    const key = r.externalProductCode ?? r.productName ?? "unknown";
    const existing = demandMap.get(key);
    const qty = r.quantitySold ?? 0;
    if (existing) {
      existing.totalSold += qty;
    } else {
      demandMap.set(key, {
        totalSold: qty,
        productName: r.productName ?? key,
      });
    }
  }

  const products: K3MartRestockProduct[] = stockProducts.map((sp) => {
    const demand = demandMap.get(sp.externalProductCode);
    const dailyRate = demand ? demand.totalSold / daysWindow : 0;
    const daysRemaining = dailyRate > 0 ? sp.quantity / dailyRate : sp.quantity > 0 ? 999 : 0;
    const status: StockStatus =
      daysRemaining < 1 ? "critical" : daysRemaining < 2 ? "warning" : "ok";

    return {
      productKey: sp.externalProductCode,
      productName: sp.productName,
      currentStock: sp.quantity,
      dailyRate: Math.round(dailyRate * 10) / 10,
      daysRemaining: Math.round(daysRemaining * 10) / 10,
      status,
    };
  });

  // Also add products with demand but no stock data
  for (const [key, demand] of demandMap) {
    if (!products.some((p) => p.productKey === key)) {
      products.push({
        productKey: key,
        productName: demand.productName,
        currentStock: 0,
        dailyRate: Math.round((demand.totalSold / daysWindow) * 10) / 10,
        daysRemaining: 0,
        status: "critical" as const,
      });
    }
  }

  const criticalCount = products.filter((p) => p.status === "critical").length;
  const warningCount = products.filter((p) => p.status === "warning").length;
  const totalDailyDemand = products.reduce((sum, p) => sum + p.dailyRate, 0);

  return {
    products,
    criticalCount,
    warningCount,
    totalDailyDemand: Math.round(totalDailyDemand * 10) / 10,
  };
}

/**
 * Build demand-based product list with optional manual stock.
 * Unified helper for GoBiz and Internal channels (identical computation pattern).
 *
 * @param demandMap - Map of productName -> totalSold quantity
 * @param stockMap - Map of productKey -> manualStockEntry (optional stock data)
 * @param daysWindow - Number of days in the demand window (typically 14)
 */
export function buildDemandProducts(
  demandMap: Map<string, number>,
  stockMap: Map<string, Doc<"manualStockEntries">>,
  daysWindow: number
): DemandRestockProduct[] {
  return Array.from(demandMap.entries()).map(([name, totalSold]) => {
    const dailyRate = totalSold / daysWindow;
    const manualStock = stockMap.get(name);
    const currentStock = manualStock?.quantity;
    const daysRemaining = currentStock !== undefined && dailyRate > 0
      ? currentStock / dailyRate
      : undefined;
    const status = daysRemaining !== undefined
      ? (daysRemaining < 1 ? "critical" as const : daysRemaining < 2 ? "warning" as const : "ok" as const)
      : undefined;
    return {
      productKey: name,
      productName: name,
      currentStock,
      dailyRate: Math.round(dailyRate * 10) / 10,
      daysRemaining: daysRemaining !== undefined ? Math.round(daysRemaining * 10) / 10 : undefined,
      status,
    };
  });
}
