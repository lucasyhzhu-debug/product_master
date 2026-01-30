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
