import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Increment usage count for a shipping agency.
 * PRD-7: Called when an order's shipping agency is set.
 * Creates the record if it doesn't exist.
 */
export const incrementAgencyUsage = mutation({
  args: {
    agency: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if record exists
    const existing = await ctx.db
      .query("shippingAgencyUsage")
      .withIndex("by_agency", (q) => q.eq("agency", args.agency))
      .first();

    if (existing) {
      // Increment existing record
      await ctx.db.patch(existing._id, {
        usageCount: existing.usageCount + 1,
      });
      return existing._id;
    } else {
      // Create new record with count of 1
      return await ctx.db.insert("shippingAgencyUsage", {
        agency: args.agency,
        usageCount: 1,
      });
    }
  },
});

/**
 * Decrement usage count for a shipping agency.
 * PRD-7: Called when an order's shipping agency is changed (decrement old, increment new).
 * Does not delete the record, just decrements to 0.
 */
export const decrementAgencyUsage = mutation({
  args: {
    agency: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("shippingAgencyUsage")
      .withIndex("by_agency", (q) => q.eq("agency", args.agency))
      .first();

    if (existing && existing.usageCount > 0) {
      await ctx.db.patch(existing._id, {
        usageCount: existing.usageCount - 1,
      });
      return existing._id;
    }

    return null;
  },
});

/**
 * Seed initial shipping agency usage data from existing orders.
 * PRD-7: Run once from Convex dashboard to populate usage counts.
 */
export const seedFromExistingOrders = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all orders with shipping agencies
    const orders = await ctx.db.query("orders").collect();

    // Count agency usage
    const agencyCounts = new Map<string, number>();
    for (const order of orders) {
      if (order.shippingAgency) {
        const current = agencyCounts.get(order.shippingAgency) || 0;
        agencyCounts.set(order.shippingAgency, current + 1);
      }
    }

    // Clear existing usage records
    const existingRecords = await ctx.db.query("shippingAgencyUsage").collect();
    for (const record of existingRecords) {
      await ctx.db.delete(record._id);
    }

    // Create new usage records
    const results: { agency: string; count: number }[] = [];
    for (const [agency, count] of agencyCounts) {
      await ctx.db.insert("shippingAgencyUsage", {
        agency,
        usageCount: count,
      });
      results.push({ agency, count });
    }

    return {
      message: `Seeded ${results.length} shipping agency usage records`,
      agencies: results,
    };
  },
});
