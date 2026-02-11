/**
 * K3 Mart Cockpit Mutations
 *
 * Manages weekly dispatch planning, stock movements, and outlet status.
 * Integrates with production targets and inventory systems.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { calculateKitchenDelta, getWeekNumber } from "./helpers";

/**
 * Batch upsert weekly dispatch plans.
 * For each plan: validate, check if exists, then patch or insert.
 * Auth: manager, admin
 *
 * @returns Count of upserted plans
 */
export const saveWeeklyDispatchPlan = mutation({
  args: {
    token: v.string(),
    plans: v.array(
      v.object({
        date: v.string(),
        outletId: v.id("externalOutlets"),
        menuProductId: v.id("menuProducts"),
        externalProductId: v.string(),
        suggestedQty: v.number(),
        plannedQty: v.number(),
        isStockOut: v.boolean(),
        source: v.optional(
          v.union(
            v.literal("kitchen"),
            v.literal("goldfinch"),
            v.literal("outlet")
          )
        ),
        sourceOutletId: v.optional(v.id("externalOutlets")),
        destinationOutletId: v.optional(v.id("externalOutlets")),
        destination: v.optional(
          v.union(
            v.literal("office"),
            v.literal("goldfinch"),
            v.literal("outlet")
          )
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    let upsertedCount = 0;

    for (const plan of args.plans) {
      // Validation
      if (plan.plannedQty < 0) {
        throw new Error("Quantity cannot be negative");
      }

      // Check if plan exists for this date + outlet + product + isStockOut
      const existing = await ctx.db
        .query("k3martDispatchPlans")
        .withIndex("by_date_outlet", (q) =>
          q.eq("date", plan.date).eq("outletId", plan.outletId)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("menuProductId"), plan.menuProductId),
            q.eq(q.field("isStockOut"), plan.isStockOut)
          )
        )
        .first();

      if (existing) {
        // Patch existing
        await ctx.db.patch(existing._id, {
          plannedQty: plan.plannedQty,
          suggestedQty: plan.suggestedQty,
          source: plan.source,
          sourceOutletId: plan.sourceOutletId,
          destinationOutletId: plan.destinationOutletId,
          destination: plan.destination,
          updatedBy: user.name,
          updatedAt: now,
        });
      } else {
        // Insert new
        await ctx.db.insert("k3martDispatchPlans", {
          date: plan.date,
          weekNumber: getWeekNumber(plan.date),
          outletId: plan.outletId,
          menuProductId: plan.menuProductId,
          externalProductId: plan.externalProductId,
          suggestedQty: plan.suggestedQty,
          plannedQty: plan.plannedQty,
          isStockOut: plan.isStockOut,
          source: plan.source,
          sourceOutletId: plan.sourceOutletId,
          destinationOutletId: plan.destinationOutletId,
          destination: plan.destination,
          status: "draft",
          createdBy: user.name,
          createdAt: now,
          updatedAt: now,
        });
      }

      upsertedCount++;
    }

    return { upsertedCount };
  },
});

/**
 * Confirm all draft plans for a date and calculate kitchen delta.
 * Marks all draft plans as "confirmed" and computes total kitchen order qty per product.
 * Auth: manager, admin
 *
 * @returns Count of confirmed plans + kitchen delta summary per product
 */
export const confirmDayPlan = mutation({
  args: {
    token: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    // Fetch all draft plans for this date
    const draftPlans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_date_status", (q) =>
        q.eq("date", args.date).eq("status", "draft")
      )
      .collect();

    if (draftPlans.length === 0) {
      throw new Error("No draft plans found for this date");
    }

    // Mark all as confirmed
    for (const plan of draftPlans) {
      await ctx.db.patch(plan._id, {
        status: "confirmed",
        updatedBy: user.name,
        updatedAt: now,
      });
    }

    // Calculate kitchen delta per product
    const productDeltas = new Map<
      string,
      { apiStockInQty: number; transfers: number }
    >();

    for (const plan of draftPlans) {
      const key = plan.menuProductId;

      if (!productDeltas.has(key)) {
        productDeltas.set(key, { apiStockInQty: 0, transfers: 0 });
      }

      const data = productDeltas.get(key)!;

      if (!plan.isStockOut) {
        // Stock-in plan
        data.apiStockInQty += plan.plannedQty;
      }

      // If source is outlet, it's a transfer
      if (plan.source === "outlet" && !plan.isStockOut) {
        data.transfers += plan.plannedQty;
      }
    }

    // Compute kitchen delta for each product
    const kitchenDeltas = Array.from(productDeltas.entries()).map(
      ([menuProductId, { apiStockInQty, transfers }]) => {
        const delta = calculateKitchenDelta(apiStockInQty, 0, transfers);
        return {
          menuProductId,
          kitchenOrderQty: delta.kitchenOrderQty,
          apiStockInQty: delta.apiStockInQty,
        };
      }
    );

    return {
      confirmedCount: draftPlans.length,
      kitchenDeltas,
    };
  },
});

/**
 * Update dispatch plan status after API submission.
 * Internal mutation — called by actions only.
 */
export const updateDispatchPlanStatus = internalMutation({
  args: {
    planId: v.id("k3martDispatchPlans"),
    status: v.union(
      v.literal("draft"),
      v.literal("confirmed"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("canceled")
    ),
    k3martRequestId: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    submittedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.planId, {
      status: args.status,
      k3martRequestId: args.k3martRequestId,
      submittedAt: args.submittedAt,
      submittedBy: args.submittedBy,
      updatedAt: now,
    });
  },
});

/**
 * Record a stock movement (internal use by actions).
 * Inserts a new k3martStockMovements record with attempt tracking.
 */
export const recordStockMovement = internalMutation({
  args: {
    date: v.string(),
    outletId: v.id("externalOutlets"),
    direction: v.union(v.literal("stock_in"), v.literal("stock_out")),
    menuProductId: v.id("menuProducts"),
    externalProductId: v.string(),
    quantity: v.number(),
    priceAtSubmission: v.number(),
    currentStockAtSubmission: v.number(),
    source: v.optional(
      v.union(
        v.literal("kitchen"),
        v.literal("goldfinch"),
        v.literal("outlet")
      )
    ),
    k3martRequestId: v.optional(v.number()),
    k3martStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("canceled")
      )
    ),
    destination: v.optional(
      v.union(v.literal("office"), v.literal("goldfinch"), v.literal("outlet"))
    ),
    destinationOutletId: v.optional(v.id("externalOutlets")),
    note: v.optional(v.string()),
    submittedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.insert("k3martStockMovements", {
      date: args.date,
      outletId: args.outletId,
      direction: args.direction,
      menuProductId: args.menuProductId,
      externalProductId: args.externalProductId,
      quantity: args.quantity,
      priceAtSubmission: args.priceAtSubmission,
      currentStockAtSubmission: args.currentStockAtSubmission,
      source: args.source,
      k3martRequestId: args.k3martRequestId,
      k3martStatus: args.k3martStatus,
      destination: args.destination,
      destinationOutletId: args.destinationOutletId,
      note: args.note,
      attemptCount: 1,
      submittedBy: args.submittedBy,
      submittedAt: now,
    });
  },
});

