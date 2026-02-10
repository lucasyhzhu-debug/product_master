/**
 * Inventory Mutations
 *
 * Stock operations: receive, transfer, adjust, consume.
 * All mutations include negative stock validation and transaction logging.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { consumeFromFIFO, applyFIFOConsumption } from "./fifo";
import { updateComponentStock } from "./helpers";

/**
 * Create component and receive stock (combined operation)
 *
 * Creates a new packaging component type on first receipt.
 * Used by Receive Stock dialog for inline component creation.
 */
export const createComponentAndReceiveStock = mutation({
  args: {
    // New component details
    code: v.string(),
    name: v.string(),
    category: v.union(
      v.literal("packaging"),
      v.literal("direct_packaging"),   // Legacy compat
      v.literal("indirect_packaging")  // Legacy compat
    ),
    unit: v.string(),
    reorderPoint: v.optional(v.number()),
    consumptionStage: v.optional(v.union(
      v.literal("production"),
      v.literal("boxing"),
      v.literal("labeling"),
      v.literal("none")
    )),
    color: v.optional(v.string()),
    // Receipt details (same as receiveStock)
    locationId: v.id("storageLocations"),
    purchaseDate: v.number(),
    supplierName: v.string(),
    supplierBrand: v.optional(v.string()),
    purchaseReference: v.optional(v.string()),
    purchaseUrl: v.optional(v.string()),
    quantityPurchased: v.number(),
    totalCostIdr: v.number(),
    expiryDate: v.optional(v.number()),
    referenceNote: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if component code already exists
    const existing = await ctx.db
      .query("componentTypes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (existing) {
      throw new Error(`Component with code "${args.code}" already exists`);
    }

    // Validate location exists
    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }

    // Get max sortOrder for new component
    const allComponents = await ctx.db.query("componentTypes").collect();
    const maxSort = Math.max(...allComponents.map((c) => c.sortOrder), 0);

    // Map legacy category values to canonical value
    const category: "packaging" = "packaging";

    // Create component type (NO unitCostIdr - comes from batches!)
    const componentId = await ctx.db.insert("componentTypes", {
      code: args.code,
      name: args.name,
      category,
      unitCostIdr: 0, // Placeholder - will be calculated from batches
      unit: args.unit,
      gramsPerUnit: undefined, // Packaging doesn't need grams
      trackInventory: true, // Always true for packaging
      reorderPoint: args.reorderPoint,
      reorderQuantity: undefined,
      consumptionStage: args.consumptionStage ?? "boxing",
      color: args.color,
      sortOrder: maxSort + 1,
      isActive: true,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Calculate unit cost for this batch
    const unitCostIdr = args.totalCostIdr / args.quantityPurchased;

    // Create batch
    const batchId = await ctx.db.insert("inventoryBatches", {
      componentTypeId: componentId,
      locationId: args.locationId,
      purchaseDate: args.purchaseDate,
      supplierName: args.supplierName,
      supplierBrand: args.supplierBrand,
      purchaseReference: args.purchaseReference,
      purchaseUrl: args.purchaseUrl,
      quantityPurchased: args.quantityPurchased,
      totalCostIdr: args.totalCostIdr,
      unitCostIdr,
      quantityRemaining: args.quantityPurchased,
      quantityReserved: 0,
      status: "active",
      expiryDate: args.expiryDate,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Create transaction record
    await ctx.db.insert("componentTransactions", {
      componentTypeId: componentId,
      locationId: args.locationId,
      batchId,
      transactionType: "receive",
      quantity: args.quantityPurchased,
      unitCostAtTime: unitCostIdr,
      referenceNote: args.referenceNote,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Update component stock aggregates
    await updateComponentStock(ctx, componentId, args.locationId);

    // Set lastRestockTotalStock baseline (for percentage alerts)
    const stockRecord = await ctx.db
      .query("componentStock")
      .withIndex("by_component_location", (q) =>
        q.eq("componentTypeId", componentId).eq("locationId", args.locationId)
      )
      .first();

    if (stockRecord) {
      await ctx.db.patch(stockRecord._id, {
        lastRestockTotalStock: stockRecord.totalStock,
      });
    }

    return { componentId, batchId };
  },
});

/**
 * Receive stock - Create new batch with supplier info
 *
 * Creates a new inventory batch and updates componentStock aggregates.
 * This is the primary way to add stock to the system.
 */
export const receiveStock = mutation({
  args: {
    componentTypeId: v.id("componentTypes"),
    locationId: v.id("storageLocations"),
    // Purchase details
    purchaseDate: v.number(),
    supplierName: v.string(),
    supplierBrand: v.optional(v.string()),
    purchaseReference: v.optional(v.string()),
    purchaseUrl: v.optional(v.string()),
    // Quantities and costs
    quantityPurchased: v.number(),
    totalCostIdr: v.number(),
    // Optional
    expiryDate: v.optional(v.number()),
    referenceNote: v.optional(v.string()),
    createdBy: v.string(),
    // Copy supplier fields from existing batch
    copyFromBatchId: v.optional(v.id("inventoryBatches")),
  },
  handler: async (ctx, args) => {
    // Validate component exists
    const component = await ctx.db.get(args.componentTypeId);
    if (!component) {
      throw new Error("Component not found");
    }

    // Validate location exists
    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }

    // Validate quantity is positive
    if (args.quantityPurchased <= 0) {
      throw new Error("Quantity must be positive");
    }

    // If copyFromBatchId provided, pre-fill supplier fields
    let supplierName = args.supplierName;
    let supplierBrand = args.supplierBrand;
    let purchaseReference = args.purchaseReference;
    let purchaseUrl = args.purchaseUrl;

    if (args.copyFromBatchId) {
      const sourceBatch = await ctx.db.get(args.copyFromBatchId);
      if (sourceBatch) {
        supplierName = supplierName || sourceBatch.supplierName;
        supplierBrand = supplierBrand || sourceBatch.supplierBrand;
        purchaseReference = purchaseReference || sourceBatch.purchaseReference;
        purchaseUrl = purchaseUrl || sourceBatch.purchaseUrl;
      }
    }

    // Calculate unit cost
    const unitCostIdr = args.totalCostIdr / args.quantityPurchased;

    // Create batch
    const batchId = await ctx.db.insert("inventoryBatches", {
      componentTypeId: args.componentTypeId,
      locationId: args.locationId,
      purchaseDate: args.purchaseDate,
      supplierName,
      supplierBrand,
      purchaseReference,
      purchaseUrl,
      quantityPurchased: args.quantityPurchased,
      totalCostIdr: args.totalCostIdr,
      unitCostIdr,
      quantityRemaining: args.quantityPurchased,
      quantityReserved: 0,
      status: "active",
      expiryDate: args.expiryDate,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Create transaction record
    await ctx.db.insert("componentTransactions", {
      componentTypeId: args.componentTypeId,
      locationId: args.locationId,
      batchId,
      transactionType: "receive",
      quantity: args.quantityPurchased,
      unitCostAtTime: unitCostIdr,
      referenceNote: args.referenceNote,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Update component stock aggregates
    await updateComponentStock(ctx, args.componentTypeId, args.locationId);

    // Set lastRestockTotalStock baseline (for percentage alerts)
    const stockRecord = await ctx.db
      .query("componentStock")
      .withIndex("by_component_location", (q) =>
        q.eq("componentTypeId", args.componentTypeId).eq("locationId", args.locationId)
      )
      .first();

    if (stockRecord) {
      await ctx.db.patch(stockRecord._id, {
        lastRestockTotalStock: stockRecord.totalStock,
      });
    }

    return batchId;
  },
});

/**
 * Transfer stock between locations
 *
 * Creates transaction records on both sides (transfer_out and transfer_in).
 * Uses FIFO to consume from source location.
 */
export const transferStock = mutation({
  args: {
    componentTypeId: v.id("componentTypes"),
    fromLocationId: v.id("storageLocations"),
    toLocationId: v.id("storageLocations"),
    quantity: v.number(),
    referenceNote: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate locations exist
    const fromLocation = await ctx.db.get(args.fromLocationId);
    const toLocation = await ctx.db.get(args.toLocationId);
    if (!fromLocation || !toLocation) {
      throw new Error("Location not found");
    }

    // Validate quantity
    if (args.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }

    // Generate transfer ID for linking
    const transferId = `TRANSFER-${Date.now()}`;

    // Consume from source using FIFO
    const fifoResult = await consumeFromFIFO(
      ctx,
      args.componentTypeId,
      args.fromLocationId,
      args.quantity
    );

    // Apply FIFO consumption to source batches
    await applyFIFOConsumption(
      ctx,
      fifoResult,
      args.componentTypeId,
      args.fromLocationId,
      undefined,
      `${args.referenceNote || ""} [Transfer ${transferId}]`,
      args.createdBy
    );

    // Update source location stock
    await updateComponentStock(ctx, args.componentTypeId, args.fromLocationId);

    // Create per-batch copies at destination, preserving original supplier details
    for (const consumption of fifoResult.consumptions) {
      const sourceBatch = await ctx.db.get(consumption.batchId);

      const destBatchId = await ctx.db.insert("inventoryBatches", {
        componentTypeId: args.componentTypeId,
        locationId: args.toLocationId,
        purchaseDate: sourceBatch?.purchaseDate ?? Date.now(),
        supplierName: sourceBatch?.supplierName ?? `Transfer from ${fromLocation.name}`,
        supplierBrand: sourceBatch?.supplierBrand,
        purchaseReference: transferId,
        purchaseUrl: sourceBatch?.purchaseUrl,
        quantityPurchased: consumption.quantity,
        totalCostIdr: consumption.totalCost,
        unitCostIdr: consumption.unitCost,
        quantityRemaining: consumption.quantity,
        quantityReserved: 0,
        status: "active",
        expiryDate: sourceBatch?.expiryDate,
        createdBy: args.createdBy,
        createdAt: Date.now(),
      });

      await ctx.db.insert("componentTransactions", {
        componentTypeId: args.componentTypeId,
        locationId: args.toLocationId,
        batchId: destBatchId,
        transactionType: "transfer_in",
        quantity: consumption.quantity,
        unitCostAtTime: consumption.unitCost,
        transferId,
        referenceNote: args.referenceNote,
        createdBy: args.createdBy,
        createdAt: Date.now(),
      });
    }

    // Update destination location stock
    await updateComponentStock(ctx, args.componentTypeId, args.toLocationId);

    return transferId;
  },
});

/**
 * Adjust stock - Physical count adjustment
 *
 * Adjusts a specific batch quantity with validation.
 * Used for physical inventory counts and corrections.
 */
export const adjustStock = mutation({
  args: {
    batchId: v.id("inventoryBatches"),
    newQuantity: v.number(),
    newTotalCost: v.optional(v.number()),
    reason: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }

    // Validate new quantity
    if (args.newQuantity < 0) {
      throw new Error("New quantity cannot be negative");
    }

    if (args.newQuantity < batch.quantityReserved) {
      throw new Error(
        `New quantity (${args.newQuantity}) cannot be less than reserved quantity (${batch.quantityReserved})`
      );
    }

    const quantityDelta = args.newQuantity - batch.quantityRemaining;

    // Also update quantityPurchased when adjusting UP (prevents "150/100" display)
    const newQuantityPurchased = args.newQuantity > batch.quantityPurchased
      ? args.newQuantity
      : batch.quantityPurchased;

    // Determine totalCostIdr and unitCostIdr
    let totalCostIdr: number;
    let unitCostIdr: number;

    if (args.newTotalCost !== undefined) {
      // Price correction: use the new total cost
      totalCostIdr = args.newTotalCost;
      unitCostIdr = newQuantityPurchased > 0
        ? args.newTotalCost / newQuantityPurchased
        : 0;
    } else if (args.newQuantity > batch.quantityPurchased) {
      // Scale totalCostIdr proportionally at same unit cost when adjusting up
      totalCostIdr = batch.unitCostIdr * args.newQuantity;
      unitCostIdr = batch.unitCostIdr;
    } else {
      totalCostIdr = batch.totalCostIdr;
      unitCostIdr = batch.unitCostIdr;
    }

    // Update batch
    await ctx.db.patch(args.batchId, {
      quantityRemaining: args.newQuantity,
      quantityPurchased: newQuantityPurchased,
      totalCostIdr,
      unitCostIdr,
      status: args.newQuantity === 0 ? "depleted" : "active",
    });

    // Create transaction record
    await ctx.db.insert("componentTransactions", {
      componentTypeId: batch.componentTypeId,
      locationId: batch.locationId,
      batchId: args.batchId,
      transactionType: "adjust",
      quantity: quantityDelta,
      unitCostAtTime: unitCostIdr,
      referenceNote: args.reason,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Update component stock aggregates
    await updateComponentStock(ctx, batch.componentTypeId, batch.locationId);

    return args.batchId;
  },
});

/**
 * Delete batch - WITH reservation protection (Critical Note #4)
 *
 * Cannot delete batches with reserved stock (active orders).
 */
export const deleteBatch = mutation({
  args: {
    batchId: v.id("inventoryBatches"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }

    // Critical Note #4: Prevent deletion if stock is reserved
    if (batch.quantityReserved > 0) {
      throw new Error(
        `Cannot delete batch: ${batch.quantityReserved} units reserved for active orders`
      );
    }

    // Delete batch
    await ctx.db.delete(args.batchId);

    // Update component stock aggregates
    await updateComponentStock(ctx, batch.componentTypeId, batch.locationId);

    return true;
  },
});

/**
 * Mark batch as expired
 *
 * Updates batch status to expired and creates transaction record.
 * Does not delete the batch (audit trail).
 */
export const expireBatch = mutation({
  args: {
    batchId: v.id("inventoryBatches"),
    reason: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }

    // Cannot expire if reserved
    if (batch.quantityReserved > 0) {
      throw new Error(
        `Cannot expire batch: ${batch.quantityReserved} units reserved for active orders`
      );
    }

    // Update batch status
    await ctx.db.patch(args.batchId, {
      status: "expired",
    });

    // Create transaction record
    await ctx.db.insert("componentTransactions", {
      componentTypeId: batch.componentTypeId,
      locationId: batch.locationId,
      batchId: args.batchId,
      transactionType: "expire",
      quantity: -batch.quantityRemaining,
      unitCostAtTime: batch.unitCostIdr,
      referenceNote: args.reason || "Batch expired",
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Update component stock aggregates
    await updateComponentStock(ctx, batch.componentTypeId, batch.locationId);

    return args.batchId;
  },
});
