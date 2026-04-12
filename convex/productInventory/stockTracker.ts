/**
 * Stock tracker — shared helper for substitution-aware deductions.
 *
 * Tracks running quantities across multiple items/mutations so that items
 * sharing the same (menuProductId, locationId) aggregate correctly rather
 * than each reading pre-batch values.
 *
 * Used by:
 * - productInventory/mutations.ts > fulfillFromInventory (single location)
 * - productInventory/mutations.ts > processGofoodSales (multi-location)
 */

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export interface StockEntry {
  row: Doc<"productInventory"> | null;
  runningQty: number;
  /** Captured on first load so we can write only if changed. */
  menuProductId: Id<"menuProducts">;
  locationId: Id<"storageLocations">;
}

export type StockTracker = ReturnType<typeof createStockTracker>;

export function createStockTracker(ctx: MutationCtx) {
  const entries = new Map<string, StockEntry>();

  const getStock = async (
    menuProductId: Id<"menuProducts">,
    locationId: Id<"storageLocations">
  ): Promise<StockEntry> => {
    const key = `${menuProductId}|${locationId}`;
    const cached = entries.get(key);
    if (cached) return cached;
    const row = await ctx.db
      .query("productInventory")
      .withIndex("by_product_location", (q) =>
        q.eq("menuProductId", menuProductId).eq("locationId", locationId)
      )
      .first();
    const entry: StockEntry = {
      row,
      runningQty: row?.quantity ?? 0,
      menuProductId,
      locationId,
    };
    entries.set(key, entry);
    return entry;
  };

  /** Write final runningQty values back to DB. Skips entries whose qty is unchanged. */
  const flush = async (now: number): Promise<void> => {
    for (const entry of entries.values()) {
      const originalQty = entry.row?.quantity ?? 0;
      if (entry.runningQty === originalQty) continue;

      if (entry.row) {
        await ctx.db.patch(entry.row._id, { quantity: entry.runningQty, lastUpdated: now });
      } else {
        await ctx.db.insert("productInventory", {
          menuProductId: entry.menuProductId,
          locationId: entry.locationId,
          quantity: entry.runningQty,
          lastUpdated: now,
        });
      }
    }
  };

  /** Iterate all loaded entries (for callers needing to seed their own write trackers). */
  const values = () => entries.values();

  return { getStock, flush, values };
}
