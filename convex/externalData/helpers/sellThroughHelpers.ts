/**
 * Sell-through analysis helpers.
 * Helper functions for computing daily rates, stock status, and restock suggestions.
 * Note: buildSellThroughProducts mutates the passed-in productMap for efficiency.
 */
import { isWeekend } from "../../lib/periodRange";
import type { Doc } from "../../_generated/dataModel";

/** Product-level sales analysis accumulated from revenue data. */
export type ProductAnalysis = {
  productKey: string;
  productName: string;
  menuProductId?: string;
  weekdaySalesTotal: number;
  weekendSalesTotal: number;
  last7dSales: number;
  prev7dSales: number;
  transactionCount: number;
};

/**
 * Count weekdays and weekend days in a time range (WIB-adjusted via isWeekend).
 * Returns at least 1 for each to avoid division by zero.
 */
export function countDayTypes(startMs: number, endMs: number): { numWeekdays: number; numWeekendDays: number } {
  let numWeekdays = 0;
  let numWeekendDays = 0;
  for (let d = startMs; d < endMs; d += 24 * 60 * 60 * 1000) {
    if (isWeekend(d)) numWeekendDays++;
    else numWeekdays++;
  }
  return {
    numWeekdays: Math.max(numWeekdays, 1),
    numWeekendDays: Math.max(numWeekendDays, 1),
  };
}

/**
 * Build the final sell-through product list from accumulated product analysis data.
 * Pure transformation: computes daily rates, stock status, trend, and suggestions.
 */
export function buildSellThroughProducts(
  productMap: Map<string, ProductAnalysis>,
  currentStockMap: Map<string, number>,
  targetMap: Map<string, Doc<"restockTargets">>,
  numWeekdays: number,
  numWeekendDays: number
) {
  // Add stock-only products (have stock but no sales in 30 days)
  for (const key of currentStockMap.keys()) {
    if (!productMap.has(key)) {
      productMap.set(key, {
        productKey: key,
        productName: key,
        weekdaySalesTotal: 0,
        weekendSalesTotal: 0,
        last7dSales: 0,
        prev7dSales: 0,
        transactionCount: 0,
      });
    }
  }

  // Build final product list
  return Array.from(productMap.values()).map((p) => {
    const weekdayDailyRate = p.weekdaySalesTotal / numWeekdays;
    const weekendDailyRate = p.weekendSalesTotal / numWeekendDays;
    const totalSold30d = p.weekdaySalesTotal + p.weekendSalesTotal;
    const overallDailyRate = totalSold30d / 30;

    const currentStock = currentStockMap.get(p.productKey);
    const daysRemaining =
      currentStock !== undefined && overallDailyRate > 0
        ? currentStock / overallDailyRate
        : undefined;
    const status =
      daysRemaining !== undefined
        ? daysRemaining < 1
          ? ("critical" as const)
          : daysRemaining < 2
            ? ("warning" as const)
            : ("ok" as const)
        : undefined;

    // Suggestions: cover weekday (5 days) or weekend (2 days) + 20% buffer
    const suggestedWeekday = Math.ceil(weekdayDailyRate * 5 * 1.2);
    const suggestedWeekend = Math.ceil(weekendDailyRate * 2 * 1.2);

    const target = targetMap.get(p.productKey);

    // Trend
    const trendDirection: "up" | "down" | "flat" =
      p.last7dSales > p.prev7dSales * 1.1
        ? "up"
        : p.last7dSales < p.prev7dSales * 0.9
          ? "down"
          : "flat";

    // Confidence
    const confidence: "high" | "medium" | "low" =
      p.transactionCount >= 20 ? "high" : p.transactionCount >= 5 ? "medium" : "low";

    return {
      productKey: p.productKey,
      productName: p.productName,
      menuProductId: p.menuProductId,
      currentStock,
      weekdaySalesTotal: p.weekdaySalesTotal,
      weekendSalesTotal: p.weekendSalesTotal,
      totalSold30d,
      weekdayDailyRate: Math.round(weekdayDailyRate * 10) / 10,
      weekendDailyRate: Math.round(weekendDailyRate * 10) / 10,
      overallDailyRate: Math.round(overallDailyRate * 10) / 10,
      daysRemaining: daysRemaining !== undefined ? Math.round(daysRemaining * 10) / 10 : undefined,
      status,
      suggestedWeekday,
      suggestedWeekend,
      targetWeekday: target?.weekdayTarget,
      targetWeekend: target?.weekendTarget,
      last7dSales: p.last7dSales,
      prev7dSales: p.prev7dSales,
      trendDirection,
      transactionCount: p.transactionCount,
      confidence,
    };
  });
}
