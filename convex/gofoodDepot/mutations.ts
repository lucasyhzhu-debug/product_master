/**
 * GoFood Depot (Goldfinch) Mutations
 *
 * Handles shipment recording, sale processing, and stock adjustments
 * for the Goldfinch depot where GoFood orders are fulfilled.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { consumeFromFIFO, applyFIFOConsumption } from "../inventory/fifo";
import { updateComponentStock } from "../inventory/helpers";

/**
 * Record a shipment of products + stickers from Office to Goldfinch.
 *
 * Auth: kitchen, order_staff, manager, admin
 *
 * For each product:
 *   1. Increment gofoodDepotStock.quantity
 *   2. Insert gofoodDepotShipments record
 *   3. Log ship_goldfinch to productionLog (INFRA-03)
 *
 * For stickers:
 *   4. Consume from Office FIFO, create batches at Goldfinch
 *   5. Update componentStock for both locations
 */
export const recordShipment = mutation({
  args: {
    token: v.string(),
    // Phase 19: Optional outletId for per-outlet depot stock tracking
    outletId: v.optional(v.id("externalOutlets")),
    items: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        quantity: v.number(), // Boxes to ship
        stickerTransfers: v.optional(
          v.array(
            v.object({
              componentTypeId: v.id("componentTypes"),
              quantity: v.number(),
            })
          )
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen",
      "order_staff",
      "manager",
      "admin",
    ]);
    const now = Date.now();
    const today = new Date(now + 7 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10); // WIB date

    // Find Goldfinch location (MIS-03: compound index)
    const goldfinchLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_type_active", (q) => q.eq("locationType", "venue").eq("isActive", true))
      .first();

    if (!goldfinchLocation) {
      throw new Error("Goldfinch storage location not found");
    }

    // Find Office (default) location
    const officeLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();

    if (!officeLocation) {
      throw new Error("Office storage location not found");
    }

    let totalBoxes = 0;
    let totalStickers = 0;

    for (const item of args.items) {
      if (item.quantity <= 0) {
        throw new Error("Quantity must be positive");
      }

      // Validate menu product exists
      const menuProduct = await ctx.db.get(item.menuProductId);
      if (!menuProduct) {
        throw new Error(`Menu product not found: ${item.menuProductId}`);
      }

      // 1. Update gofoodDepotStock (read-then-patch for OCC safety)
      // When outletId provided, use by_outlet_product index for per-outlet tracking
      let existingStock;
      if (args.outletId) {
        existingStock = await ctx.db
          .query("gofoodDepotStock")
          .withIndex("by_outlet_product", (q) =>
            q.eq("outletId", args.outletId).eq("menuProductId", item.menuProductId)
          )
          .first();
      } else {
        existingStock = await ctx.db
          .query("gofoodDepotStock")
          .withIndex("by_menuProduct", (q) =>
            q.eq("menuProductId", item.menuProductId)
          )
          .first();
      }

      if (existingStock) {
        await ctx.db.patch(existingStock._id, {
          quantity: existingStock.quantity + item.quantity,
          lastUpdated: now,
          ...(args.outletId !== undefined && { outletId: args.outletId }),
        });
      } else {
        await ctx.db.insert("gofoodDepotStock", {
          menuProductId: item.menuProductId,
          quantity: item.quantity,
          lastUpdated: now,
          ...(args.outletId !== undefined && { outletId: args.outletId }),
        });
      }

      // 2. Insert shipment record
      const stickerCount =
        item.stickerTransfers?.reduce((sum, s) => sum + s.quantity, 0) ?? 0;

      await ctx.db.insert("gofoodDepotShipments", {
        date: today,
        menuProductId: item.menuProductId,
        quantity: item.quantity,
        stickersTransferred: stickerCount,
        shippedBy: user.name,
        timestamp: now,
      });

      // 3. Log shipment to productionLog (replaces productionCounts.shippedToGoldfinch write)
      await ctx.db.insert("productionLog", {
        menuProductId: item.menuProductId,
        action: "ship_goldfinch",
        quantity: item.quantity,
        timestamp: now,
        performedBy: user.name,
      });

      // 4. Transfer stickers from Office to Goldfinch via FIFO
      if (item.stickerTransfers) {
        for (const sticker of item.stickerTransfers) {
          if (sticker.quantity <= 0) continue;

          try {
            // Consume from Office FIFO
            const fifoResult = await consumeFromFIFO(
              ctx,
              sticker.componentTypeId,
              officeLocation._id,
              sticker.quantity
            );

            // Apply consumption to Office batches
            await applyFIFOConsumption(
              ctx,
              fifoResult,
              sticker.componentTypeId,
              officeLocation._id,
              undefined,
              `Goldfinch shipment ${today}`,
              user.name
            );

            // Create destination batches at Goldfinch
            for (const consumption of fifoResult.consumptions) {
              const sourceBatch = await ctx.db.get(consumption.batchId);

              await ctx.db.insert("inventoryBatches", {
                componentTypeId: sticker.componentTypeId,
                locationId: goldfinchLocation._id,
                purchaseDate: sourceBatch?.purchaseDate ?? now,
                supplierName:
                  sourceBatch?.supplierName ?? "Transfer from Office",
                supplierBrand: sourceBatch?.supplierBrand,
                purchaseReference: `SHIP-GF-${today}`,
                purchaseUrl: sourceBatch?.purchaseUrl,
                quantityPurchased: consumption.quantity,
                totalCostIdr: consumption.totalCost,
                unitCostIdr: consumption.unitCost,
                quantityRemaining: consumption.quantity,
                quantityReserved: 0,
                status: "active",
                expiryDate: sourceBatch?.expiryDate,
                createdBy: user.name,
                createdAt: now,
              });

              // Transaction record for transfer_in at Goldfinch
              await ctx.db.insert("componentTransactions", {
                componentTypeId: sticker.componentTypeId,
                locationId: goldfinchLocation._id,
                batchId: consumption.batchId,
                transactionType: "transfer_in",
                quantity: consumption.quantity,
                unitCostAtTime: consumption.unitCost,
                referenceNote: `Goldfinch shipment ${today}`,
                createdBy: user.name,
                createdAt: now,
              });
            }

            // Update componentStock for both locations
            await updateComponentStock(
              ctx,
              sticker.componentTypeId,
              officeLocation._id
            );
            await updateComponentStock(
              ctx,
              sticker.componentTypeId,
              goldfinchLocation._id
            );

            totalStickers += sticker.quantity;
          } catch (err) {
            // If insufficient stickers, still proceed with product shipment
            console.log(
              `Warning: sticker transfer failed for ${sticker.componentTypeId}:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }
      }

      totalBoxes += item.quantity;
    }

    return { totalBoxes, totalStickers };
  },
});

/**
 * Process multiple GoFood sales from GoBiz sync (Phase C).
 * Internal mutation — only callable from server-side actions.
 *
 * For each sale item:
 *   1. Look up labeling-stage sticker components for the menu product
 *   2. Consume stickers from Goldfinch FIFO (deficit-tolerant)
 *   3. Decrement gofoodDepotStock.quantity
 *   4. Write productionLog entry
 */
export const processSyncSales = internalMutation({
  args: {
    // Phase 19: Optional outletId for per-outlet depot stock tracking
    outletId: v.optional(v.id("externalOutlets")),
    items: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find Goldfinch location (MIS-03: compound index)
    const goldfinchLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_type_active", (q) => q.eq("locationType", "venue").eq("isActive", true))
      .first();

    if (!goldfinchLocation) {
      console.log("Warning: Goldfinch location not found, skipping Phase C");
      return { processed: 0, deficits: 0 };
    }

    let processed = 0;
    let deficits = 0;

    for (const item of args.items) {
      if (item.quantity <= 0) continue;

      // 1. Decrement depot stock (can go negative = debt)
      // When outletId provided, use by_outlet_product index for per-outlet tracking
      let depotStock;
      if (args.outletId) {
        depotStock = await ctx.db
          .query("gofoodDepotStock")
          .withIndex("by_outlet_product", (q) =>
            q.eq("outletId", args.outletId).eq("menuProductId", item.menuProductId)
          )
          .first();
      } else {
        depotStock = await ctx.db
          .query("gofoodDepotStock")
          .withIndex("by_menuProduct", (q) =>
            q.eq("menuProductId", item.menuProductId)
          )
          .first();
      }

      if (depotStock) {
        await ctx.db.patch(depotStock._id, {
          quantity: depotStock.quantity - item.quantity,
          lastUpdated: now,
          ...(args.outletId !== undefined && { outletId: args.outletId }),
        });
      } else {
        // No stock record yet — create with negative (debt)
        await ctx.db.insert("gofoodDepotStock", {
          menuProductId: item.menuProductId,
          quantity: -item.quantity,
          lastUpdated: now,
          ...(args.outletId !== undefined && { outletId: args.outletId }),
        });
      }

      // 2. Look up labeling-stage sticker components for this product
      const menuProductComponents = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) =>
          q.eq("menuProductId", item.menuProductId)
        )
        .collect();

      for (const mpc of menuProductComponents) {
        // Determine effective consumption stage
        const componentType = await ctx.db.get(mpc.componentTypeId);
        if (!componentType) continue;

        const effectiveStage =
          mpc.consumptionStage ?? componentType.consumptionStage;
        if (effectiveStage !== "labeling") continue;
        if (componentType.category !== "packaging") continue;

        const stickerQty = item.quantity * mpc.quantity;

        // 3. Consume stickers from Goldfinch FIFO (deficit-tolerant)
        try {
          const fifoResult = await consumeFromFIFO(
            ctx,
            mpc.componentTypeId,
            goldfinchLocation._id,
            stickerQty
          );

          await applyFIFOConsumption(
            ctx,
            fifoResult,
            mpc.componentTypeId,
            goldfinchLocation._id,
            undefined,
            "auto:gobiz-sale",
            "system"
          );

          await updateComponentStock(
            ctx,
            mpc.componentTypeId,
            goldfinchLocation._id
          );
        } catch {
          // Insufficient stickers — record deficit on the current depot stock row
          let currentStock;
          if (args.outletId) {
            currentStock = await ctx.db
              .query("gofoodDepotStock")
              .withIndex("by_outlet_product", (q) =>
                q.eq("outletId", args.outletId).eq("menuProductId", item.menuProductId)
              )
              .first();
          } else {
            currentStock = await ctx.db
              .query("gofoodDepotStock")
              .withIndex("by_menuProduct", (q) =>
                q.eq("menuProductId", item.menuProductId)
              )
              .first();
          }

          if (currentStock) {
            await ctx.db.patch(currentStock._id, {
              stickerDeficit:
                (currentStock.stickerDeficit ?? 0) + stickerQty,
              lastUpdated: now,
            });
          }

          deficits++;

          // Try to consume whatever is available
          try {
            const batches = await ctx.db
              .query("inventoryBatches")
              .withIndex("by_fifo", (q) =>
                q
                  .eq("componentTypeId", mpc.componentTypeId)
                  .eq("locationId", goldfinchLocation._id)
              )
              .filter((q) => q.eq(q.field("status"), "active"))
              .collect();

            const available = batches.reduce(
              (sum, b) => sum + (b.quantityRemaining - b.quantityReserved),
              0
            );

            if (available > 0) {
              const partialResult = await consumeFromFIFO(
                ctx,
                mpc.componentTypeId,
                goldfinchLocation._id,
                Math.min(available, stickerQty)
              );

              await applyFIFOConsumption(
                ctx,
                partialResult,
                mpc.componentTypeId,
                goldfinchLocation._id,
                undefined,
                "auto:gobiz-sale (partial)",
                "system"
              );

              await updateComponentStock(
                ctx,
                mpc.componentTypeId,
                goldfinchLocation._id
              );
            }
          } catch {
            // No stock at all — deficit already recorded
          }
        }
      }

      // 4. Write production log entry (replaces productionCounts.stickered increment)
      await ctx.db.insert("productionLog", {
        menuProductId: item.menuProductId,
        action: "sticker",
        quantity: item.quantity,
        timestamp: now,
        performedBy: "system",
        note: "auto:gobiz-sale",
      });

      processed++;
    }

    return { processed, deficits };
  },
});

/**
 * Record a single GoFood sale (for manual testing/debugging).
 * Internal mutation — not callable from frontend.
 */
export const recordSale = internalMutation({
  args: {
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    // Delegate to processSyncSales with a single item
    return await ctx.db
      .query("gofoodDepotStock")
      .withIndex("by_menuProduct", (q) =>
        q.eq("menuProductId", args.menuProductId)
      )
      .first()
      .then(async (depotStock) => {
        const now = Date.now();

        // Decrement depot stock
        if (depotStock) {
          await ctx.db.patch(depotStock._id, {
            quantity: depotStock.quantity - args.quantity,
            lastUpdated: now,
          });
        } else {
          await ctx.db.insert("gofoodDepotStock", {
            menuProductId: args.menuProductId,
            quantity: -args.quantity,
            lastUpdated: now,
          });
        }

        return { success: true };
      });
  },
});

/**
 * Manually adjust depot stock (manager/admin only).
 * Used for physical count corrections.
 *
 * When outletId is provided, writes to productInventory at the outlet's
 * linkedStorageLocationId (single source of truth for multi-outlet flow).
 * Falls back to legacy gofoodDepotStock when outletId is omitted.
 */
export const adjustDepotStock = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    outletId: v.optional(v.id("externalOutlets")),
    newQuantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    if (args.outletId) {
      // Single source of truth: write to productInventory at outlet's linked location
      const outlet = await ctx.db.get(args.outletId);
      if (!outlet?.linkedStorageLocationId) {
        throw new Error("Outlet has no linked storage location");
      }
      const locationId = outlet.linkedStorageLocationId;

      const existing = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", args.menuProductId).eq("locationId", locationId)
        )
        .first();

      const previousQuantity = existing?.quantity ?? 0;

      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: args.newQuantity,
          lastUpdated: now,
        });
      } else {
        await ctx.db.insert("productInventory", {
          menuProductId: args.menuProductId,
          locationId,
          quantity: args.newQuantity,
          lastUpdated: now,
        });
      }

      // Log transaction
      await ctx.db.insert("productInventoryTransactions", {
        menuProductId: args.menuProductId,
        locationId,
        transactionType: "adjust",
        quantity: args.newQuantity - previousQuantity,
        previousQuantity,
        newQuantity: args.newQuantity,
        reason: args.reason,
        performedBy: user.name,
        createdAt: now,
      });

      return { success: true };
    }

    // Legacy path: adjust gofoodDepotStock (old single-Goldfinch flow)
    const existingStock = await ctx.db
      .query("gofoodDepotStock")
      .withIndex("by_menuProduct", (q) =>
        q.eq("menuProductId", args.menuProductId)
      )
      .first();

    if (existingStock) {
      await ctx.db.patch(existingStock._id, {
        quantity: args.newQuantity,
        lastUpdated: now,
      });
    } else {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: args.menuProductId,
        quantity: args.newQuantity,
        lastUpdated: now,
      });
    }

    return { success: true };
  },
});

/**
 * Save (upsert) per-outlet product mappings (GF-02).
 *
 * Auth: admin only
 *
 * For each mapping in args.mappings:
 *   - If a row exists for (outletId, externalProductName): patch it
 *   - If not: insert a new row
 *
 * This is an explicit-save pattern (not auto-save).
 */
export const saveOutletProductMappings = mutation({
  args: {
    token: v.string(),
    outletId: v.id("externalOutlets"),
    mappings: v.array(
      v.object({
        externalProductName: v.string(),
        menuProductId: v.optional(v.id("menuProducts")),
        isActive: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const mapping of args.mappings) {
      const existing = await ctx.db
        .query("gofoodOutletProductMappings")
        .withIndex("by_outlet_product", (q) =>
          q
            .eq("outletId", args.outletId)
            .eq("externalProductName", mapping.externalProductName)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          menuProductId: mapping.menuProductId,
          isActive: mapping.isActive,
          updatedAt: now,
        });
        updated++;
      } else {
        await ctx.db.insert("gofoodOutletProductMappings", {
          outletId: args.outletId,
          externalProductName: mapping.externalProductName,
          menuProductId: mapping.menuProductId,
          isActive: mapping.isActive,
          createdBy: user.name,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }

    return { created, updated, total: created + updated };
  },
});

/**
 * Initialize a new outlet's product mappings from the most recently configured outlet (GF-02).
 *
 * Auth: admin only
 *
 * If the target outlet already has mappings, this is a no-op (returns 0).
 * Otherwise, finds the other GoBiz outlet with the most recent mapping updatedAt
 * and copies its mappings (externalProductName -> menuProductId links) to the new outlet.
 *
 * This supports: "New depot auto-populated silently with previous depot's mapping."
 */
export const initOutletMappingsFromPrevious = mutation({
  args: {
    token: v.string(),
    outletId: v.id("externalOutlets"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    const now = Date.now();

    // 1. Check if this outlet already has mappings -- if so, bail out
    const existingMappings = await ctx.db
      .query("gofoodOutletProductMappings")
      .withIndex("by_outlet", (q) => q.eq("outletId", args.outletId))
      .first();

    if (existingMappings) {
      return { copied: 0, skipped: true };
    }

    // 2. Find all GoBiz outlets (except this one)
    const allGobizOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .collect();

    const otherOutlets = allGobizOutlets.filter(
      (o) => o._id !== args.outletId
    );

    if (otherOutlets.length === 0) {
      return { copied: 0, skipped: false };
    }

    // 3. For each other outlet, find the most recent mapping updatedAt
    let bestOutletId: string | null = null;
    let bestUpdatedAt = 0;

    for (const outlet of otherOutlets) {
      const latestMapping = await ctx.db
        .query("gofoodOutletProductMappings")
        .withIndex("by_outlet", (q) => q.eq("outletId", outlet._id))
        .order("desc")
        .first();

      if (latestMapping && latestMapping.updatedAt > bestUpdatedAt) {
        bestUpdatedAt = latestMapping.updatedAt;
        bestOutletId = outlet._id as string;
      }
    }

    if (!bestOutletId) {
      return { copied: 0, skipped: false };
    }

    // 4. Copy all mappings from the best outlet to this outlet
    const sourceMappings = await ctx.db
      .query("gofoodOutletProductMappings")
      .withIndex("by_outlet", (q) => q.eq("outletId", bestOutletId as any))
      .collect();

    let copied = 0;
    for (const src of sourceMappings) {
      await ctx.db.insert("gofoodOutletProductMappings", {
        outletId: args.outletId,
        externalProductName: src.externalProductName,
        menuProductId: src.menuProductId,
        isActive: src.isActive,
        createdBy: user.name,
        createdAt: now,
        updatedAt: now,
      });
      copied++;
    }

    return { copied, skipped: false };
  },
});
