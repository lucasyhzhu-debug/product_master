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
 *   3. Increment productionCounts.shippedToGoldfinch
 *
 * For stickers:
 *   4. Consume from Office FIFO, create batches at Goldfinch
 *   5. Update componentStock for both locations
 */
export const recordShipment = mutation({
  args: {
    token: v.string(),
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

    // Find Goldfinch location
    const goldfinchLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_type", (q) => q.eq("locationType", "venue"))
      .filter((q) => q.eq(q.field("isActive"), true))
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
      const existingStock = await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) =>
          q.eq("menuProductId", item.menuProductId)
        )
        .first();

      if (existingStock) {
        await ctx.db.patch(existingStock._id, {
          quantity: existingStock.quantity + item.quantity,
          lastUpdated: now,
        });
      } else {
        await ctx.db.insert("gofoodDepotStock", {
          menuProductId: item.menuProductId,
          quantity: item.quantity,
          lastUpdated: now,
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

      // 3. Update productionCounts.shippedToGoldfinch
      const prodCount = await ctx.db
        .query("productionCounts")
        .withIndex("by_menu_product", (q) =>
          q.eq("menuProductId", item.menuProductId)
        )
        .first();

      if (prodCount) {
        await ctx.db.patch(prodCount._id, {
          shippedToGoldfinch:
            (prodCount.shippedToGoldfinch ?? 0) + item.quantity,
        });
      }

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
    items: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find Goldfinch location
    const goldfinchLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_type", (q) => q.eq("locationType", "venue"))
      .filter((q) => q.eq(q.field("isActive"), true))
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
      const depotStock = await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) =>
          q.eq("menuProductId", item.menuProductId)
        )
        .first();

      if (depotStock) {
        await ctx.db.patch(depotStock._id, {
          quantity: depotStock.quantity - item.quantity,
          lastUpdated: now,
        });
      } else {
        // No stock record yet — create with negative (debt)
        await ctx.db.insert("gofoodDepotStock", {
          menuProductId: item.menuProductId,
          quantity: -item.quantity,
          lastUpdated: now,
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
          // Insufficient stickers — record deficit
          const currentStock = await ctx.db
            .query("gofoodDepotStock")
            .withIndex("by_menuProduct", (q) =>
              q.eq("menuProductId", item.menuProductId)
            )
            .first();

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

      // 4. Increment productionCounts.stickered
      const prodCount = await ctx.db
        .query("productionCounts")
        .withIndex("by_menu_product", (q) =>
          q.eq("menuProductId", item.menuProductId)
        )
        .first();

      if (prodCount) {
        await ctx.db.patch(prodCount._id, {
          stickered: prodCount.stickered + item.quantity,
        });
      }

      // 5. Write production log entry
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
 */
export const adjustDepotStock = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    newQuantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

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
