/**
 * Stock Delta Calculator
 *
 * Pure functions for calculating sales from stock snapshot pairs.
 * Similar pattern to costCalculator.ts - no database access, easily unit testable.
 *
 * Sales are inferred by comparing stock levels between two snapshots:
 * - Stock decreased = units sold
 * - Stock increased = restock event (not a sale)
 */

export interface SnapshotProduct {
  externalProductId: string;
  externalProductCode: string;
  productName: string;
  quantity: number;
  price: number;
  capital?: number;
}

export interface StockDelta {
  externalProductCode: string;
  productName: string;
  previousQuantity: number;
  currentQuantity: number;
  quantitySold: number;
  wasRestocked: boolean;
  estimatedRevenue: number;
  estimatedCost: number;
}

/**
 * Calculate stock deltas between two snapshots for the same outlet.
 * Returns only products where stock decreased (units were sold).
 */
export function calculateStockDeltas(
  previousSnapshot: SnapshotProduct[],
  currentSnapshot: SnapshotProduct[]
): StockDelta[] {
  const previousMap = new Map(
    previousSnapshot.map((p) => [p.externalProductId, p])
  );

  const deltas: StockDelta[] = [];

  for (const current of currentSnapshot) {
    const previous = previousMap.get(current.externalProductId);
    if (!previous) continue; // New product, skip

    const quantityChange = previous.quantity - current.quantity;

    if (quantityChange > 0) {
      // Stock decreased = units sold
      deltas.push({
        externalProductCode: current.externalProductCode,
        productName: current.productName,
        previousQuantity: previous.quantity,
        currentQuantity: current.quantity,
        quantitySold: quantityChange,
        wasRestocked: false,
        estimatedRevenue: quantityChange * current.price,
        estimatedCost: quantityChange * (current.capital ?? 0),
      });
    } else if (quantityChange < 0) {
      // Stock increased = restock (log but not a sale)
      deltas.push({
        externalProductCode: current.externalProductCode,
        productName: current.productName,
        previousQuantity: previous.quantity,
        currentQuantity: current.quantity,
        quantitySold: 0,
        wasRestocked: true,
        estimatedRevenue: 0,
        estimatedCost: 0,
      });
    }
    // quantityChange === 0 means no change, skip
  }

  return deltas;
}

/**
 * Summarize stock deltas into aggregate totals.
 */
export function summarizeDeltas(deltas: StockDelta[]): {
  totalUnitsSold: number;
  totalRevenue: number;
  totalCost: number;
  productsWithSales: number;
  productsRestocked: number;
} {
  let totalUnitsSold = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  let productsWithSales = 0;
  let productsRestocked = 0;

  for (const delta of deltas) {
    if (delta.quantitySold > 0) {
      totalUnitsSold += delta.quantitySold;
      totalRevenue += delta.estimatedRevenue;
      totalCost += delta.estimatedCost;
      productsWithSales++;
    }
    if (delta.wasRestocked) {
      productsRestocked++;
    }
  }

  return { totalUnitsSold, totalRevenue, totalCost, productsWithSales, productsRestocked };
}
