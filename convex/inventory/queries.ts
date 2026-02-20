/**
 * Inventory Queries
 *
 * Stock queries for dashboards, alerts, and inventory views.
 */

import { query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

/**
 * Get low stock alerts
 *
 * Returns components where available stock < reorderPoint OR below alarmPercentage.
 * Available = totalStock - totalReserved
 *
 * Alert fires if EITHER threshold is breached:
 * - Units threshold: available < reorderPoint
 * - Percentage threshold: (available / lastRestockTotalStock) < alarmPercentage
 */
export const getLowStockAlerts = query({
  args: {},
  handler: async (ctx) => {
    // Get all component stock records
    const allStock = await ctx.db.query("componentStock").collect();

    const alerts = [];

    for (const stock of allStock) {
      const component = await ctx.db.get(stock.componentTypeId);
      const location = await ctx.db.get(stock.locationId);

      if (!component || !location) continue;

      // Skip if component doesn't track inventory
      if (!component.trackInventory) continue;

      const available = stock.totalStock - stock.totalReserved;

      // Check units threshold
      const unitsBreached = component.reorderPoint != null && available < component.reorderPoint;

      // Check percentage threshold
      let percentRemaining: number | undefined = undefined;
      let percentageBreached = false;

      if (
        component.alarmPercentage != null &&
        stock.lastRestockTotalStock != null &&
        stock.lastRestockTotalStock > 0
      ) {
        percentRemaining = (available / stock.lastRestockTotalStock) * 100;
        percentageBreached = percentRemaining < component.alarmPercentage;
      }

      // Alert if either threshold breached
      if (unitsBreached || percentageBreached) {
        let alarmType: "units" | "percentage" | "both";
        if (unitsBreached && percentageBreached) {
          alarmType = "both";
        } else if (unitsBreached) {
          alarmType = "units";
        } else {
          alarmType = "percentage";
        }

        const isIngredient = component.category === "production" && component.trackInventory;

        alerts.push({
          component,
          location,
          stock,
          available,
          reorderPoint: component.reorderPoint,
          shortage: component.reorderPoint ? component.reorderPoint - available : undefined,
          alarmType,
          percentRemaining,
          alarmPercentage: component.alarmPercentage,
          isIngredient,
        });
      }
    }

    // Sort by shortage percentage (most critical first)
    alerts.sort((a, b) => {
      // Prioritize by percentage if available
      if (a.percentRemaining != null && b.percentRemaining != null) {
        return a.percentRemaining - b.percentRemaining;
      }
      // Fall back to units-based percentage
      if (a.reorderPoint && b.reorderPoint) {
        const aPercent = a.available / a.reorderPoint;
        const bPercent = b.available / b.reorderPoint;
        return aPercent - bPercent;
      }
      return 0;
    });

    return alerts;
  },
});

/**
 * Get component inventory (all locations)
 *
 * Returns stock levels for a component across all locations,
 * plus recent transactions.
 */
export const getComponentInventory = query({
  args: {
    componentTypeId: v.id("componentTypes"),
    includeTransactions: v.optional(v.boolean()),
    transactionLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.componentTypeId);
    if (!component) return null;

    // Get stock at each location
    const stockRecords = await ctx.db
      .query("componentStock")
      .withIndex("by_component", (q) => q.eq("componentTypeId", args.componentTypeId))
      .collect();

    // Enrich with location details
    const stockByLocation = await Promise.all(
      stockRecords.map(async (stock) => {
        const location = await ctx.db.get(stock.locationId);
        const available = stock.totalStock - stock.totalReserved;

        return {
          ...stock,
          location,
          available,
          isLowStock: component.reorderPoint
            ? available < component.reorderPoint
            : false,
        };
      })
    );

    // Get recent transactions if requested
    let transactions = undefined;
    if (args.includeTransactions) {
      const limit = args.transactionLimit ?? 50;
      transactions = await ctx.db
        .query("componentTransactions")
        .withIndex("by_component", (q) =>
          q.eq("componentTypeId", args.componentTypeId)
        )
        .order("desc")
        .take(limit);

      // Enrich with location names
      transactions = await Promise.all(
        transactions.map(async (tx) => {
          const location = await ctx.db.get(tx.locationId);
          return {
            ...tx,
            locationName: location?.name,
          };
        })
      );
    }

    return {
      component,
      stockByLocation,
      transactions,
    };
  },
});

/**
 * Get location inventory (all components at location)
 *
 * Returns all components with stock at a specific location.
 */
