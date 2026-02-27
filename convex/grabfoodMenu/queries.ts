import { query, internalQuery } from "../_generated/server";
import { requireRole } from "../lib/auth";

// ============================================
// GrabFood Menu Simulator - Queries
// ============================================

/**
 * List all grabfoodMenuItems joined with menuProduct info.
 * Resolves photo storage URLs. Sorted by sequence.
 */
export const listMenuItems = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query("grabfoodMenuItems")
      .withIndex("by_sequence")
      .collect();

    const results = [];
    for (const item of items) {
      // Resolve photo URL from Convex storage
      let resolvedPhotoUrl: string | null = null;
      if (item.photoStorageId) {
        resolvedPhotoUrl = await ctx.storage.getUrl(item.photoStorageId);
      }

      // Join with menuProduct
      const menuProduct = await ctx.db.get(item.menuProductId);

      results.push({
        ...item,
        resolvedPhotoUrl,
        menuProduct: menuProduct
          ? {
              name: menuProduct.name,
              code: menuProduct.code,
              defaultPrice: menuProduct.defaultPrice,
            }
          : null,
      });
    }

    return results;
  },
});

/**
 * Get recent sync status for GrabFood menu operations.
 * Returns latest 5 menu-related sync log entries.
 */
export const getSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const logs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "grabfood"))
      .order("desc")
      .take(20);

    // Filter for menu-related entries
    const menuLogs = logs.filter(
      (log) =>
        log.triggeredBy?.includes("menu") ||
        log.triggeredBy?.includes("push-menu")
    );

    return menuLogs.slice(0, 5);
  },
});

/**
 * Internal version of listMenuItems for webhook handler use.
 * No auth check required.
 */
export const listMenuItemsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query("grabfoodMenuItems")
      .withIndex("by_sequence")
      .collect();

    const results = [];
    for (const item of items) {
      let resolvedPhotoUrl: string | null = null;
      if (item.photoStorageId) {
        resolvedPhotoUrl = await ctx.storage.getUrl(item.photoStorageId);
      }

      const menuProduct = await ctx.db.get(item.menuProductId);

      results.push({
        ...item,
        resolvedPhotoUrl,
        menuProduct: menuProduct
          ? {
              name: menuProduct.name,
              code: menuProduct.code,
              defaultPrice: menuProduct.defaultPrice,
            }
          : null,
      });
    }

    return results;
  },
});
