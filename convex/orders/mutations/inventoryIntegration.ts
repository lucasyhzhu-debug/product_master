/**
 * Order-Inventory Integration Mutations
 *
 * Handles stock reservation, consumption, and release for orders.
 * Integrates with FIFO consumption logic and component stock tracking.
 *
 * Uses unified BOM via menuProductComponents.componentTypeId (required field).
 */

import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

// Import FIFO consumption logic
import { consumeFromFIFO, applyFIFOConsumption } from "../../inventory/fifo";
import { updateComponentStock } from "../../inventory/helpers";

// ============================================
// Helper Types
// ============================================

interface ComponentNeeded {
  componentTypeId: Id<"componentTypes">;
  quantity: number;
}

interface ReservationShortage {
  componentCode: string;
  componentName: string;
  requested: number;
  available: number;
  shortage: number;
}

// ============================================
// BOM Calculation Helper
// ============================================

/**
 * Calculate components needed for order items.
 *
 * Uses unified BOM via menuProductComponents.componentTypeId.
 */
async function calculateComponentsForOrder(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<Map<Id<"componentTypes">, number>> {
  const componentsNeeded = new Map<Id<"componentTypes">, number>();

  // Get all order items
  const orderItems = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();

  // For each item, get its components
  for (const item of orderItems) {
    if (!item.menuProductId) continue;

    const menuProductComponents = await ctx.db
      .query("menuProductComponents")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", item.menuProductId!))
      .collect();

    for (const comp of menuProductComponents) {
      // componentTypeId is now required after migration
      if (!comp.componentTypeId) {
        console.warn(
          `Missing componentTypeId for component ${comp._id}. Run migration.`
        );
        continue;
      }

      const needed = comp.quantity * item.quantity;
      const current = componentsNeeded.get(comp.componentTypeId) || 0;
      componentsNeeded.set(comp.componentTypeId, current + needed);
    }
  }

  return componentsNeeded;
}

/**
 * Get packaging components only (skip production components)
 *
 * Filters out production components since they're made to order.
 * Only packaging components (direct and indirect) need stock reservation.
 */
async function getPackagingComponentsForOrder(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<ComponentNeeded[]> {
  const allComponents = await calculateComponentsForOrder(ctx, orderId);
  const packagingComponents: ComponentNeeded[] = [];

  // Filter to only packaging components (trackInventory: true)
  for (const [componentTypeId, quantity] of allComponents) {
    const componentType = await ctx.db.get(componentTypeId);

    if (!componentType) continue;

    // Only reserve stock for components with inventory tracking
    // Production components (trackInventory: false) are made to order
    if (componentType.trackInventory) {
      packagingComponents.push({
        componentTypeId,
        quantity,
      });
    }
  }

  return packagingComponents;
}

/**
 * Get default storage location (Office)
 * Returns null if no default location is configured.
 */
async function getDefaultLocation(ctx: MutationCtx): Promise<Id<"storageLocations"> | null> {
  const defaultLocation = await ctx.db
    .query("storageLocations")
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .first();

  return defaultLocation?._id ?? null;
}

// ============================================
// Internal Helper Functions (accept ctx)
// ============================================

/**
 * Internal helper: Reserve stock for confirmed order
 * Used by statusUpdates.ts and other ctx-dependent code
 */
export async function reserveStockForOrderInternal(
  ctx: MutationCtx,
  args: {
    orderId: Id<"orders">;
    locationId?: Id<"storageLocations">;
  }
): Promise<{ reserved: number; shortages: ReservationShortage[] }> {
  const order = await ctx.db.get(args.orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  // Get location (use default if not specified)
  const resolvedLocationId = args.locationId ?? await getDefaultLocation(ctx);

  // Skip reservation if no location configured (inventory not set up yet)
  if (!resolvedLocationId) {
    console.warn("No default storage location configured. Skipping stock reservation for order:", args.orderId);
    return { reserved: 0, shortages: [] };
  }

  const locationId = resolvedLocationId;

  // Get packaging components to reserve
  const componentsToReserve = await getPackagingComponentsForOrder(ctx, args.orderId);

  if (componentsToReserve.length === 0) {
    // No packaging components to reserve (production-only order)
    return { reserved: 0, shortages: [] };
  }

  // Check availability for all components first
  const shortages: ReservationShortage[] = [];

  for (const comp of componentsToReserve) {
    const stock = await ctx.db
      .query("componentStock")
      .withIndex("by_component_location", (q) =>
        q.eq("componentTypeId", comp.componentTypeId).eq("locationId", locationId)
      )
      .first();

    const available = stock
      ? stock.totalStock - stock.totalReserved
      : 0;

    if (available < comp.quantity) {
      const componentType = await ctx.db.get(comp.componentTypeId);
      shortages.push({
        componentCode: componentType?.code ?? "UNKNOWN",
        componentName: componentType?.name ?? "Unknown Component",
        requested: comp.quantity,
        available,
        shortage: comp.quantity - available,
      });
    }
  }

  // If any shortages, throw error with details
  if (shortages.length > 0) {
    const shortageDetails = shortages
      .map(
        (s) =>
          `${s.componentName}: need ${s.requested}, have ${s.available} (short ${s.shortage})`
      )
      .join("\n");

    throw new Error(
      `Insufficient stock to reserve for order:\n${shortageDetails}`
    );
  }

  // Reserve stock for each component
  const now = Date.now();

  for (const comp of componentsToReserve) {
    // Get batches for this component (FIFO order)
    const batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_fifo", (q) =>
        q.eq("componentTypeId", comp.componentTypeId).eq("locationId", locationId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Sort by purchase date (oldest first)
    batches.sort((a, b) => a.purchaseDate - b.purchaseDate);

    // Reserve from batches FIFO
    let remaining = comp.quantity;

    for (const batch of batches) {
      if (remaining <= 0) break;

      const available = batch.quantityRemaining - batch.quantityReserved;
      if (available <= 0) continue;

      const toReserve = Math.min(remaining, available);

      // Update batch reservation
      await ctx.db.patch(batch._id, {
        quantityReserved: batch.quantityReserved + toReserve,
      });

      // Create transaction record
      await ctx.db.insert("componentTransactions", {
        componentTypeId: comp.componentTypeId,
        locationId,
        batchId: batch._id,
        transactionType: "reserve",
        quantity: toReserve,
        unitCostAtTime: batch.unitCostIdr,
        orderId: args.orderId,
        referenceNote: `Reserved for order ${order.orderNumber}`,
        createdBy: "system",
        createdAt: now,
      });

      remaining -= toReserve;
    }

    // Create order reservation record
    await ctx.db.insert("orderComponentReservations", {
      orderId: args.orderId,
      componentTypeId: comp.componentTypeId,
      locationId,
      quantityReserved: comp.quantity,
      quantityConsumed: 0,
      status: "reserved",
      createdAt: now,
    });

    // Update component stock aggregates
    await updateComponentStock(ctx, comp.componentTypeId, locationId);
  }

  return {
    reserved: componentsToReserve.length,
    shortages: [],
  };
}

// ============================================
// Main Mutations (API endpoints)
// ============================================

/**
 * Reserve stock for confirmed order
 *
 * Called when order transitions to "Confirmed" status.
 * Reserves packaging components (not production components).
 *
 * @throws Error if insufficient stock with shortage details
 */
export const reserveStockForOrder = mutation({
  args: {
    orderId: v.id("orders"),
    locationId: v.optional(v.id("storageLocations")),
  },
  handler: async (ctx, args) => {
    return await reserveStockForOrderInternal(ctx, args);
  },
});

/**
 * Internal helper: Consume materials by stage (boxing or labeling).
 * Parameterized to eliminate duplication between boxing and labeling consumption.
 */
async function consumeMaterialsByStageInternal(
  ctx: MutationCtx,
  args: { orderId: Id<"orders"> },
  stage: "boxing" | "labeling"
): Promise<{ consumed: number }> {
  const order = await ctx.db.get(args.orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  // Get reserved components for this order
  const reservations = await ctx.db
    .query("orderComponentReservations")
    .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
    .filter((q) => q.eq(q.field("status"), "reserved"))
    .collect();

  if (reservations.length === 0) {
    return { consumed: 0 };
  }

  let consumedCount = 0;

  for (const reservation of reservations) {
    const componentType = await ctx.db.get(reservation.componentTypeId);
    if (!componentType) continue;

    // Only consume materials matching the specified stage
    if (componentType.consumptionStage !== stage) {
      continue;
    }

    // Consume using FIFO
    const fifoResult = await consumeFromFIFO(
      ctx,
      reservation.componentTypeId,
      reservation.locationId,
      reservation.quantityReserved
    );

    // Apply consumption to batches and create transactions
    await applyFIFOConsumption(
      ctx,
      fifoResult,
      reservation.componentTypeId,
      reservation.locationId,
      args.orderId,
      `Consumed for ${stage} order ${order.orderNumber}`,
      "system"
    );

    // Update reservation status
    await ctx.db.patch(reservation._id, {
      quantityConsumed: reservation.quantityReserved,
      status: "consumed",
      consumedAt: Date.now(),
    });

    // Update component stock aggregates
    await updateComponentStock(
      ctx,
      reservation.componentTypeId,
      reservation.locationId
    );

    consumedCount++;
  }

  return { consumed: consumedCount };
}

/**
 * Internal helper: Consume boxing materials when order transitions to "Boxed"
 */
export async function consumeBoxingMaterialsInternal(
  ctx: MutationCtx,
  args: { orderId: Id<"orders"> }
): Promise<{ consumed: number }> {
  return await consumeMaterialsByStageInternal(ctx, args, "boxing");
}

/**
 * Consume boxing materials when order transitions to "Boxed"
 */
export const consumeBoxingMaterials = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    return await consumeBoxingMaterialsInternal(ctx, args);
  },
});

/**
 * Internal helper: Consume sticker materials when order transitions to "Labeled"
 */
export async function consumeStickerMaterialsInternal(
  ctx: MutationCtx,
  args: { orderId: Id<"orders"> }
): Promise<{ consumed: number }> {
  return await consumeMaterialsByStageInternal(ctx, args, "labeling");
}

/**
 * Consume sticker materials when order transitions to "Labeled"
 */
export const consumeStickerMaterials = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    return await consumeStickerMaterialsInternal(ctx, args);
  },
});