export const getLocationInventory = query({
  args: {
    locationId: v.id("storageLocations"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.locationId);
    if (!location) return null;

    // Get all stock at this location
    const stockRecords = await ctx.db
      .query("componentStock")
      .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
      .collect();

    // Enrich with component details
    let inventory = await Promise.all(
      stockRecords.map(async (stock) => {
        const component = await ctx.db.get(stock.componentTypeId);
        if (!component) return null;

        const available = stock.totalStock - stock.totalReserved;
        const isIngredient = component.category === "production" && component.trackInventory;

        return {
          ...stock,
          component,
          available,
          isLowStock: component.reorderPoint
            ? available < component.reorderPoint
            : false,
          isIngredient,
        };
      })
    );

    // Filter nulls and optionally inactive
    const filteredInventory = inventory.filter((item): item is NonNullable<typeof item> => {
      if (!item) return false;
      if (args.activeOnly && !item.component.isActive) return false;
      return true;
    });

    // Sort by component name
    filteredInventory.sort((a, b) => a.component.name.localeCompare(b.component.name));

    return {
      location,
      inventory: filteredInventory,
    };
  },
});

/**
 * Get inventory report (full matrix: components × locations)
 *
 * Returns a complete inventory matrix for reporting.
 */
export const getInventoryReport = query({
  args: {
    activeComponentsOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Fetch production components (all of them, regardless of trackInventory)
    // so that production BOM rows (balls + ingredient-tracked) always appear.
    const productionComponents = await ctx.db
      .query("componentTypes")
      .withIndex("by_category", (q) => q.eq("category", "production"))
      .collect();

    // Fetch packaging components that track inventory (unchanged behaviour)
    const allTrackedComponents = await ctx.db
      .query("componentTypes")
      .withIndex("by_track_inventory", (q) => q.eq("trackInventory", true))
      .collect();
    // Exclude production category to avoid duplicates with productionComponents
    const packagingTracked = allTrackedComponents.filter(
      (c) => c.category !== "production"
    );

    let components = [...productionComponents, ...packagingTracked];

    if (args.activeComponentsOnly) {
      components = components.filter((c) => c.isActive);
    }

    // Get all locations
    const locations = await ctx.db
      .query("storageLocations")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Build matrix
    const matrix = await Promise.all(
      components.map(async (component) => {
        const stockByLocation = await Promise.all(
          locations.map(async (location) => {
            const stock = await ctx.db
              .query("componentStock")
              .withIndex("by_component_location", (q) =>
                q.eq("componentTypeId", component._id).eq("locationId", location._id)
              )
              .first();

            const available = stock
              ? stock.totalStock - stock.totalReserved
              : 0;

            return {
              locationId: location._id,
              locationName: location.name,
              totalStock: stock?.totalStock ?? 0,
              totalReserved: stock?.totalReserved ?? 0,
              available,
              weightedUnitCostIdr: stock?.weightedUnitCostIdr ?? 0,
              latestSupplierName: stock?.latestSupplierName,
              latestPurchaseUrl: stock?.latestPurchaseUrl,
              latestUnitCostIdr: stock?.latestUnitCostIdr,
              lastRestockTotalStock: stock?.lastRestockTotalStock,
            };
          })
        );

        // Calculate totals across all locations
        const totalAcrossLocations = stockByLocation.reduce(
          (sum, loc) => sum + loc.totalStock,
          0
        );
        const totalReservedAcrossLocations = stockByLocation.reduce(
          (sum, loc) => sum + loc.totalReserved,
          0
        );
        const totalAvailable =
          totalAcrossLocations - totalReservedAcrossLocations;

        // Check if this component is ingredient-linked (Phase 20)
        const isIngredient = component.category === "production" && component.trackInventory;

        return {
          component,
          stockByLocation,
          totalAcrossLocations,
          totalReservedAcrossLocations,
          totalAvailable,
          isLowStock: component.reorderPoint
            ? totalAvailable < component.reorderPoint
            : false,
          isIngredient,
        };
      })
    );

    return {
      components,
      locations,
      matrix,
    };
  },
});

/**
 * Get inventory batches for a component at a location
 *
 * Returns all batches ordered by purchase date (FIFO).
 */