/**
 * Process stock-out destination routing with inventory adjustments.
 * Routes stock-out to office/goldfinch/outlet and updates inventory accordingly.
 * Auth: manager, admin
 */
export const processStockOutDestination = mutation({
  args: {
    token: v.string(),
    movementId: v.id("k3martStockMovements"),
    destination: v.union(
      v.literal("office"),
      v.literal("goldfinch"),
      v.literal("outlet")
    ),
    destinationOutletId: v.optional(v.id("externalOutlets")),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    // Validation
    if (args.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    if (args.destination === "outlet" && !args.destinationOutletId) {
      throw new Error("Destination outlet required for outlet transfers");
    }

    // Get the movement record
    const movement = await ctx.db.get(args.movementId);
    if (!movement) {
      throw new Error("Movement not found");
    }

    // Route to destination
    if (args.destination === "office") {
      // Increment production counts stickered
      const prodCount = await ctx.db
        .query("productionCounts")
        .withIndex("by_menu_product", (q) =>
          q.eq("menuProductId", movement.menuProductId)
        )
        .first();

      if (prodCount) {
        await ctx.db.patch(prodCount._id, {
          stickered: prodCount.stickered + args.quantity,
        });
      }
    } else if (args.destination === "goldfinch") {
      // Increment GoFood depot stock
      const depotStock = await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) =>
          q.eq("menuProductId", movement.menuProductId)
        )
        .first();

      if (depotStock) {
        await ctx.db.patch(depotStock._id, {
          quantity: depotStock.quantity + args.quantity,
          lastUpdated: now,
        });
      } else {
        await ctx.db.insert("gofoodDepotStock", {
          menuProductId: movement.menuProductId,
          quantity: args.quantity,
          lastUpdated: now,
        });
      }
    } else if (args.destination === "outlet" && args.destinationOutletId) {
      // Create a draft dispatch plan at destination outlet (stock-in)
      const today = new Date(now).toLocaleDateString("en-CA", {
        timeZone: "Asia/Jakarta",
      });

      await ctx.db.insert("k3martDispatchPlans", {
        date: today,
        weekNumber: getWeekNumber(today),
        outletId: args.destinationOutletId,
        menuProductId: movement.menuProductId,
        externalProductId: movement.externalProductId,
        suggestedQty: args.quantity,
        plannedQty: args.quantity,
        isStockOut: false,
        source: "outlet",
        sourceOutletId: movement.outletId,
        status: "draft",
        createdBy: user.name,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Patch movement with destination info
    await ctx.db.patch(args.movementId, {
      destination: args.destination,
      destinationOutletId: args.destinationOutletId,
    });

    return { success: true };
  },
});

/**
 * Update K3 Mart status from API verification.
 * Internal mutation — called by actions only.
 */
export const updateMovementStatus = internalMutation({
  args: {
    movementId: v.id("k3martStockMovements"),
    k3martStatus: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("canceled")
    ),
    attemptCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: {
      k3martStatus: "pending" | "approved" | "rejected" | "canceled";
      attemptCount?: number;
    } = {
      k3martStatus: args.k3martStatus,
    };

    if (args.attemptCount !== undefined) {
      updates.attemptCount = args.attemptCount;
    }

    await ctx.db.patch(args.movementId, updates);
  },
});

/**
 * Toggle outlet active/inactive status.
 * Auth: admin only
 */
export const toggleOutletActive = mutation({
  args: {
    token: v.string(),
    outletId: v.id("externalOutlets"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    await ctx.db.patch(args.outletId, {
      isActive: args.isActive,
    });

    return { success: true };
  },
});
