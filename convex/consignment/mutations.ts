/**
 * Consignment Settlement Mutations
 *
 * CRUD for consignment outlets and settlements.
 * All mutations require admin or manager role.
 * Settlements create linked externalRevenue records (revenue bridge).
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import {
  computeSettlementMath,
  shouldAutoArchive,
  assertSettlementEditable,
  validateSettlementInput,
} from "./helpers";

// ============================================
// Outlet Mutations
// ============================================

/**
 * Create a new consignment outlet with linked externalOutlets record.
 * Also sets dispatch planner fields for dispatch planning integration.
 */
export const createOutlet = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    revSharePercent: v.number(),
    type: v.union(v.literal("cafe"), v.literal("retail"), v.literal("event")),
    address: v.optional(v.string()),
    contactName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin", "manager"]);
    const now = Date.now();

    // Create consignmentOutlets record first
    const outletId = await ctx.db.insert("consignmentOutlets", {
      name: args.name,
      revSharePercent: args.revSharePercent,
      type: args.type,
      isActive: true,
      address: args.address,
      contactName: args.contactName,
      notes: args.notes,
      // Dispatch planner fields
      channelKey: "consignment" as const,
      isEnabled: true,
      productMappings: [],
      createdBy: user.name,
      createdAt: now,
    });

    // Create linked externalOutlets record for revenue bridge
    const externalOutletId = await ctx.db.insert("externalOutlets", {
      source: "consignment" as const,
      externalId: `consignment-${outletId}`,
      name: args.name,
      address: args.address,
      isActive: true,
      createdBy: user.name,
      createdAt: now,
    });

    // Link consignmentOutlets to externalOutlets
    await ctx.db.patch(outletId, { externalOutletId });

    return { status: "created" as const, outletId, externalOutletId };
  },
});

/**
 * Update an existing consignment outlet.
 * Also syncs name/address changes to linked externalOutlets record.
 */
