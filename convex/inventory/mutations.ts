/**
 * Inventory Mutations
 *
 * Stock operations: receive, transfer, adjust, consume.
 * All mutations include negative stock validation and transaction logging.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { consumeFromFIFO, applyFIFOConsumption } from "./fifo";
import { updateComponentStock, validateStockAdjustment } from "./helpers";

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

    // Calculate unit cost
    const unitCostIdr = args.totalCostIdr / args.quantityPurchased;

    // Create batch
    const batchId = await ctx.db.insert("inventoryBatches", {
      componentTypeId: args.componentTypeId,
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

    // Create new batch at destination with weighted average cost
    const batchId = await ctx.db.insert("inventoryBatches", {
      componentTypeId: args.componentTypeId,
      locationId: args.toLocationId,
      purchaseDate: Date.now(),
      supplierName: `Transfer from ${fromLocation.name}`,
      supplierBrand: undefined,
      purchaseReference: transferId,
      purchaseUrl: undefined,
      quantityPurchased: args.quantity,
      totalCostIdr: fifoResult.totalCost,
      unitCostIdr: fifoResult.averageCost,
      quantityRemaining: args.quantity,
      quantityReserved: 0,
      status: "active",
      expiryDate: undefined,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    // Create transfer_in transaction
    await ctx.db.insert("componentTransactions", {
      componentTypeId: args.componentTypeId,
      locationId: args.toLocationId,
      batchId,
      transactionType: "transfer_in",
      quantity: args.quantity,
      unitCostAtTime: fifoResult.averageCost,
      transferId,
      referenceNote: args.referenceNote,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

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

    // Update batch
    await ctx.db.patch(args.batchId, {
      quantityRemaining: args.newQuantity,
      status: args.newQuantity === 0 ? "depleted" : "active",
    });

    // Create transaction record
    await ctx.db.insert("componentTransactions", {
      componentTypeId: batch.componentTypeId,
      locationId: batch.locationId,
      batchId: args.batchId,
      transactionType: "adjust",
      quantity: quantityDelta,
      unitCostAtTime: batch.unitCostIdr,
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
