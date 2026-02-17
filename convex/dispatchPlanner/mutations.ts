import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Seed default dispatch channel configuration and planner settings.
 * Run from Convex dashboard Functions tab during initial setup.
 */
export const seedDefaults = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const now = Date.now();

    // Check if already seeded
    const existing = await ctx.db.query("dispatchChannelConfig").first();
    if (existing) {
      return { status: "already_seeded" };
    }

    // Seed channel config with default priorities
    const channels = [
      { channelKey: "direct", displayName: "Direct Sales", color: "#3B82F6", priority: 1, isBuiltIn: true, isEnabled: true },
      { channelKey: "gofood", displayName: "GoFood", color: "#22C55E", priority: 2, isBuiltIn: true, isEnabled: true },
      { channelKey: "k3mart", displayName: "K3Mart", color: "#F97316", priority: 3, isBuiltIn: true, isEnabled: true },
      { channelKey: "consignment", displayName: "Other Consignment", color: "#6B7280", priority: 4, isBuiltIn: false, isEnabled: true },
    ];

    for (const ch of channels) {
      await ctx.db.insert("dispatchChannelConfig", {
        ...ch,
        updatedBy: "system",
        updatedAt: now,
      });
    }

    // Seed planner settings with default capacity
    await ctx.db.insert("dispatchPlannerSettings", {
      dailyCapacity: 200,
      updatedBy: "system",
      updatedAt: now,
    });

    // Seed default consignment outlets (Legato Tamtem, Legato Goldfinch)
    const consignmentOutlets = [
      { name: "Legato Tamtem" },
      { name: "Legato Goldfinch" },
    ];

    for (const outlet of consignmentOutlets) {
      await ctx.db.insert("dispatchConsignmentOutlets", {
        name: outlet.name,
        channelKey: "consignment" as const,
        isEnabled: true,
        productMappings: [],
        createdBy: "system",
        createdAt: now,
        updatedBy: "system",
        updatedAt: now,
      });
    }

    return { status: "seeded", channels: channels.length, consignmentOutlets: consignmentOutlets.length };
  },
});

// ============================================
// Plan cell mutations
// ============================================

/**
 * Save (upsert) a single dispatch plan cell.
 * Finds existing by date+channel+outletId+menuProductId (or orderId for direct).
 * Auth: manager/admin.
 */
export const savePlanCell = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    channel: v.string(),
    outletId: v.optional(v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets"))),
    orderId: v.optional(v.id("orders")),
    menuProductId: v.id("menuProducts"),
    plannedQty: v.number(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    // Find existing record
    const existingPlans = await ctx.db
      .query("dispatchPlans")
      .withIndex("by_date_channel", (q) =>
        q.eq("date", args.date).eq("channel", args.channel)
      )
      .collect();

    const existing = existingPlans.find((p) => {
      if (args.channel === "direct") {
        return (
          p.orderId === args.orderId &&
          p.menuProductId === args.menuProductId
        );
      }
      // For gofood/consignment, match by outletId + menuProductId
      return (
        p.outletId === args.outletId &&
        p.menuProductId === args.menuProductId
      );
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        plannedQty: args.plannedQty,
        source: args.source ?? "manual",
        updatedBy: user.name,
        updatedAt: now,
      });
      return { status: "updated", id: existing._id };
    }

    const id = await ctx.db.insert("dispatchPlans", {
      date: args.date,
      channel: args.channel,
      outletId: args.outletId,
      orderId: args.orderId,
      menuProductId: args.menuProductId,
      plannedQty: args.plannedQty,
      source: args.source ?? "manual",
      updatedBy: user.name,
      updatedAt: now,
    });
    return { status: "inserted", id };
  },
});

// ============================================
// Channel config mutations
// ============================================

/**
 * Update a single channel config record.
 * Auth: manager/admin.
 */
