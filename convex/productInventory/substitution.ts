/**
 * Product Inventory Substitution - Pure Helper
 *
 * Phase 78: Resolves how many units to draw from direct stock vs substitute
 * when a product is configured with fulfillFromProductId + fulfillMultiplier.
 *
 * Rules:
 * - Direct stock consumed FIRST
 * - Shortfall = needed - directAvailable (clamped >= 0)
 * - substituteUnits = shortfall * multiplier
 * - If no substitution configured, returns directUnits = needed, substituteUnits = 0
 */

import type { Doc } from "../_generated/dataModel";

export interface SubstitutionPlan {
  /** Units to draw from direct stock */
  directUnits: number;
  /** Units to draw from substitute product (in substitute units, i.e., shortfall * multiplier) */
  substituteUnits: number;
  /** The source menu product for substitution */
  sourceProduct: Doc<"menuProducts"> | null;
  /** Whether any substitution is needed */
  needsSubstitution: boolean;
}

/**
 * Pure function: Given a product's stock availability and its substitution config,
 * compute how many units to draw from direct stock vs substitute.
 */
export function resolveSubstitutionPlan(
  needed: number,
  directAvailable: number,
  menuProduct: Doc<"menuProducts">,
  sourceProduct: Doc<"menuProducts"> | null,
): SubstitutionPlan {
  // No substitution configured
  if (!menuProduct.fulfillFromProductId || !menuProduct.fulfillMultiplier || !sourceProduct) {
    return {
      directUnits: needed,
      substituteUnits: 0,
      sourceProduct: null,
      needsSubstitution: false,
    };
  }

  const directUnits = Math.min(needed, Math.max(directAvailable, 0));
  const shortfall = needed - directUnits;

  if (shortfall <= 0) {
    return {
      directUnits: needed,
      substituteUnits: 0,
      sourceProduct,
      needsSubstitution: false,
    };
  }

  return {
    directUnits,
    substituteUnits: shortfall * menuProduct.fulfillMultiplier,
    sourceProduct,
    needsSubstitution: true,
  };
}