export const getComponentBatches = query({
  args: {
    componentTypeId: v.id("componentTypes"),
    locationId: v.id("storageLocations"),
    includeExpired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.componentTypeId);
    const location = await ctx.db.get(args.locationId);

    if (!component || !location) return null;

    // Get batches ordered by purchase date (FIFO)
    let batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_fifo", (q) =>
        q.eq("componentTypeId", args.componentTypeId).eq("locationId", args.locationId)
      )
      .collect();

    // Filter expired if not included
    if (!args.includeExpired) {
      batches = batches.filter((b) => b.status !== "expired");
    }

    // Add available quantity to each batch
    const batchesWithAvailable = batches.map((batch) => ({
      ...batch,
      available: batch.quantityRemaining - batch.quantityReserved,
    }));

    return {
      component,
      location,
      batches: batchesWithAvailable,
    };
  },
});

/**
 * Get recent transactions for a location
 *
 * Returns recent inventory movements at a location.
 */
export const getLocationTransactions = query({
  args: {
    locationId: v.id("storageLocations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.locationId);
    if (!location) return null;

    const limit = args.limit ?? 100;

    const transactions = await ctx.db
      .query("componentTransactions")
      .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
      .order("desc")
      .take(limit);

    // Enrich with component names
    const enrichedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        const component = await ctx.db.get(tx.componentTypeId);
        return {
          ...tx,
          componentName: component?.name,
          componentCode: component?.code,
        };
      })
    );

    return {
      location,
      transactions: enrichedTransactions,
    };
  },
});

/**
 * Get recent transactions for a location with cursor-based pagination.
 * Uses Convex paginate() for efficient incremental loading.
 * Enriches each transaction with component name/code.
 */
export const getLocationTransactionsPaginated = query({
  args: {
    locationId: v.id("storageLocations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.locationId);
    if (!location) return null;

    const paginatedResult = await ctx.db
      .query("componentTransactions")
      .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
      .order("desc")
      .paginate(args.paginationOpts);

    // Enrich with component names
    const enrichedPage = await Promise.all(
      paginatedResult.page.map(async (tx) => {
        const component = await ctx.db.get(tx.componentTypeId);
        return {
          ...tx,
          componentName: component?.name,
          componentCode: component?.code,
        };
      })
    );

    return { location, ...paginatedResult, page: enrichedPage };
  },
});

/**
 * Get packaging stock summary for Kitchen V2 sidebar
 *
 * Returns all packaging components with stock levels across all locations,
 * aggregated for a quick overview. Used in KitchenViewV2 to replace mock data.
 */
export const getPackagingStockSummary = query({
  args: {},
  handler: async (ctx) => {
    // Get all packaging component types (those that track inventory)
    const componentTypes = await ctx.db
      .query("componentTypes")
      .withIndex("by_track_inventory", (q) => q.eq("trackInventory", true))
      .collect();

    // Filter to active packaging components only
    const packagingComponents = componentTypes.filter(
      (c) => c.isActive && c.category !== "production"
    );

    // For each component, get aggregated stock across all locations
    const summary = await Promise.all(
      packagingComponents.map(async (component) => {
        const stockRecords = await ctx.db
          .query("componentStock")
          .withIndex("by_component", (q) => q.eq("componentTypeId", component._id))
          .collect();

        const totalStock = stockRecords.reduce((sum, s) => sum + s.totalStock, 0);
        const totalReserved = stockRecords.reduce((sum, s) => sum + s.totalReserved, 0);
        const available = totalStock - totalReserved;

        const isLow = component.reorderPoint != null && available < component.reorderPoint;
        const isCritical = component.reorderPoint != null && available < component.reorderPoint * 0.5;

        return {
          name: component.name,
          available,
          reserved: totalReserved,
          reorderPoint: component.reorderPoint ?? 0,
          isLow,
          isCritical,
        };
      })
    );

    // Sort: critical first, then low, then by name
    summary.sort((a, b) => {
      if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
      if (a.isLow !== b.isLow) return a.isLow ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return summary;
  },
});

/**
 * Get latest batch for a component at a location
 *
 * Returns the most recent batch by purchase date.
 * Used for pre-filling supplier info when receiving new stock.
 */
export const getLatestBatch = query({
  args: {
    componentTypeId: v.id("componentTypes"),
    locationId: v.id("storageLocations"),
  },
  handler: async (ctx, args) => {
    // Get all batches for this component at this location
    const batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_fifo", (q) =>
        q.eq("componentTypeId", args.componentTypeId).eq("locationId", args.locationId)
      )
      .collect();

    if (batches.length === 0) {
      return null;
    }

    // Sort by purchase date descending (newest first)
    batches.sort((a, b) => b.purchaseDate - a.purchaseDate);

    return batches[0];
  },
});