export const updateOutlet = mutation({
  args: {
    token: v.string(),
    outletId: v.id("consignmentOutlets"),
    name: v.optional(v.string()),
    revSharePercent: v.optional(v.number()),
    type: v.optional(v.union(v.literal("cafe"), v.literal("retail"), v.literal("event"))),
    address: v.optional(v.string()),
    contactName: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    productMappings: v.optional(v.array(v.object({
      menuProductId: v.id("menuProducts"),
      externalName: v.string(),
      externalPrice: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin", "manager"]);
    const now = Date.now();

    const outlet = await ctx.db.get(args.outletId);
    if (!outlet) {
      throw new Error("Consignment outlet not found");
    }

    // Build patch for consignmentOutlets
    const patch: Record<string, unknown> = {
      updatedBy: user.name,
      updatedAt: now,
    };
    if (args.name !== undefined) patch.name = args.name;
    if (args.revSharePercent !== undefined) patch.revSharePercent = args.revSharePercent;
    if (args.type !== undefined) patch.type = args.type;
    if (args.address !== undefined) patch.address = args.address;
    if (args.contactName !== undefined) patch.contactName = args.contactName;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.productMappings !== undefined) patch.productMappings = args.productMappings;

    await ctx.db.patch(args.outletId, patch);

    // Sync name/address/isActive to linked externalOutlets record
    if (outlet.externalOutletId) {
      const extPatch: Record<string, unknown> = {};
      if (args.name !== undefined) extPatch.name = args.name;
      if (args.address !== undefined) extPatch.address = args.address;
      if (args.isActive !== undefined) extPatch.isActive = args.isActive;
      if (Object.keys(extPatch).length > 0) {
        await ctx.db.patch(outlet.externalOutletId, extPatch);
      }
    }

    return { status: "updated" as const };
  },
});

// ============================================
// Settlement Mutations
// ============================================

/**
 * Create a new consignment settlement with linked externalRevenue record.
 * Auto-computes rev share split from outlet's revSharePercent.
 */
export const createSettlement = mutation({
  args: {
    token: v.string(),
    outletId: v.id("consignmentOutlets"),
    periodStart: v.number(),
    periodEnd: v.number(),
    totalRevenue: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin", "manager"]);
    const now = Date.now();

    // Fetch outlet for rev share percentage and externalOutletId
    const outlet = await ctx.db.get(args.outletId);
    if (!outlet) {
      throw new Error("Consignment outlet not found");
    }

    // Validate input
    validateSettlementInput({
      totalRevenue: args.totalRevenue,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
    });

    // Compute settlement math
    const { revShareAmount, frolliePayment } = computeSettlementMath(
      args.totalRevenue,
      outlet.revSharePercent
    );

    // Create externalRevenue record (revenue bridge) — inline to preserve Convex types
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "consignment" as const,
      outletId: outlet.externalOutletId,
      revenueGross: args.totalRevenue,
      revenueNet: frolliePayment,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      dataOrigin: "manual_entry" as const,
      confidence: "manual" as const,
      transactionType: "sales" as const,
    });

    // Create settlement record
    const settlementId = await ctx.db.insert("consignmentSettlements", {
      outletId: args.outletId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      totalRevenue: args.totalRevenue,
      revSharePercent: outlet.revSharePercent,
      revShareAmount,
      frolliePayment,
      status: "pending" as const,
      linkedRevenueId: revenueId,
      notes: args.notes,
      createdBy: user.name,
      createdAt: now,
    });

    return { status: "created" as const, settlementId, revenueId };
  },
});

/**
 * Update a pending settlement. Recomputes rev share if totalRevenue changes.
 * Syncs changes to linked externalRevenue record.
 */
export const updateSettlement = mutation({
  args: {
    token: v.string(),
    settlementId: v.id("consignmentSettlements"),
    totalRevenue: v.optional(v.number()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin", "manager"]);
    const now = Date.now();

    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    // Guard: cannot modify paid settlements
    assertSettlementEditable(settlement.status);

    // Build settlement patch
    const patch: Record<string, unknown> = {
      updatedBy: user.name,
      updatedAt: now,
    };

    // If totalRevenue changed, recompute rev share
    let newFrolliePayment = settlement.frolliePayment;
    if (args.totalRevenue !== undefined) {
      const outlet = await ctx.db.get(settlement.outletId);
      if (!outlet) {
        throw new Error("Consignment outlet not found");
      }
      const { revShareAmount, frolliePayment } = computeSettlementMath(
        args.totalRevenue,
        outlet.revSharePercent
      );
      patch.totalRevenue = args.totalRevenue;
      patch.revShareAmount = revShareAmount;
      patch.frolliePayment = frolliePayment;
      newFrolliePayment = frolliePayment;
    }

    if (args.periodStart !== undefined) patch.periodStart = args.periodStart;
    if (args.periodEnd !== undefined) patch.periodEnd = args.periodEnd;
    if (args.notes !== undefined) patch.notes = args.notes;

    // Validate effective period dates (merged args + existing values)
    const effectiveStart = (args.periodStart ?? settlement.periodStart) as number;
    const effectiveEnd = (args.periodEnd ?? settlement.periodEnd) as number;
    if (effectiveStart > effectiveEnd) {
      throw new Error("Period start must be before period end");
    }

    await ctx.db.patch(args.settlementId, patch);

    // Sync to linked externalRevenue record
    if (settlement.linkedRevenueId) {
      const revPatch: Record<string, unknown> = {};
      if (args.totalRevenue !== undefined) {
        revPatch.revenueGross = args.totalRevenue;
        revPatch.revenueNet = newFrolliePayment;
      }
      if (args.periodStart !== undefined) revPatch.periodStart = args.periodStart;
      if (args.periodEnd !== undefined) revPatch.periodEnd = args.periodEnd;
      if (Object.keys(revPatch).length > 0) {
        await ctx.db.patch(settlement.linkedRevenueId, revPatch);
      }
    }

    return { status: "updated" as const };
  },
});

/**
 * Mark a settlement as paid. Auto-archives event-type outlets.
 */
export const markAsPaid = mutation({
  args: {
    token: v.string(),
    settlementId: v.id("consignmentSettlements"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin", "manager"]);
    const now = Date.now();

    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    // Guard: cannot mark already-paid settlement
    assertSettlementEditable(settlement.status);

    // Mark as paid
    await ctx.db.patch(args.settlementId, {
      status: "paid" as const,
      paidAt: now,
      updatedBy: user.name,
      updatedAt: now,
    });

    // Event auto-archive: deactivate event-type outlets after payment
    const outlet = await ctx.db.get(settlement.outletId);
    const autoArchived = outlet ? shouldAutoArchive(outlet.type) : false;

    if (autoArchived && outlet) {
      await ctx.db.patch(settlement.outletId, {
        isActive: false,
        updatedBy: user.name,
        updatedAt: now,
      });
      // Sync isActive to linked externalOutlets record
      if (outlet.externalOutletId) {
        await ctx.db.patch(outlet.externalOutletId, { isActive: false });
      }
    }

    return { status: "paid" as const, autoArchived };
  },
});

/**
 * Delete a pending settlement and its linked externalRevenue record.
 */
export const deleteSettlement = mutation({
  args: {
    token: v.string(),
    settlementId: v.id("consignmentSettlements"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    // Guard: cannot delete paid settlements
    assertSettlementEditable(settlement.status);

    // Delete linked externalRevenue record
    if (settlement.linkedRevenueId) {
      await ctx.db.delete(settlement.linkedRevenueId);
    }

    // Delete settlement
    await ctx.db.delete(args.settlementId);

    return { status: "deleted" as const };
  },
});
