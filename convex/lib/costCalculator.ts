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
 * - packaging: All packaging items (boxes, stickers, brochures, bags)
 *
 * ALL packaging is included in COGS (business decision confirmed by user).
 *
 * @param components - Array of { unitCostIdr, category, quantity }
 * @returns Breakdown: { production, packaging, total }
 *
 * @example
 * // Product with 3 Mid Balls + packaging
 * const components = [
 *   { unitCostIdr: 3000, category: "production", quantity: 3 },   // 9000
 *   { unitCostIdr: 500, category: "packaging", quantity: 1 },     // 500
 *   { unitCostIdr: 50, category: "packaging", quantity: 3 },      // 150
 * ];
 * const cogs = calculateMenuProductCOGS(components);
 * // => { production: 9000, packaging: 650, total: 9650 }
 */
export function calculateMenuProductCOGS(
  components: Array<{
    unitCostIdr: number;
    category: string; // "production" | "packaging" (also accepts legacy "direct_packaging" | "indirect_packaging")
    quantity: number;
  }>
): {
  production: number;
  packaging: number;
  total: number;
} {
  let production = 0;
  let packaging = 0;

  for (const component of components) {
    const lineCost = component.unitCostIdr * component.quantity;

    if (component.category === "production") {
      production += lineCost;
    } else {
      // All non-production categories are packaging
      // Handles "packaging", "direct_packaging", "indirect_packaging"
      packaging += lineCost;
    }
  }

  // Total COGS = production + packaging (ALL packaging included)
  const total = production + packaging;

  return {
    production,
    packaging,
    total,
  };
}

/**
 * Build a per-product COGS map from BOM components and component types.
 * Preloads all BOM data into in-memory maps for O(1) lookups.
 *
 * Follows the getLifetimeTotalsInternal pattern: parallel table scans,
 * then single-pass aggregation into a lookup map.
 *
 * @param bomComponents - All rows from menuProductComponents table
 * @param componentTypes - All rows from componentTypes table
 * @returns Map from menuProductId string to { production, packaging, total } in IDR
 */
export function buildProductCOGSMap(
  bomComponents: Array<{
    menuProductId: string;
    componentTypeId: string;
    quantity: number;
  }>,
  componentTypes: Array<{
    _id: string;
    unitCostIdr: number;
    category: string;
  }>
): Map<string, { production: number; packaging: number; total: number }> {
  // Step 1: Build component type lookup map
  const componentTypeMap = new Map<
    string,
    { unitCostIdr: number; category: string }
  >();
  for (const ct of componentTypes) {
    componentTypeMap.set(ct._id, {
      unitCostIdr: ct.unitCostIdr,
      category: ct.category,
    });
  }

  // Step 2: Single-pass aggregation over BOM components
  const result = new Map<
    string,
    { production: number; packaging: number; total: number }
  >();

  for (const comp of bomComponents) {
    const ct = componentTypeMap.get(comp.componentTypeId);
    if (!ct) continue; // Defensive: skip unknown component types

    const lineCost = ct.unitCostIdr * comp.quantity;

    let entry = result.get(comp.menuProductId);
    if (!entry) {
      entry = { production: 0, packaging: 0, total: 0 };
      result.set(comp.menuProductId, entry);
    }

    if (ct.category === "production") {
      entry.production += lineCost;
    } else {
      // All non-production categories are packaging
      entry.packaging += lineCost;
    }
    entry.total = entry.production + entry.packaging;
  }

  return result;
}
