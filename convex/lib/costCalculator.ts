/**
 * Cost calculation utilities for recipes, packaging, and products.
 *
 * Unit conversions:
 * - kg -> g (x1000)
 * - l -> ml (x1000)
 * - m -> cm (x100)
 * - 1 ml = 1 g for liquids (business rule)
 *
 * Base units: g, ml, pcs, cm, sheets
 */

/**
 * Convert quantity to base unit.
 * kg -> g, l -> ml, m -> cm
 */
export function normalizeToBaseUnit(quantity: number, unit: string): number {
  if (unit === "kg" || unit === "l") {
    return quantity * 1000;
  }
  if (unit === "m") {
    return quantity * 100;
  }
  return quantity;
}

/**
 * Get the base unit for a given unit type.
 */
export function getBaseUnit(unitType: string): string {
  if (unitType === "kg" || unitType === "g") {
    return "g";
  }
  if (unitType === "l" || unitType === "ml") {
    return "ml";
  }
  if (unitType === "m" || unitType === "cm") {
    return "cm";
  }
  return unitType; // pcs, sheets
}

/**
 * Calculate the cost per base unit for an ingredient/material.
 * Returns { costPerUnit, baseUnit }
 */
export function calculateCostPerBaseUnit(
  priceExclShipping: number,
  shippingCost: number,
  volumePurchased: number,
  unitType: string
): { costPerUnit: number; baseUnit: string } {
  const totalCost = priceExclShipping + shippingCost;
  const baseVolume = normalizeToBaseUnit(volumePurchased, unitType);
  const baseUnit = getBaseUnit(unitType);

  if (baseVolume <= 0) {
    return { costPerUnit: 0, baseUnit };
  }

  return { costPerUnit: totalCost / baseVolume, baseUnit };
}

/**
 * Calculate line cost for an ingredient/material usage.
 */
export function calculateLineCost(
  costPerBaseUnit: number,
  quantity: number,
  unit: string
): number {
  const quantityBase = normalizeToBaseUnit(quantity, unit);
  return costPerBaseUnit * quantityBase;
}

/**
 * Calculate menu product COGS from components (Unified BOM).
 *
 * Use this for products with componentTypes (new inventory system).
 * For legacy products using productionUnitTypes, continue using existing logic.
 *
 * Breakdown by component category:
 * - production: Kitchen-produced units (balls)
 * - direct_packaging: Auto-included packaging (boxes, stickers, wrappers)
 * - indirect_packaging: Separate line items (brochures, bags) - not included in COGS
 *
 * @param components - Array of { unitCostIdr, category, quantity }
 * @returns Breakdown: { production, directPackaging, indirectPackaging, total }
 *
 * @example
 * // Product with 3 Mid Balls + packaging
 * const components = [
 *   { unitCostIdr: 3000, category: "production", quantity: 3 },        // 9000
 *   { unitCostIdr: 500, category: "direct_packaging", quantity: 1 },   // 500
 *   { unitCostIdr: 50, category: "direct_packaging", quantity: 3 },    // 150
 * ];
 * const cogs = calculateMenuProductCOGS(components);
 * // => { production: 9000, directPackaging: 650, indirectPackaging: 0, total: 9650 }
 */
export function calculateMenuProductCOGS(
  components: Array<{
    unitCostIdr: number;
    category: "production" | "direct_packaging" | "indirect_packaging";
    quantity: number;
  }>
): {
  production: number;
  directPackaging: number;
  indirectPackaging: number;
  total: number;
} {
  let production = 0;
  let directPackaging = 0;
  let indirectPackaging = 0;

  for (const component of components) {
    const lineCost = component.unitCostIdr * component.quantity;

    if (component.category === "production") {
      production += lineCost;
    } else if (component.category === "direct_packaging") {
      directPackaging += lineCost;
    } else if (component.category === "indirect_packaging") {
      indirectPackaging += lineCost;
    }
  }

  // Total COGS = production + direct packaging (indirect is sold separately)
  const total = production + directPackaging;

  return {
    production,
    directPackaging,
    indirectPackaging,
    total,
  };
}
