/**
 * Depot Auto-Seed Helper
 *
 * Auto-creates depot storage locations and links them to GoFood outlets
 * when processGofoodSales encounters an outlet with no linkedStorageLocationId.
 *
 * Follows the same field structure as convex/migrations/seedFinishedGoodsLocations.ts.
 * Idempotent: safe to call multiple times for the same outlet.
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Depot configuration: maps outlet name patterns to storage location configs.
 */
const DEPOT_CONFIG: Array<{
  pattern: string;
  locationName: string;
  locationType: "depot" | "venue";
}> = [
  { pattern: "Tamtem", locationName: "Tamtem Depot", locationType: "depot" },
  { pattern: "Goldfinch", locationName: "Legato Goldfinch", locationType: "venue" },
];

/**
 * Ensure a depot storage location exists and is linked to the given outlet.
 *
 * 1. If outlet already has linkedStorageLocationId, return it immediately.
 * 2. Match outlet name against known depot patterns.
 * 3. Find or create the storage location (idempotent).
 * 4. Link the outlet to the storage location.
 * 5. Seed zero-stock productInventory rows for all active packaging component types.
 * 6. Return the storage location ID, or null if outlet is unknown.
 */
export async function ensureDepotLocation(
  ctx: MutationCtx,
  outletId: Id<"externalOutlets">,
  outletName: string
): Promise<Id<"storageLocations"> | null> {
  // 1. Check if already linked
  const outlet = await ctx.db.get(outletId);
  if (!outlet) {
    console.log(`[AUTO-SEED] Outlet ${outletId} not found in database`);
    return null;
  }

  if (outlet.linkedStorageLocationId) {
    return outlet.linkedStorageLocationId;
  }

  // 2. Match outlet name to known depot config
  const config = DEPOT_CONFIG.find((c) =>
    outletName.toLowerCase().includes(c.pattern.toLowerCase())
  );

  if (!config) {
    console.warn(
      `[AUTO-SEED] Unknown outlet "${outletName}" (${outletId}) — no auto-seed mapping`
    );
    return null;
  }

  const now = Date.now();

  // 3. Find or create the storage location (idempotent)
  let locationId: Id<"storageLocations">;
  const existing = await ctx.db
    .query("storageLocations")
    .filter((q) => q.eq(q.field("name"), config.locationName))
    .first();

  if (existing) {
    locationId = existing._id;
    console.log(
      `[AUTO-SEED] Found existing location "${config.locationName}": ${locationId}`
    );

    // Ensure it's active
    if (!existing.isActive) {
      await ctx.db.patch(locationId, { isActive: true });
      console.log(`[AUTO-SEED] Reactivated location "${config.locationName}"`);
    }
  } else {
    locationId = await ctx.db.insert("storageLocations", {
      name: config.locationName,
      locationType: config.locationType,
      isActive: true,
      isDefault: false,
      createdBy: "auto-seed",
      createdAt: now,
    });
    console.log(
      `[AUTO-SEED] Created location "${config.locationName}": ${locationId}`
    );
  }

  // 4. Link outlet to the storage location
  await ctx.db.patch(outletId, {
    linkedStorageLocationId: locationId,
  });
  console.log(
    `[AUTO-SEED] Linked outlet "${outletName}" (${outletId}) -> "${config.locationName}"`
  );

  // 5. Seed zero-stock productInventory rows for active packaging component types
  const activePackagingComponents = await ctx.db
    .query("componentTypes")
    .withIndex("by_category", (q) => q.eq("category", "packaging"))
    .filter((q) => q.eq(q.field("isActive"), true))
    .collect();

  // Fetch all menuProductComponent links in parallel across component types
  const allLinks = await Promise.all(
    activePackagingComponents.map((ct) =>
      ctx.db
        .query("menuProductComponents")
        .withIndex("by_component_type", (q) => q.eq("componentTypeId", ct._id))
        .collect()
    )
  );

  // Collect unique menuProductIds across all component types
  const uniqueMenuProductIds = new Set<Id<"menuProducts">>();
  for (const links of allLinks) {
    for (const link of links) {
      uniqueMenuProductIds.add(link.menuProductId);
    }
  }

  // Check existing inventory and seed missing rows in parallel
  const existingChecks = await Promise.all(
    [...uniqueMenuProductIds].map((mpId) =>
      ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", mpId).eq("locationId", locationId)
        )
        .first()
        .then((existing) => ({ mpId, existing }))
    )
  );

  for (const { mpId, existing } of existingChecks) {
    if (!existing) {
      await ctx.db.insert("productInventory", {
        menuProductId: mpId,
        locationId,
        quantity: 0,
        lastUpdated: now,
      });
      console.log(
        `[AUTO-SEED] Seeded zero-stock inventory for menuProduct ${mpId} at "${config.locationName}"`
      );
    }
  }

  return locationId;
}
