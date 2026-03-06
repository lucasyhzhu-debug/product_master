/**
 * Product Inventory Mutations
 *
 * Stock operations for finished goods inventory tracking.
 * Tracks boxes of menu products at storage locations.
 * All mutations include full audit logging to productInventoryTransactions.
 */

import { mutation, internalMutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";
import { logStatusTransition } from "../orders/helpers/statusTransitions";
import { ensureDepotLocation } from "./depotAutoSeed";

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

    // 3. Check availability for ALL items first (no partial drawdown)
    //    Also build productNameMap for use in step 4 deductions.
    const shortages: Array<{ productName: string; needed: number; available: number }> = [];
    const productNameMap = new Map<string, string>();

    for (const item of orderItems) {
      const stockRow = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", item.menuProductId!).eq("locationId", args.locationId)
        )
        .first();

      const menuProduct = menuProductCache.get(String(item.menuProductId!));
      productNameMap.set(String(item.menuProductId!), menuProduct?.name ?? item.productName);

      const available = stockRow?.quantity ?? 0;
      const needed = item.quantity;

      if (available < needed) {
        shortages.push({
          productName: menuProduct?.name ?? item.productName,
          needed,
          available,
        });
      }
    }

    if (shortages.length > 0) {
      throw new ConvexError({
        type: "insufficient_stock",
        shortages,
      });
    }

    // 4. Deduct all items atomically
    const now = Date.now();
    let itemsFulfilled = 0;
    const deductions: Array<{ productName: string; used: number; remaining: number }> = [];

    for (const item of orderItems) {
      const stockRow = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", item.menuProductId!).eq("locationId", args.locationId)
        )
        .first();

      // stockRow is guaranteed to exist (passed step 3 check)
      const previousQuantity = stockRow?.quantity ?? 0;
      const newQuantity = previousQuantity - item.quantity;

      if (stockRow) {
        await ctx.db.patch(stockRow._id, {
          quantity: newQuantity,
          lastUpdated: now,
        });
      } else {
        // Defensive: insert with negative qty (should not reach here)
        await ctx.db.insert("productInventory", {
          menuProductId: item.menuProductId!,
          locationId: args.locationId,
          quantity: newQuantity,
          lastUpdated: now,
        });
      }

      // Log deduction transaction
      await ctx.db.insert("productInventoryTransactions", {
        menuProductId: item.menuProductId!,
        locationId: args.locationId,
        transactionType: "drawdown",
        quantity: -item.quantity,
        previousQuantity,
        newQuantity,
        orderId: args.orderId,
        performedBy: user.name,
        createdAt: now,
      });

      deductions.push({
        productName: productNameMap.get(String(item.menuProductId!)) ?? item.productName,
        used: item.quantity,
        remaining: newQuantity,
      });

      itemsFulfilled++;
    }

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
 * Process GoFood sales — Auto-deduct finished goods for GoFood sync.
 *
 * Internal-only (called from GoBiz adapter Phase D).
 * Deducts from the storage location linked to each outlet.
 * Negative stock is ALLOWED — GoFood sales must never be blocked.
 *
 * Items are keyed by (outletId, menuProductId) — deduct from the outlet's
 * linked depot location.
 */
export const processGofoodSales = internalMutation({
  args: {
    items: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
      outletId: v.id("externalOutlets"),
      gofoodOrderRef: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    if (args.items.length === 0) {
      return { processed: 0, lowStockAlerts: 0 };
    }

    // Load global threshold from settings (for low-stock detection)
    const settings = await ctx.db.query("productInventorySettings").first();
    const globalThreshold = settings?.globalLowStockThreshold ?? 5;

    // Cache outletId -> linkedStorageLocationId mapping to avoid repeated queries
    const outletLocationCache = new Map<string, Id<"storageLocations"> | null>();

    const now = Date.now();
    let processed = 0;
    let lowStockAlerts = 0;

    for (const item of args.items) {
      // Resolve the linked storage location for this outlet
      const outletIdStr = item.outletId as string;
      let linkedLocationId: Id<"storageLocations"> | null;

      if (outletLocationCache.has(outletIdStr)) {
        linkedLocationId = outletLocationCache.get(outletIdStr)!;
      } else {
        const outlet = await ctx.db.get(item.outletId);
        linkedLocationId = outlet?.linkedStorageLocationId ?? null;
        outletLocationCache.set(outletIdStr, linkedLocationId);
      }

      if (!linkedLocationId) {
        // Auto-seed: create depot location and link outlet
        const outlet = await ctx.db.get(item.outletId);
        const autoSeeded = await ensureDepotLocation(ctx, item.outletId, outlet?.name ?? "Unknown");
        if (!autoSeeded) {
          console.warn(`processGofoodSales: outlet ${outletIdStr} could not be auto-seeded — skipping item`);
          continue;
        }
        linkedLocationId = autoSeeded;
        outletLocationCache.set(outletIdStr, linkedLocationId);
      }

      const locationId: Id<"storageLocations"> = linkedLocationId;

      // Load or create the productInventory row
      const existing = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", item.menuProductId).eq("locationId", locationId)
        )
        .first();

      const previousQuantity = existing?.quantity ?? 0;
      const newQuantity = previousQuantity - item.quantity;

      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: newQuantity,
          lastUpdated: now,
        });
      } else {
        await ctx.db.insert("productInventory", {
          menuProductId: item.menuProductId,
          locationId,
          quantity: newQuantity,
          lastUpdated: now,
        });
      }

      // Log the GoFood sale transaction
      await ctx.db.insert("productInventoryTransactions", {
        menuProductId: item.menuProductId,
        locationId,
        transactionType: "gofood_sale",
        quantity: -item.quantity,
        previousQuantity,
        newQuantity,
        gofoodOrderRef: item.gofoodOrderRef,
        performedBy: "system:gobiz_sync",
        createdAt: now,
      });

      processed++;

      // Check for low-stock alert
      const effectiveThreshold = globalThreshold;
      if (newQuantity <= effectiveThreshold) {
        lowStockAlerts++;
      }
    }

    return { processed, lowStockAlerts };
  },
});
