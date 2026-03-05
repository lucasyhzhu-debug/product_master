/**
 * Dispatch plan grid computation helpers.
 * Pure functions that build plan cells, subtotals, and auto-suggest quantities.
 */

import type { Id } from "../../_generated/dataModel";
import { calculateAutoSuggest, getDayTypeForDate } from "../helpers";

// ─── Types ───

export interface OutletProductRow {
  menuProductId: string;
  productName: string;
  externalProductName: string;
  externalProductCode: string;
  currentStock: number;
  price: number;
  isHidden: boolean;
}

export interface OutletResult {
  outletId: Id<"externalOutlets">;
  outletName: string;
  isActive: boolean;
  products: OutletProductRow[];
  subtotalByDay: Record<string, number>;
}

export interface PlanCell {
  plannedQty: number;
  suggestedQty: number;
  isStockOut: boolean;
  status: string;
  source?: string;
  destination?: string;
}

export interface PlanRecord {
  outletId: Id<"externalOutlets">;
  menuProductId: Id<"menuProducts">;
  date: string;
  plannedQty: number;
  suggestedQty: number;
  isStockOut: boolean;
  status: string;
  source?: string | null;
  destination?: string | null;
}

// ─── Previous week aggregation ───

/**
 * Aggregate previous week dispatch plans into per-outlet-product baselines
 * and per-product totals. Excludes stock-out plans.
 */
export function aggregatePreviousWeek(
  prevWeekPlans: PlanRecord[]
): {
  prevWeekByOutletProduct: Map<string, number>;
  previousWeekTotals: Record<string, number>;
} {
  const prevWeekByOutletProduct = new Map<string, number>();
  const previousWeekTotals: Record<string, number> = {};

  for (const p of prevWeekPlans) {
    if (!p.isStockOut) {
      const opKey = `${p.outletId}_${p.menuProductId}`;
      prevWeekByOutletProduct.set(
        opKey,
        (prevWeekByOutletProduct.get(opKey) ?? 0) + p.plannedQty
      );
      const mpKey = p.menuProductId as string;
      previousWeekTotals[mpKey] = (previousWeekTotals[mpKey] ?? 0) + p.plannedQty;
    }
  }

  return { prevWeekByOutletProduct, previousWeekTotals };
}

// ─── Outlet product building ───

/**
 * Build the product list for a single outlet in the dispatch grid.
 * Resolves product names, current stock, and prices from pre-fetched lookup maps.
 * Filters out hidden products per restock target settings.
 */
export function buildOutletProductRows(
  outletId: Id<"externalOutlets">,
  productMappings: Array<{
    menuProductId?: Id<"menuProducts">;
    externalProductCode: string;
  }>,
  targetLookup: Map<string, { isHidden?: boolean; customPrice?: number }>,
  menuProducts: Map<string, { name: string }>,
  stockByOutletProduct: Map<string, number>,
  priceByOutletProduct: Map<string, number>,
  externalNameByCode: Map<string, string>
): OutletProductRow[] {
  const outletProducts: OutletProductRow[] = [];

  for (const mapping of productMappings) {
    if (!mapping.menuProductId) continue;

    const mpId = mapping.menuProductId as string;
    const productKey = mapping.externalProductCode;
    const targetKey = `${outletId}_${productKey}`;
    const target = targetLookup.get(targetKey);

    // Filter hidden products
    if (target?.isHidden === true) continue;

    const mp = menuProducts.get(mpId);
    const stockKey = `${outletId}_${productKey}`;
    const currentStock = stockByOutletProduct.get(stockKey) ?? 0;

    // Price priority: restockTargets.customPrice > K3MART snapshot price > 0
    const customPrice = target?.customPrice;
    const snapshotPrice = priceByOutletProduct.get(stockKey) ?? 0;
    const price = customPrice ?? snapshotPrice;

    // K3Mart product name from externalProductMappings
    const k3martName = externalNameByCode.get(productKey) ?? productKey;

    outletProducts.push({
      menuProductId: mpId,
      productName: mp?.name ?? k3martName,
      externalProductName: k3martName,
      externalProductCode: productKey,
      currentStock,
      price,
      isHidden: false,
    });
  }

  return outletProducts;
}

// ─── Plan cell aggregation + subtotals ───

/**
 * Build plan cells from dispatch plans and compute subtotals per outlet-day,
 * week totals by day, week totals by product, and grand total.
 * Only counts stock-in plans (excludes stock-out).
 */
export function buildPlanCellsAndTotals(
  plans: PlanRecord[],
  outletResults: OutletResult[],
  weekDates: string[]
): {
  planCells: Record<string, PlanCell>;
  weekTotalsByDay: Record<string, number>;
  weekTotalsByProduct: Record<string, number>;
  grandTotal: number;
} {
  const planCells: Record<string, PlanCell> = {};

  const weekTotalsByDay: Record<string, number> = {};
  const weekTotalsByProduct: Record<string, number> = {};
  let grandTotal = 0;

  for (const date of weekDates) {
    weekTotalsByDay[date] = 0;
  }

  for (const plan of plans) {
    if (plan.isStockOut) continue; // Only stock-in counts for planning grid

    const cellKey = `${plan.outletId}_${plan.date}_${plan.menuProductId}`;
    planCells[cellKey] = {
      plannedQty: plan.plannedQty,
      suggestedQty: plan.suggestedQty,
      isStockOut: plan.isStockOut,
      status: plan.status,
      source: plan.source ?? undefined,
      destination: plan.destination ?? undefined,
    };

    // Update subtotals per outlet
    const outletResult = outletResults.find(
      (o) => o.outletId === plan.outletId
    );
    if (outletResult && outletResult.subtotalByDay[plan.date] !== undefined) {
      outletResult.subtotalByDay[plan.date] += plan.plannedQty;
    }

    // Update week totals
    if (weekTotalsByDay[plan.date] !== undefined) {
      weekTotalsByDay[plan.date] += plan.plannedQty;
    }
    const mpKey = plan.menuProductId as string;
    weekTotalsByProduct[mpKey] = (weekTotalsByProduct[mpKey] ?? 0) + plan.plannedQty;
    grandTotal += plan.plannedQty;
  }

  return { planCells, weekTotalsByDay, weekTotalsByProduct, grandTotal };
}

// ─── Auto-suggest for empty cells ───

/**
 * Fill empty plan cells with suggested quantities based on previous week baselines
 * and day type classification (weekday/weekend/holiday/sales_date).
 * Mutates planCells in-place for efficiency.
 */
export function fillAutoSuggest(
  outletResults: OutletResult[],
  prevWeekByOutletProduct: Map<string, number>,
  weekDates: string[],
  planCells: Record<string, PlanCell>
): void {
  for (const outlet of outletResults) {
    for (const product of outlet.products) {
      const opKey = `${outlet.outletId}_${product.menuProductId}`;
      const baseline = prevWeekByOutletProduct.get(opKey) ?? 0;

      for (const date of weekDates) {
        const cellKey = `${outlet.outletId}_${date}_${product.menuProductId}`;
        if (!planCells[cellKey]) {
          const dayType = getDayTypeForDate(date);
          const suggestedQty = calculateAutoSuggest(baseline, dayType);
          planCells[cellKey] = {
            plannedQty: 0,
            suggestedQty,
            isStockOut: false,
            status: "draft",
          };
        }
      }
    }
  }
}
