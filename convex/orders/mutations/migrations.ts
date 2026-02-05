/**
 * Migration mutations
 * Database backfills and data migrations
 */
import { mutation } from "../../_generated/server";
import { v } from "convex/values";

// ============================================
// Constants
// ============================================

// Channel code mapping: old short codes -> new full names
const CHANNEL_MIGRATION_MAP: Record<string, string> = {
  "WA": "whatsapp",
  "IG": "instagram",
  "SHP": "shopee",
  "TT": "tiktok",
  "TKP": "tokopedia",
  "GRB": "grabfood",
  "K3M": "k3mart_gf",
  "LTT": "legato_tamtem",
  "LGF": "legato_goldfinch",
  "BZR": "bazaar",
  "OTH": "other",
};

// ============================================
// Mutations
// ============================================

/**
 * Backfill orderItemProduction records from existing orderItems.
 * PRD-5: Migration - Wave 6.
 *
 * Run from Convex dashboard Functions tab: orders:backfillOrderItemProduction
 *
 * This creates orderItemProduction records for all existing orders that have
 * production data (productionType and productionUnits) on their items.
 */
export const backfillOrderItemProduction = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;

    // Get production unit types
    const bigBall = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", "BIG_BALL"))
      .first();

    const midBall = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", "MID_BALL"))
      .first();

    if (!bigBall || !midBall) {
      throw new Error("Production unit types not found. Run productionUnitTypes:seedDefaults first.");
    }

    // Get all orderItems with production data that don't have production records yet
    const allOrderItems = await ctx.db.query("orderItems").collect();

    // Filter to items with production data
    const itemsWithProduction = allOrderItems.filter(
      (item) => item.productionType && item.productionUnits
    );

    // Check which items already have production records
    const itemsToProcess = [];
    for (const item of itemsWithProduction.slice(0, batchSize)) {
      const existingRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .first();

      if (!existingRecords) {
        itemsToProcess.push(item);
      }
    }

    // Create production records for items that need them
    const results = {
      processed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const item of itemsToProcess) {
      try {
        // Determine which production unit type to use
        const unitType = item.productionType === "original" ? bigBall : midBall;
        const unitCode = item.productionType === "original" ? "BIG_BALL" : "MID_BALL";
        const unitName = item.productionType === "original" ? "Big Ball" : "Mid Ball";

        // Calculate units based on productionUnits * quantity
        const unitsRequired = (item.productionUnits ?? 0) * item.quantity;

        // Preserve existing progress from NEW system (ballsFilled)
        const unitsCompleted = item.ballsFilled ?? 0;
        const unitsRemaining = Math.max(0, unitsRequired - unitsCompleted);

        await ctx.db.insert("orderItemProduction", {
          orderItemId: item._id,
          productionUnitTypeId: unitType._id,
          productionUnitCode: unitCode,
          productionUnitName: unitName,
          unitsRequired,
          unitsCompleted,
          unitsRemaining,
        });

        results.processed++;
      } catch (error) {
        results.errors.push(`Item ${item._id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    results.skipped = itemsWithProduction.length - itemsToProcess.length - results.errors.length;

    return {
      ...results,
      totalItemsWithProduction: itemsWithProduction.length,
      remainingToProcess: itemsWithProduction.length - results.processed - results.skipped,
      message: results.processed > 0
        ? `Processed ${results.processed} items. Run again if there are more to process.`
        : "No items need processing.",
    };
  },
});

/**
 * Migrate old channel codes to new channel values.
 * Run from Convex dashboard Functions tab: orders:migrateChannelCodes
 *
 * Converts old short codes (WA, IG, etc.) to new full names (whatsapp, instagram, etc.)
 */
export const migrateChannelCodes = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    // Get all orders
    const allOrders = await ctx.db.query("orders").collect();

    const results = {
      total: allOrders.length,
      migrated: 0,
      alreadyValid: 0,
      nullOrEmpty: 0,
      updates: [] as { orderId: string; orderNumber: string; from: string; to: string }[],
    };

    // Valid new channel values
    const validChannels = new Set([
      "whatsapp", "instagram", "shopee", "tiktok", "tokopedia",
      "grabfood", "k3mart_gf", "legato_tamtem", "legato_goldfinch",
      "bazaar", "other"
    ]);

    for (const order of allOrders) {
      const channel = order.channel;

      // Skip null/undefined channels
      if (!channel) {
        results.nullOrEmpty++;
        continue;
      }

      // Skip already valid channels
      if (validChannels.has(channel)) {
        results.alreadyValid++;
        continue;
      }

      // Check if it's an old code that needs migration
      const newChannel = CHANNEL_MIGRATION_MAP[channel];
      if (newChannel) {
        results.updates.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          from: channel,
          to: newChannel,
        });

        if (!dryRun) {
          await ctx.db.patch(order._id, {
            channel: newChannel as "whatsapp" | "instagram" | "shopee" | "tiktok" | "tokopedia" | "grabfood" | "k3mart_gf" | "legato_tamtem" | "legato_goldfinch" | "bazaar" | "other",
          });
        }

        results.migrated++;
      }
    }

    return {
      ...results,
      dryRun,
      message: dryRun
        ? `Dry run: Would migrate ${results.migrated} orders. Run again with dryRun: false to apply.`
        : `Migrated ${results.migrated} orders from old channel codes to new values.`,
    };
  },
});

/**
 * Backfill production records for order items missing them.
 * Run from Convex dashboard Functions tab: orders:backfillProductionRecords
 *
 * Creates orderItemProduction records for items that have productionType but no production records.
 * Uses the item's productionType to determine the ball type (original -> BIG_BALL, bite_sized -> MID_BALL).
 */
export const backfillProductionRecords = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    // Get all order items with production type
    const allItems = await ctx.db.query("orderItems").collect();
    const itemsWithProductionType = allItems.filter(item => item.productionType);

    // Get production unit types
    const productionUnitTypes = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const bigBallType = productionUnitTypes.find(t => t.code === "BIG_BALL");
    const midBallType = productionUnitTypes.find(t => t.code === "MID_BALL");

    if (!bigBallType || !midBallType) {
      return {
        success: false,
        error: "Missing production unit types (BIG_BALL or MID_BALL). Please seed them first.",
      };
    }

    const results = {
      total: itemsWithProductionType.length,
      created: 0,
      skipped: 0,
      details: [] as { itemId: string; productionType: string; quantity: number; action: string }[],
    };

    for (const item of itemsWithProductionType) {
      // Check if production records already exist
      const existingRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();

      if (existingRecords.length > 0) {
        results.skipped++;
        results.details.push({
          itemId: item._id,
          productionType: item.productionType!,
          quantity: item.quantity,
          action: "skipped (already has records)",
        });
        continue;
      }

      // Determine ball type from productionType
      const unitType = item.productionType === "original" ? bigBallType : midBallType;
      const unitsRequired = item.quantity;

      if (!dryRun) {
        await ctx.db.insert("orderItemProduction", {
          orderItemId: item._id,
          productionUnitTypeId: unitType._id,
          productionUnitCode: unitType.code,
          productionUnitName: unitType.name,
          unitsRequired,
          unitsCompleted: item.ballsFilled ?? 0, // Preserve existing progress
          unitsRemaining: Math.max(0, unitsRequired - (item.ballsFilled ?? 0)),
        });
      }

      results.created++;
      results.details.push({
        itemId: item._id,
        productionType: item.productionType!,
        quantity: item.quantity,
        action: dryRun ? "would create" : "created",
      });
    }

    return {
      ...results,
      dryRun,
      message: dryRun
        ? `Dry run: Would create ${results.created} production records. Run again with dryRun: false to apply.`
        : `Created ${results.created} production records (${results.skipped} already had records).`,
    };
  },
});

/**
 * Migrate existing "Packaging" status to "Boxed" status.
 * Run from Convex dashboard Functions tab: orders:migratePackagingToBoxed
 *
 * PRD-Kitchen-Workflow: Wave 5 - New status flow (InProduction -> Boxed -> Labeled -> WaitingShipment)
 * This migrates orders stuck in old "Packaging" status to the new "Boxed" status.
 */
export const migratePackagingToBoxed = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    // Get all orders with "Packaging" status
    const packagingOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Packaging"))
      .collect();

    const results = {
      total: packagingOrders.length,
      migrated: 0,
      details: [] as { orderId: string; orderNumber: string; action: string }[],
    };

    for (const order of packagingOrders) {
      if (!dryRun) {
        await ctx.db.patch(order._id, { status: "Boxed" });
      }

      results.migrated++;
      results.details.push({
        orderId: order._id,
        orderNumber: order.orderNumber,
        action: dryRun ? "would migrate Packaging -> Boxed" : "migrated Packaging -> Boxed",
      });
    }

    return {
      ...results,
      dryRun,
      message: dryRun
        ? `Dry run: Would migrate ${results.migrated} orders from Packaging to Boxed. Run again with dryRun: false to apply.`
        : `Migrated ${results.migrated} orders from Packaging to Boxed status.`,
    };
  },
});
