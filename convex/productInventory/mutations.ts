/**
 * Product Inventory Mutations
 *
 * Stock operations for finished goods inventory tracking.
 * Tracks boxes of menu products at storage locations.
 * All mutations include full audit logging to productInventoryTransactions.
 */

import { mutation, internalMutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";
import { logStatusTransition } from "../orders/helpers/statusTransitions";
import { resolveSubstitutionPlan } from "./substitution";
import { createStockTracker, type StockEntry } from "./stockTracker";

/**
 * Add stock — Kitchen/staff adds finished goods to a location.
 * Upserts productInventory row and logs the transaction.
 */
export const addStock = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    locationId: v.id("storageLocations"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "order_staff", "manager", "admin"]);

    // Validate: quantity must be positive
    if (args.quantity <= 0) {
      throw new Error("Quantity must be greater than 0");
    }

    // Validate: menuProduct exists
    const menuProduct = await ctx.db.get(args.menuProductId);
    if (!menuProduct) {
      throw new Error("Menu product not found");
    }

    // Validate: location exists and is active
    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }
    if (!location.isActive) {
      throw new Error("Location is not active");
    }

    const now = Date.now();

    // Upsert productInventory row
    const existing = await ctx.db
      .query("productInventory")
      .withIndex("by_product_location", (q) =>
        q.eq("menuProductId", args.menuProductId).eq("locationId", args.locationId)
      )
      .first();

    const previousQuantity = existing?.quantity ?? 0;
    const newQuantity = previousQuantity + args.quantity;

    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: newQuantity,
        lastUpdated: now,
      });
    } else {
      await ctx.db.insert("productInventory", {
        menuProductId: args.menuProductId,
        locationId: args.locationId,
        quantity: newQuantity,
        lastUpdated: now,
      });
    }

    // Log transaction
    await ctx.db.insert("productInventoryTransactions", {
      menuProductId: args.menuProductId,
      locationId: args.locationId,
      transactionType: "add",
      quantity: args.quantity,
      previousQuantity,
      newQuantity,
      performedBy: user.name,
      createdAt: now,
    });

    return { newQuantity };
  },
});

/**
 * Adjust stock — Manager adjustment (spoilage, correction, transfer).
 * quantity can be positive (add) or negative (subtract).
 * Manager override: allows stock to go negative.
 */
export const adjustStock = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    locationId: v.id("storageLocations"),
    quantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    // Validate: reason must be non-empty
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error("Reason is required for stock adjustment");
    }

    // Validate: menuProduct exists
    const menuProduct = await ctx.db.get(args.menuProductId);
    if (!menuProduct) {
      throw new Error("Menu product not found");
    }

    // Validate: location exists
    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }

    const now = Date.now();

    // Upsert productInventory row
    const existing = await ctx.db
      .query("productInventory")
      .withIndex("by_product_location", (q) =>
        q.eq("menuProductId", args.menuProductId).eq("locationId", args.locationId)
      )
      .first();

    const previousQuantity = existing?.quantity ?? 0;
    const newQuantity = previousQuantity + args.quantity;

    // Build reason — note if going negative (manager override)
    const effectiveReason =
      newQuantity < 0
        ? `${args.reason} [Manager override: stock went negative]`
        : args.reason;

    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: newQuantity,
        lastUpdated: now,
      });
    } else {
      await ctx.db.insert("productInventory", {
        menuProductId: args.menuProductId,
        locationId: args.locationId,
        quantity: newQuantity,
        lastUpdated: now,
      });
    }

    // Log transaction
    await ctx.db.insert("productInventoryTransactions", {
      menuProductId: args.menuProductId,
      locationId: args.locationId,
      transactionType: "adjust",
      quantity: args.quantity,
      previousQuantity,
      newQuantity,
      reason: effectiveReason,
      performedBy: user.name,
      createdAt: now,
    });

    return { newQuantity };
  },
});

/**
 * Initialize settings — Creates the settings row if none exists.
 * Internal-only: call from seed mutation or cron.
 */