/**
 * Internal helper: Release reserved stock when order is cancelled
 * Used by statusUpdates.ts and other ctx-dependent code
 */
export async function releaseReservationInternal(
  ctx: MutationCtx,
  args: { orderId: Id<"orders"> }
): Promise<{ released: number }> {
  const order = await ctx.db.get(args.orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  // Get all reservations for this order
  const reservations = await ctx.db
    .query("orderComponentReservations")
    .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
    .filter((q) => q.eq(q.field("status"), "reserved"))
    .collect();

  if (reservations.length === 0) {
    // No active reservations
    return { released: 0 };
  }

  const now = Date.now();
  let releasedCount = 0;

  for (const reservation of reservations) {
    // Get batches for this component (FIFO order)
    const batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_fifo", (q) =>
        q
          .eq("componentTypeId", reservation.componentTypeId)
          .eq("locationId", reservation.locationId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Sort by purchase date (oldest first)
    batches.sort((a, b) => a.purchaseDate - b.purchaseDate);

    // Unreserve from batches FIFO (same order as reservation)
    let remaining = reservation.quantityReserved;

    for (const batch of batches) {
      if (remaining <= 0) break;
      if (batch.quantityReserved <= 0) continue;

      const toUnreserve = Math.min(remaining, batch.quantityReserved);

      // Update batch reservation
      await ctx.db.patch(batch._id, {
        quantityReserved: batch.quantityReserved - toUnreserve,
      });

      // Create transaction record
      await ctx.db.insert("componentTransactions", {
        componentTypeId: reservation.componentTypeId,
        locationId: reservation.locationId,
        batchId: batch._id,
        transactionType: "unreserve",
        quantity: toUnreserve,
        unitCostAtTime: batch.unitCostIdr,
        orderId: args.orderId,
        referenceNote: `Released from cancelled order ${order.orderNumber}`,
        createdBy: "system",
        createdAt: now,
      });

      remaining -= toUnreserve;
    }

    // Update reservation status
    await ctx.db.patch(reservation._id, {
      status: "released",
    });

    // Update component stock aggregates
    await updateComponentStock(
      ctx,
      reservation.componentTypeId,
      reservation.locationId
    );

    releasedCount++;
  }

  return { released: releasedCount };
}

/**
 * Release reserved stock when order is cancelled
 *
 * Unreserves all components and returns stock to available.
 * Creates unreserve transaction records.
 */
export const releaseReservation = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    return await releaseReservationInternal(ctx, args);
  },
});
