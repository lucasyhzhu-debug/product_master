/**
 * Product Inventory Queries
 *
 * Stock overview, transaction log (paginated), low-stock alerts,
 * settings access, and per-order availability checking.
 */

import { query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

/**
 * Get all product inventory rows with joined menuProduct + location data.
 * Includes isLowStock flag based on per-row or global threshold.
 * Optionally filter by locationId.
 */
export const getStockOverview = query({
  args: {
    locationId: v.optional(v.id("storageLocations")),
  },
  handler: async (ctx, args) => {
    // Load global threshold from settings (default 5 if not initialized)
    const settings = await ctx.db.query("productInventorySettings").first();
    const globalThreshold = settings?.globalLowStockThreshold || 5;

    // Load inventory rows (optionally filtered by location)
    let rows;
    if (args.locationId) {
      rows = await ctx.db
        .query("productInventory")
        .withIndex("by_location", (q) => q.eq("locationId", args.locationId!))
        .collect();
    } else {
      rows = await ctx.db.query("productInventory").collect();
    }

    // Join menuProduct and location data
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const menuProduct = await ctx.db.get(row.menuProductId);
        const location = await ctx.db.get(row.locationId);

        const effectiveThreshold = row.lowStockThreshold ?? globalThreshold;
        const isLowStock = row.quantity <= effectiveThreshold;

        return {
          _id: row._id,
          menuProduct: menuProduct
            ? {
                _id: menuProduct._id,
                name: menuProduct.name,
                code: menuProduct.code,
                posSlot: menuProduct.posSlot,
                isActive: menuProduct.isActive,
                defaultPrice: menuProduct.defaultPrice,
              }
            : null,
          location: location
            ? {
                _id: location._id,
                name: location.name,
                locationType: location.locationType,
              }
            : null,
          quantity: row.quantity,
          lowStockThreshold: row.lowStockThreshold,
          effectiveThreshold,
          isLowStock,
          lastUpdated: row.lastUpdated,
        };
      })
    );

    // Sort by menuProduct name alphabetically
    return enriched.sort((a, b) => {
      const nameA = a.menuProduct?.name ?? "";
      const nameB = b.menuProduct?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  },
});

/**
 * Get transaction log with pagination.
 * Optionally filter by menuProductId, locationId, or transactionType.
 * Returns most recent first.
 */
export const getTransactions = query({
  args: {
    menuProductId: v.optional(v.id("menuProducts")),
    locationId: v.optional(v.id("storageLocations")),
    transactionType: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Build the base query — use index based on available filters
    let paginatedResult;

    if (args.locationId) {
      // Filter by location using by_location index
      const baseQuery = ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_location", (q) => q.eq("locationId", args.locationId!))
        .order("desc");

      if (args.menuProductId || args.transactionType) {
        // Apply additional filters post-index
        paginatedResult = await baseQuery
          .filter((q) => {
            const conditions = [];
            if (args.menuProductId) {
              conditions.push(q.eq(q.field("menuProductId"), args.menuProductId!));
            }
            if (args.transactionType) {
              conditions.push(q.eq(q.field("transactionType"), args.transactionType));
            }
            return conditions.length === 1
              ? conditions[0]
              : conditions.reduce((acc, cond) => q.and(acc, cond));
          })
          .paginate(args.paginationOpts);
      } else {
        paginatedResult = await baseQuery.paginate(args.paginationOpts);
      }
    } else if (args.menuProductId) {
      // Filter by product using by_menu_product index
      const baseQuery = ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", args.menuProductId!)
        )
        .order("desc");

      if (args.transactionType) {
        paginatedResult = await baseQuery
          .filter((q) => q.eq(q.field("transactionType"), args.transactionType))
          .paginate(args.paginationOpts);
      } else {
        paginatedResult = await baseQuery.paginate(args.paginationOpts);
      }
    } else if (args.transactionType) {
      // Filter by type
      paginatedResult = await ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_type", (q) => q.eq("transactionType", args.transactionType as "add" | "drawdown" | "gofood_sale" | "adjust"))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      // No filters — full log descending by createdAt
      paginatedResult = await ctx.db
        .query("productInventoryTransactions")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    // Enrich with menuProduct name and location name
    const enrichedPage = await Promise.all(
      paginatedResult.page.map(async (tx) => {
        const menuProduct = await ctx.db.get(tx.menuProductId);
        const location = await ctx.db.get(tx.locationId);
        return {
          ...tx,
          menuProductName: menuProduct?.name,
          locationName: location?.name,
        };
      })
    );

    return {
      ...paginatedResult,
      page: enrichedPage,
    };
  },
});

/**
 * Get all product-location pairs below low-stock threshold.
 * Returns only rows where isLowStock is true.
 */
export const getLowStockAlerts = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("productInventorySettings").first();
    const globalThreshold = settings?.globalLowStockThreshold || 5;

    const rows = await ctx.db.query("productInventory").collect();

    const lowStockRows = rows.filter((row) => {
      const effectiveThreshold = row.lowStockThreshold ?? globalThreshold;
      return row.quantity <= effectiveThreshold;
    });

    const enriched = await Promise.all(
      lowStockRows.map(async (row) => {
        const menuProduct = await ctx.db.get(row.menuProductId);
        const location = await ctx.db.get(row.locationId);
        const effectiveThreshold = row.lowStockThreshold ?? globalThreshold;

        return {
          _id: row._id,
          menuProductName: menuProduct?.name,
          menuProductCode: menuProduct?.code,
          locationName: location?.name,
          quantity: row.quantity,
          effectiveThreshold,
          lastUpdated: row.lastUpdated,
        };
      })
    );

    // Sort: most critical (lowest stock) first
    return enriched.sort((a, b) => a.quantity - b.quantity);
  },
});

/**
 * Get productInventorySettings row (or null if not initialized).
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("productInventorySettings").first() ?? null;
  },
});

/**
 * Get stock availability for each item in an order at a given location.
 * Powers the drawdown UI showing what's available before confirming.
 */
export const getStockForOrder = query({
  args: {
    orderId: v.id("orders"),
    locationId: v.id("storageLocations"),
  },
  handler: async (ctx, args) => {
    // Load order items
    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .filter((q) => q.neq(q.field("isCancelled"), true))
      .collect();

    // For each order item with a menuProductId, check stock at location
    const availability = await Promise.all(
      orderItems
        .filter((item) => item.menuProductId !== undefined)
        .map(async (item) => {
          const menuProduct = await ctx.db.get(item.menuProductId!);

          const stockRow = await ctx.db
            .query("productInventory")
            .withIndex("by_product_location", (q) =>
              q
                .eq("menuProductId", item.menuProductId!)
                .eq("locationId", args.locationId)
            )
            .first();

          const quantityAvailable = stockRow?.quantity ?? 0;
          const quantityNeeded = item.quantity;
          const isSufficient = quantityAvailable >= quantityNeeded;

          return {
            orderItemId: item._id,
            menuProductId: item.menuProductId!,
            productName: menuProduct?.name ?? item.productName,
            quantityNeeded,
            quantityAvailable,
            isSufficient,
          };
        })
    );

    return availability;
  },
});