export const initializeSettings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("productInventorySettings").first();
    if (existing) {
      return existing;
    }

    const id = await ctx.db.insert("productInventorySettings", {
      globalLowStockThreshold: 5,
      autoAdvanceOnDrawdown: true,
      alertMode: "toast",
      updatedBy: "system",
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Fulfill from inventory — Drawdown finished goods for a direct order.
 *
 * Validates stock at the given location, deducts all items atomically,
 * and advances the order from PaymentReceived -> AwaitingDelivery
 * (skipping kitchen production entirely).
 *
 * Throws a ConvexError with type "insufficient_stock" if any item is short.
 * Auth: order_staff, manager, admin
 */
export const fulfillFromInventory = mutation({
  args: {
    token: v.string(),
    orderId: v.id("orders"),
    locationId: v.id("storageLocations"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["order_staff", "manager", "admin"]);

    // 1. Validate order status: must be PaymentReceived or BeingPrepared
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    if (order.status !== "PaymentReceived" && order.status !== "BeingPrepared") {
      throw new Error(
        `Order must be in "Payment Received" or "Being Prepared" status to fulfill from inventory. Current status: ${order.status}`
      );
    }

    // 2. Load active order items with a menuProductId
    const allOrderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Fetch each item's menuProduct to check productType.
    // Exclude packaging-type products (e.g., Brochure - How to eat) — they are
    // marketing items that don't live in finished-goods inventory and should
    // never be drawn down during order fulfillment.
    const eligibleItems = allOrderItems.filter(
      (item) => item.isCancelled !== true && item.menuProductId !== undefined
    );
    const menuProductCache = new Map<string, Doc<"menuProducts"> | null>();
    for (const item of eligibleItems) {
      if (!menuProductCache.has(String(item.menuProductId))) {
        menuProductCache.set(String(item.menuProductId), await ctx.db.get(item.menuProductId!));
      }
    }
    const orderItems = eligibleItems.filter((item) => {
      const mp = menuProductCache.get(String(item.menuProductId));
      return mp?.productType !== "packaging";
    });

    if (orderItems.length === 0) {
      throw new Error("No fulfillable items found on this order");
    }

    // 3. Plan drawdown for ALL items (no partial fulfillment).
    //    Substitution-aware: shared stockTracker ensures items sharing the same
    //    direct or substitute product+location aggregate correctly, and the
    //    sufficiency check sees post-deduction running quantities.
    const stockTracker = createStockTracker(ctx);

    const shortages: Array<{ productName: string; needed: number; available: number }> = [];

    interface ItemPlan {
      item: typeof orderItems[0];
      menuProduct: Doc<"menuProducts">;
      plan: ReturnType<typeof resolveSubstitutionPlan>;
      directStock: StockEntry;
      substituteStock: StockEntry | null;
    }
    const itemPlans: ItemPlan[] = [];

    for (const item of orderItems) {
      const menuProduct = menuProductCache.get(String(item.menuProductId!))!;
      const directStock = await stockTracker.getStock(item.menuProductId!, args.locationId);

      // Load substitution source if configured (cache source products too)
      let sourceProduct: Doc<"menuProducts"> | null = null;
      let substituteStock: StockEntry | null = null;

      if (menuProduct?.fulfillFromProductId) {
        const sourceKey = String(menuProduct.fulfillFromProductId);
        if (!menuProductCache.has(sourceKey)) {
          menuProductCache.set(sourceKey, await ctx.db.get(menuProduct.fulfillFromProductId));
        }
        sourceProduct = menuProductCache.get(sourceKey) ?? null;
        if (sourceProduct) {
          substituteStock = await stockTracker.getStock(menuProduct.fulfillFromProductId, args.locationId);
        }
      }

      // Plan uses running (post-prior-deduction) quantity, not original DB value.
      const plan = resolveSubstitutionPlan(
        item.quantity,
        directStock.runningQty,
        menuProduct!,
        sourceProduct,
      );

      // Sufficiency check against running quantities.
      // resolveSubstitutionPlan clamps directUnits to max(runningQty, 0), so
      // directUnits <= runningQty is guaranteed when runningQty >= 0. The only
      // failure mode here is substitute shortage.
      if (plan.needsSubstitution && substituteStock !== null) {
        if (substituteStock.runningQty < plan.substituteUnits) {
          shortages.push({
            productName: `${sourceProduct?.name ?? "substitute"} (for ${menuProduct?.name})`,
            needed: plan.substituteUnits,
            available: substituteStock.runningQty,
          });
        }
      } else if (plan.directUnits > directStock.runningQty) {
        // No substitution configured: direct must cover full need.
        shortages.push({
          productName: menuProduct?.name ?? item.productName,
          needed: item.quantity,
          available: directStock.runningQty,
        });
      }

      // Commit the planned deductions to the running quantities so the next
      // item's plan sees post-deduction values.
      directStock.runningQty -= plan.directUnits;
      if (plan.needsSubstitution && substituteStock !== null) {
        substituteStock.runningQty -= plan.substituteUnits;
      }

      itemPlans.push({
        item,
        menuProduct: menuProduct!,
        plan,
        directStock,
        substituteStock,
      });
    }

    if (shortages.length > 0) {
      throw new ConvexError({
        type: "insufficient_stock",
        shortages,
      });
    }

    // 4. Apply deductions atomically.
    //    Transaction log + per-item `deductions` response use progressive prev/new:
    //    each item's prev is the running qty BEFORE this item's deduction.
    const now = Date.now();
    let itemsFulfilled = 0;
    const deductions: Array<{
      productName: string;
      used: number;
      remaining: number;
      substituteProductName?: string;
      substituteUsed?: number;
      substituteRemaining?: number;
    }> = [];

    // Progressive per-product quantity tracker (starts from original DB quantity).
    // Seed from stockTracker's loaded entries so first iteration sees the pre-batch value.
    const writeTracker = new Map<string, number>();
    for (const entry of stockTracker.values()) {
      writeTracker.set(String(entry.menuProductId), entry.row?.quantity ?? 0);
    }

    for (const { item, menuProduct, plan } of itemPlans) {
      const directKey = String(item.menuProductId!);

      // Deduct direct stock
      if (plan.directUnits > 0) {
        const prevQty = writeTracker.get(directKey)!;
        const newQty = prevQty - plan.directUnits;
        writeTracker.set(directKey, newQty);

        await ctx.db.insert("productInventoryTransactions", {
          menuProductId: item.menuProductId!,
          locationId: args.locationId,
          transactionType: "drawdown",
          quantity: -plan.directUnits,
          previousQuantity: prevQty,
          newQuantity: newQty,
          orderId: args.orderId,
          performedBy: user.name,
          createdAt: now,
        });
      }

      const deduction: typeof deductions[0] = {
        productName: menuProduct.name ?? item.productName,
        used: plan.directUnits,
        remaining: writeTracker.get(directKey) ?? 0,
      };

      // Deduct substitute stock if needed
      if (plan.needsSubstitution && plan.substituteUnits > 0 && plan.sourceProduct) {
        const subKey = String(plan.sourceProduct._id);
        const prevQty = writeTracker.get(subKey)!;
        const newQty = prevQty - plan.substituteUnits;
        writeTracker.set(subKey, newQty);

        await ctx.db.insert("productInventoryTransactions", {
          menuProductId: plan.sourceProduct._id,
          locationId: args.locationId,
          transactionType: "drawdown",
          quantity: -plan.substituteUnits,
          previousQuantity: prevQty,
          newQuantity: newQty,
          orderId: args.orderId,
          performedBy: user.name,
          createdAt: now,
        });

        deduction.substituteProductName = plan.sourceProduct.name;
        deduction.substituteUsed = plan.substituteUnits;
        deduction.substituteRemaining = newQty;
      }

      deductions.push(deduction);
      itemsFulfilled++;
    }

    // Apply the final running quantities to DB (single patch/insert per stock entry).
    await stockTracker.flush(now);

    // 5. Advance order status: PaymentReceived | BeingPrepared -> AwaitingDelivery
    //    Both delivery types use AwaitingDelivery (Phase 14 unified status).
    //    The deliveryType field on the order determines downstream behavior.
    await ctx.db.patch(args.orderId, {
      status: "AwaitingDelivery",
      isKitchenVisible: false,
    });

    // 6. Log the status transition to the audit trail
    await logStatusTransition(
      ctx,
      args.orderId,
      order.status,  // was hardcoded "PaymentReceived"
      "AwaitingDelivery",
      "Fulfilled from inventory (skipped production)",
      "user",
      user._id
    );

    return { success: true, itemsFulfilled, deductions };
  },
});

/**
 * Update settings — Admin-only config update.
 */
export const updateSettings = mutation({
  args: {
    token: v.string(),
    globalLowStockThreshold: v.optional(v.number()),
    defaultAddLocationId: v.optional(v.id("storageLocations")),
    autoAdvanceOnDrawdown: v.optional(v.boolean()),
    alertMode: v.optional(v.union(v.literal("toast"), v.literal("toast_and_badge"))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    const now = Date.now();
    const existing = await ctx.db.query("productInventorySettings").first();

    const patch: Record<string, unknown> = {
      updatedBy: user.name,
      updatedAt: now,
    };

    if (args.globalLowStockThreshold !== undefined) {
      patch.globalLowStockThreshold = args.globalLowStockThreshold;
    }
    if (args.defaultAddLocationId !== undefined) {
      patch.defaultAddLocationId = args.defaultAddLocationId;
    }
    if (args.autoAdvanceOnDrawdown !== undefined) {
      patch.autoAdvanceOnDrawdown = args.autoAdvanceOnDrawdown;
    }
    if (args.alertMode !== undefined) {
      patch.alertMode = args.alertMode;
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    } else {
      // Create with defaults then patch
      const id = await ctx.db.insert("productInventorySettings", {
        globalLowStockThreshold: (args.globalLowStockThreshold as number) ?? 5,
        autoAdvanceOnDrawdown: (args.autoAdvanceOnDrawdown as boolean) ?? true,
        alertMode: (args.alertMode as "toast" | "toast_and_badge") ?? "toast",
        updatedBy: user.name,
        updatedAt: now,
        ...(args.defaultAddLocationId !== undefined && {
          defaultAddLocationId: args.defaultAddLocationId,
        }),
      });
      return id;
    }
  },
});

/**
 * Transfer stock between locations — Atomically debits source and credits destination.
 *
 * Auth: manager, admin
 * Validates:
 *   - quantity > 0
 *   - source != destination
 *   - sufficient stock at source
 * Logs two productInventoryTransactions (negative at source, positive at destination)
 * linked via transferPairLocationId.
 */
export const transferStock = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    sourceLocationId: v.id("storageLocations"),
    destinationLocationId: v.id("storageLocations"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    if (args.quantity <= 0) {
      throw new Error("Transfer quantity must be positive");
    }
    if (args.sourceLocationId === args.destinationLocationId) {
      throw new Error("Source and destination must be different");
    }

    // 1. Get source productInventory row
    const source = await ctx.db
      .query("productInventory")
      .withIndex("by_product_location", (q) =>
        q.eq("menuProductId", args.menuProductId).eq("locationId", args.sourceLocationId)
      )
      .unique();

    if (!source || source.quantity < args.quantity) {
      throw new Error(
        `Insufficient stock: ${source?.quantity ?? 0} available, ${args.quantity} requested`
      );
    }

    const now = Date.now();

    // 2. Debit source
    const sourcePrev = source.quantity;
    await ctx.db.patch(source._id, {
      quantity: sourcePrev - args.quantity,
      lastUpdated: now,
    });

    // 3. Credit destination (upsert)
    const dest = await ctx.db
      .query("productInventory")
      .withIndex("by_product_location", (q) =>
        q.eq("menuProductId", args.menuProductId).eq("locationId", args.destinationLocationId)
      )
      .unique();

    let destPrev: number;
    if (dest) {
      destPrev = dest.quantity;
      await ctx.db.patch(dest._id, {
        quantity: destPrev + args.quantity,
        lastUpdated: now,
      });
    } else {
      destPrev = 0;
      await ctx.db.insert("productInventory", {
        menuProductId: args.menuProductId,
        locationId: args.destinationLocationId,
        quantity: args.quantity,
        lastUpdated: now,
      });
    }

    // 4. Get location names for reason text
    const srcLoc = await ctx.db.get(args.sourceLocationId);
    const dstLoc = await ctx.db.get(args.destinationLocationId);

    // 5. Log source transaction (negative)
    await ctx.db.insert("productInventoryTransactions", {
      menuProductId: args.menuProductId,
      locationId: args.sourceLocationId,
      transactionType: "transfer",
      quantity: -args.quantity,
      previousQuantity: sourcePrev,
      newQuantity: sourcePrev - args.quantity,
      reason: `Transfer to ${dstLoc?.name ?? "unknown"}`,
      transferPairLocationId: args.destinationLocationId,
      performedBy: user.name,
      createdAt: now,
    });

    // 6. Log destination transaction (positive)
    await ctx.db.insert("productInventoryTransactions", {
      menuProductId: args.menuProductId,
      locationId: args.destinationLocationId,
      transactionType: "transfer",
      quantity: args.quantity,
      previousQuantity: destPrev,
      newQuantity: destPrev + args.quantity,
      reason: `Transfer from ${srcLoc?.name ?? "unknown"}`,
      transferPairLocationId: args.sourceLocationId,
      performedBy: user.name,
      createdAt: now,
    });
  },
});

/**
 * Bulk stock count -- Staff enters actual physical counts for products at a location.
 * Calculates delta for each product and records stock_count transactions.
 * Auth: all roles (kitchen, order_staff, manager, admin).
 */
export const bulkStockCount = mutation({
  args: {
    token: v.string(),
    locationId: v.id("storageLocations"),
    counts: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      actualCount: v.number(),
      note: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "order_staff", "manager", "admin"]);

    if (args.counts.length === 0) {
      throw new Error("No stock counts provided");
    }

    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }
    if (!location.isActive) {
      throw new Error("Location is not active");
    }

    for (const item of args.counts) {
      if (item.actualCount < 0) {
        throw new Error("Stock count cannot be negative");
      }
    }

    const now = Date.now();
    let updated = 0;
    let skipped = 0;

    for (const item of args.counts) {
      const existing = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", item.menuProductId).eq("locationId", args.locationId)
        )
        .first();

      const previousQuantity = existing?.quantity ?? 0;
      const delta = item.actualCount - previousQuantity;

      if (delta === 0) {
        skipped++;
        continue;
      }

      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: item.actualCount,
          lastUpdated: now,
        });
      } else {
        await ctx.db.insert("productInventory", {
          menuProductId: item.menuProductId,
          locationId: args.locationId,
          quantity: item.actualCount,
          lastUpdated: now,
        });
      }

      await ctx.db.insert("productInventoryTransactions", {
        menuProductId: item.menuProductId,
        locationId: args.locationId,
        transactionType: "stock_count",
        quantity: delta,
        previousQuantity,
        newQuantity: item.actualCount,
        reason: item.note || "Daily stock count",
        performedBy: user.name,
        createdAt: now,
      });

      updated++;
    }

    return { updated, skipped };
  },
});

// Phase 74.5.2 Plan 08: legacy per-source GoFood deduction mutation retired.
// GoFood deductions now flow through the unified `saveRevenueItems` →
// `processChannelSaleInternal` path (writes `transactionType: "channel_sale"`
// + `source: "gobiz"`). The `channelDeductionEnabled.gobiz` flag gates
// dispatch; historical legacy-typed ledger rows are rewritten by
// `convex/migrations/gofoodSaleToChannelSale.ts` (Plan 04).
