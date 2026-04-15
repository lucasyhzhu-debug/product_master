/**
 * Revenue math is derived from DENORMALIZED orderItems fields —
 * NEVER recompute `quantity * unitPrice - discountAmount` manually. Schema:
 *   lineTotal  = quantity * unitPrice - discountAmount  (post-discount, pre-fees)
 *   lineCost   = quantity * unitCost
 *   lineMargin = lineTotal - lineCost
 * If discount rules change, they change in one place (mutations), not here.
 *
 * Phase 80: input type is the structural subset { lineTotal, discountAmount? }
 * so the same helpers work for native `Doc<"orderItems">` AND the normalized
 * externalRevenueItems shape used by unit economics analytics.
 */
type RevenueLine = { lineTotal: number; discountAmount?: number };

export function itemNetRevenue(it: RevenueLine): number {
  return it.lineTotal;
}

export function itemGrossRevenue(it: RevenueLine): number {
  return it.lineTotal + (it.discountAmount ?? 0);
}

export function itemDiscount(it: RevenueLine): number {
  return it.discountAmount ?? 0;
}
