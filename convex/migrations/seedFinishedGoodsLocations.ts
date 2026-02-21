/**
 * Seed Finished Goods Locations
 *
 * Run from the Convex dashboard Functions tab (under migrations/).
 * Safe to run multiple times (idempotent).
 *
 * This seed:
 * 1. Creates "Tamtem Depot" storage location (locationType: "depot") if not exists
 * 2. Ensures "Legato Goldfinch" venue location exists and is active (reuse, don't duplicate)
 * 3. Links GoFood externalOutlets to storageLocations:
 *    - Crystal (G347061572) -> isDefault=true storageLocation (Office)
 *    - Goldfinch (G293156297) -> "Legato Goldfinch" venue location
 *    - Tamtem (G958262444) -> "Tamtem Depot" depot location
 * 4. Initializes productInventorySettings with defaults if not exists
 */

import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const seedFinishedGoodsLocations = mutation({
  args: {},
  handler: async (ctx) => {
    const log: string[] = [];
    const now = Date.now();

    // ─── Step 1: Ensure Tamtem Depot location exists ───────────────────────────
    let tamtemDepotId;
    const tamtemDepot = await ctx.db
      .query("storageLocations")
      .filter((q) => q.eq(q.field("name"), "Tamtem Depot"))
      .first();

    if (tamtemDepot) {
      tamtemDepotId = tamtemDepot._id;
      log.push(`[SKIP] Tamtem Depot already exists: ${tamtemDepotId}`);
    } else {
      tamtemDepotId = await ctx.db.insert("storageLocations", {
        name: "Tamtem Depot",
        locationType: "depot",
        isActive: true,
        isDefault: false,
        createdBy: "seed",
        createdAt: now,
      });
      log.push(`[CREATE] Tamtem Depot created: ${tamtemDepotId}`);
    }

    // ─── Step 2: Find existing Legato Goldfinch location ──────────────────────
    let goldfinchLocationId;
    const goldfinchLocation = await ctx.db
      .query("storageLocations")
      .filter((q) => q.eq(q.field("name"), "Legato Goldfinch"))
      .first();

    if (goldfinchLocation) {
      goldfinchLocationId = goldfinchLocation._id;
      log.push(`[FOUND] Legato Goldfinch location: ${goldfinchLocationId}`);
      // Ensure it's active
      if (!goldfinchLocation.isActive) {
        await ctx.db.patch(goldfinchLocationId, { isActive: true });
        log.push(`[UPDATE] Legato Goldfinch marked active`);
      }
    } else {
      // Create it if it doesn't exist
      goldfinchLocationId = await ctx.db.insert("storageLocations", {
        name: "Legato Goldfinch",
        locationType: "venue",
        isActive: true,
        isDefault: false,
        createdBy: "seed",
        createdAt: now,
      });
      log.push(`[CREATE] Legato Goldfinch location created: ${goldfinchLocationId}`);
    }

    // ─── Step 3: Find default (Office) storage location ───────────────────────
    const officeLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();

    let officeLocationId = officeLocation?._id;
    if (officeLocationId) {
      log.push(`[FOUND] Default (Office) location: ${officeLocationId}`);
    } else {
      log.push(`[WARN] No default location found — Crystal outlet will not be linked`);
    }

    // ─── Step 4: Link GoFood externalOutlets to storageLocations ──────────────
    const gobizOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .collect();

    log.push(`[INFO] Found ${gobizOutlets.length} GoBiz outlets`);

    const outletMappings: Record<string, { id: string | undefined; name: string }> = {
      G347061572: { id: officeLocationId as string | undefined, name: "Office (Default)" }, // Crystal
      G293156297: { id: goldfinchLocationId as string, name: "Legato Goldfinch" }, // Goldfinch
      G958262444: { id: tamtemDepotId as string, name: "Tamtem Depot" }, // Tamtem
    };

    for (const outlet of gobizOutlets) {
      const mapping = outletMappings[outlet.externalId];
      if (!mapping) {
        log.push(`[SKIP] No mapping for outlet ${outlet.externalId} (${outlet.name})`);
        continue;
      }

      if (!mapping.id) {
        log.push(
          `[SKIP] Target location not found for outlet ${outlet.externalId} (${outlet.name})`
        );
        continue;
      }

      if (outlet.linkedStorageLocationId === mapping.id) {
        log.push(
          `[SKIP] Outlet ${outlet.externalId} (${outlet.name}) already linked to ${mapping.name}`
        );
        continue;
      }

      await ctx.db.patch(outlet._id, {
        linkedStorageLocationId: mapping.id as Id<"storageLocations">,
      });
      log.push(
        `[LINK] ${outlet.name} (${outlet.externalId}) -> ${mapping.name}`
      );
    }

    // ─── Step 5: Initialize productInventorySettings ──────────────────────────
    const existingSettings = await ctx.db.query("productInventorySettings").first();
    if (existingSettings) {
      log.push(`[SKIP] productInventorySettings already initialized`);
    } else {
      await ctx.db.insert("productInventorySettings", {
        globalLowStockThreshold: 5,
        autoAdvanceOnDrawdown: true,
        alertMode: "toast",
        updatedBy: "seed",
        updatedAt: now,
      });
      log.push(`[CREATE] productInventorySettings initialized with defaults`);
    }

    log.push(`\n[DONE] Seed complete`);

    // Print to console for dashboard visibility
    for (const line of log) {
      console.log(line);
    }

    return { log };
  },
});
