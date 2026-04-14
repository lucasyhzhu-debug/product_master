import type { Doc } from "../_generated/dataModel";

/**
 * Revenue math is derived from DENORMALIZED orderItems fields —
 * NEVER recompute `quantity * unitPrice - discountAmount` manually. Schema:
 *   lineTotal  = quantity * unitPrice - discountAmount  (post-discount, pre-fees)
 *   lineCost   = quantity * unitCost
 *   lineMargin = lineTotal - lineCost
 * If discount rules change, they change in one place (mutations), not here.
 */
export function itemNetRevenue(it: Doc<"orderItems">): number {
  return it.lineTotal;
}

export function itemGrossRevenue(it: Doc<"orderItems">): number {
  return it.lineTotal + (it.discountAmount ?? 0);
}

export function itemDiscount(it: Doc<"orderItems">): number {
  return it.discountAmount ?? 0;
}