export const updateChannelConfig = mutation({
  args: {
    token: v.string(),
    channelKey: v.string(),
    updates: v.object({
      priority: v.optional(v.number()),
      isEnabled: v.optional(v.boolean()),
      displayName: v.optional(v.string()),
      color: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    const config = await ctx.db
      .query("dispatchChannelConfig")
      .withIndex("by_channel", (q) => q.eq("channelKey", args.channelKey))
      .first();

    if (!config) {
      throw new Error(`Channel config not found: ${args.channelKey}`);
    }

    const patch: Record<string, unknown> = {
      updatedBy: user.name,
      updatedAt: now,
    };
    if (args.updates.priority !== undefined) patch.priority = args.updates.priority;
    if (args.updates.isEnabled !== undefined) patch.isEnabled = args.updates.isEnabled;
    if (args.updates.displayName !== undefined) patch.displayName = args.updates.displayName;
    if (args.updates.color !== undefined) patch.color = args.updates.color;

    await ctx.db.patch(config._id, patch);
    return { status: "updated" };
  },
});

/**
 * Reorder channel priorities. Receives the full ordered list of channelKeys.
 * Top = priority 1. Auth: manager/admin.
 */
export const reorderChannelPriorities = mutation({
  args: {
    token: v.string(),
    orderedKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    for (let i = 0; i < args.orderedKeys.length; i++) {
      const channelKey = args.orderedKeys[i];
      const config = await ctx.db
        .query("dispatchChannelConfig")
        .withIndex("by_channel", (q) => q.eq("channelKey", channelKey))
        .first();

      if (config) {
        await ctx.db.patch(config._id, {
          priority: i + 1,
          updatedBy: user.name,
          updatedAt: now,
        });
      }
    }

    return { status: "reordered", count: args.orderedKeys.length };
  },
});

// ============================================
// Planner settings mutation
// ============================================

/**
 * Update or insert planner settings (daily capacity).
 * Auth: manager/admin.
 */
export const updatePlannerSettings = mutation({
  args: {
    token: v.string(),
    dailyCapacity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    const existing = await ctx.db.query("dispatchPlannerSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        dailyCapacity: args.dailyCapacity,
        updatedBy: user.name,
        updatedAt: now,
      });
      return { status: "updated" };
    }

    await ctx.db.insert("dispatchPlannerSettings", {
      dailyCapacity: args.dailyCapacity,
      updatedBy: user.name,
      updatedAt: now,
    });
    return { status: "inserted" };
  },
});

// ============================================
// Consignment outlet mutations
// ============================================

/**
 * Add a new consignment outlet. Auth: admin.
 */
export const addConsignmentOutlet = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    productMappings: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        externalName: v.string(),
        externalPrice: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    const now = Date.now();

    const id = await ctx.db.insert("dispatchConsignmentOutlets", {
      name: args.name,
      channelKey: "consignment" as const,
      isEnabled: true,
      productMappings: args.productMappings,
      createdBy: user.name,
      createdAt: now,
      updatedBy: user.name,
      updatedAt: now,
    });

    return { status: "created", id };
  },
});

/**
 * Update an existing consignment outlet. Auth: admin.
 */
export const updateConsignmentOutlet = mutation({
  args: {
    token: v.string(),
    outletId: v.id("dispatchConsignmentOutlets"),
    name: v.optional(v.string()),
    productMappings: v.optional(
      v.array(
        v.object({
          menuProductId: v.id("menuProducts"),
          externalName: v.string(),
          externalPrice: v.number(),
        })
      )
    ),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    const now = Date.now();

    const outlet = await ctx.db.get(args.outletId);
    if (!outlet) {
      throw new Error("Consignment outlet not found");
    }

    const patch: Record<string, unknown> = {
      updatedBy: user.name,
      updatedAt: now,
    };
    if (args.name !== undefined) patch.name = args.name;
    if (args.productMappings !== undefined) patch.productMappings = args.productMappings;
    if (args.isEnabled !== undefined) patch.isEnabled = args.isEnabled;

    await ctx.db.patch(args.outletId, patch);
    return { status: "updated" };
  },
});

/**
 * Delete a consignment outlet and its dispatch plans. Auth: admin.
 */
export const removeConsignmentOutlet = mutation({
  args: {
    token: v.string(),
    outletId: v.id("dispatchConsignmentOutlets"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const outlet = await ctx.db.get(args.outletId);
    if (!outlet) {
      throw new Error("Consignment outlet not found");
    }

    // Delete associated dispatch plans
    // The outletId on dispatchPlans is typed as Id<"externalOutlets">, but for consignment
    // it stores the consignment outlet ID. We search by matching string.
    const allPlans = await ctx.db
      .query("dispatchPlans")
      .withIndex("by_date_channel")
      .collect();

    const consignmentPlans = allPlans.filter(
      (p) => p.channel === "consignment" && p.outletId === args.outletId
    );

    for (const plan of consignmentPlans) {
      await ctx.db.delete(plan._id);
    }

    // Delete the outlet
    await ctx.db.delete(args.outletId);

    return { status: "deleted", plansRemoved: consignmentPlans.length };
  },
});
