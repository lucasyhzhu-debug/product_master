/**
 * Production Log Aggregation Helpers
 *
 * Shared logic for aggregating productionLog entries into production counts.
 * Used by productionLog/queries.ts and any other queries that need
 * aggregated production data (k3martCockpit, kitchenQueries, etc.).
 *
 * Replaces reads from the productionCounts table with log-based aggregation.
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/** Context type that supports both queries and mutations */
type ReadableCtx = QueryCtx | MutationCtx;

/**
 * Shape returned by aggregation — matches the old productionCounts.queries.getAll shape.
 */
export interface AggregatedProductionCounts {
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  menuProductCode: string | undefined;
  posSlot: number | undefined;
  productType: string | undefined;
  ballType: "big" | "mid";
  ballCount: number;
  boxed: number;
  stickered: number;
  packed: number;
  shippedToGoldfinch: number;
  availableForStickering: number;
  availableForPacking: number;
  lastResetAt: number | undefined;
  lastResetBy: string | undefined;
}

/**
 * Shape for single-product aggregation — matches old productionCounts.queries.getByMenuProduct shape.
 */
export interface SingleProductCounts {
  menuProductId: Id<"menuProducts">;
  boxed: number;
  stickered: number;
  packed: number;
  shippedToGoldfinch: number;
  availableForStickering: number;
  availableForPacking: number;
  lastResetAt: number | undefined;
  lastResetBy: string | undefined;
}

/**
 * Aggregate productionLog entries for a single menu product,
 * respecting the productionResets timestamp.
 */
export async function aggregateForProduct(
  ctx: ReadableCtx,
  menuProductId: Id<"menuProducts">,
  resetRecord: Doc<"productionResets"> | null
): Promise<{
  boxed: number;
  stickered: number;
  packed: number;
  shippedToGoldfinch: number;
}> {
  const lastResetAt = resetRecord?.lastResetAt ?? 0;

  // Fetch all log entries for this product after reset (IRB-04: compound index)
  const entries = await ctx.db
    .query("productionLog")
    .withIndex("by_menu_product_timestamp", (q) =>
      q.eq("menuProductId", menuProductId).gt("timestamp", lastResetAt)
    )
    .collect();

  // Aggregate counts
  let boxed = 0;
  let stickered = 0;
  let packed = 0;
  let shippedToGoldfinch = 0;

  for (const entry of entries) {
    switch (entry.action) {
      case "box":
        boxed += entry.quantity;
        break;
      case "unbox":
        boxed -= entry.quantity;
        break;
      case "sticker":
        stickered += entry.quantity;
        break;
      case "unsticker":
        stickered -= entry.quantity;
        break;
      case "pack":
        packed += entry.quantity;
        break;
      case "unpack":
        packed -= entry.quantity;
        break;
      case "ship_goldfinch":
        shippedToGoldfinch += entry.quantity;
        break;
      case "return_goldfinch":
        // Items returned from Goldfinch become available for stickering again
        stickered += entry.quantity;
        break;
    }
  }

  return { boxed, stickered, packed, shippedToGoldfinch };
}

/**
 * Build ball info map from BOM (menuProductComponents + componentTypes).
 * Returns a Map of menuProductId -> { ballType, ballCount }.
 */
export async function buildBallInfoMap(
  ctx: QueryCtx
): Promise<Map<string, { ballType: "big" | "mid"; ballCount: number }>> {
  const allComponents = await ctx.db.query("menuProductComponents").collect();

  // Pre-fetch unique component types
  const componentTypeIds = [
    ...new Set(allComponents.map((c) => c.componentTypeId)),
  ];
  const componentTypeMap = new Map<
    string,
    { code?: string; category?: string }
  >();
  for (const id of componentTypeIds) {
    const ct = await ctx.db.get(id);
    if (ct) componentTypeMap.set(id as unknown as string, ct);
  }

  // Build ball info per menu product from BOM
  const ballInfoMap = new Map<
    string,
    { ballType: "big" | "mid"; ballCount: number }
  >();
  for (const comp of allComponents) {
    const ct = componentTypeMap.get(
      comp.componentTypeId as unknown as string
    );
    if (!ct || ct.category !== "production") continue;

    let ballType: "big" | "mid" | null = null;
    if (ct.code === "BIG_BALL") ballType = "big";
    else if (ct.code === "MID_BALL") ballType = "mid";
    else continue;

    const mpId = comp.menuProductId as unknown as string;
    const existing = ballInfoMap.get(mpId);
    if (existing) {
      existing.ballCount += comp.quantity;
    } else {
      ballInfoMap.set(mpId, { ballType, ballCount: comp.quantity });
    }
  }

  return ballInfoMap;
}

/**
 * Fetch all productionResets as a Map of menuProductId -> reset record.
 */
export async function getResetsMap(
  ctx: QueryCtx
): Promise<Map<string, Doc<"productionResets">>> {
  const resets = await ctx.db.query("productionResets").collect();
  return new Map(
    resets.map((r) => [r.menuProductId as unknown as string, r])
  );
}
