/**
 * BOM Backfill Migration - Step 1 of the Strangler Fig Migration
 *
 * Creates BOM entries (menuProductComponents) from deprecated
 * productionType/productionUnits fields on menuProducts.
 *
 * Run from Convex dashboard Functions tab:
 *   migrations/bomBackfill:backfillMenuProductBOM
 *
 * CRITICAL MAPPING (CLAUDE.md Pitfall #11):
 *   "original"   -> BIG_BALL (80g/Jumbo) -- NOT what the name suggests!
 *   "bite_sized"  -> MID_BALL (45g/Original) -- counterintuitive naming
 *
 * Features:
 * - Idempotent: deletes existing production BOM entries before recreating
 * - Reclassifies "Brochure - How to eat" from menuProducts to packaging componentType
 * - Auto-corrects known mismatches (Original Single, Original Triple)
 * - Returns structured report with details for every action taken
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

// Type for documents that may still have deprecated fields (pre-cleanup data).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

/**
 * Standard mapping from deprecated productionType to BOM component code.
 * CRITICAL: "original" -> BIG_BALL (80g), "bite_sized" -> MID_BALL (45g)
 * See also: convex/migrations/bomVerification.ts (uses same mapping)
 */
const PRODUCTION_TYPE_TO_BOM_CODE: Record<string, string> = {
  "original": "BIG_BALL",    // 80g/Jumbo
  "bite_sized": "MID_BALL",  // 45g/Original
};

/**
 * Known correction overrides applied AFTER the standard mapping.
 * These products have unreliable productionType values that map to the wrong BOM code.
 * The corrections ensure they get the correct BOM data automatically.
 */
const KNOWN_CORRECTIONS: Array<{
  nameContains: string;
  bomCode: string;
  quantity: number;
}> = [
  { nameContains: "Original - Single", bomCode: "MID_BALL", quantity: 1 },
  { nameContains: "Original - Triple", bomCode: "MID_BALL", quantity: 3 },
];

interface BackfillDetail {
  productName: string;
  productCode: string;
  action: "backfilled" | "skipped" | "corrected" | "removed" | "error";
  message: string;
}

interface BackfillReport {
  total: number;
  backfilled: number;
  skipped: number;
  removed: number;
  corrected: number;
  errors: number;
  details: BackfillDetail[];
}

/**
 * Idempotent backfill mutation that creates BOM entries from deprecated fields.
 *
 * Algorithm:
 * 1. Reclassify "Brochure - How to eat" (remove from menuProducts)
 * 2. For each remaining menuProduct:
 *    a. Skip if no productionType
 *    b. Map productionType -> BOM code
 *    c. Check KNOWN_CORRECTIONS for overrides
 *    d. Delete existing production BOM entries
 *    e. Insert new BOM entry
 * 3. Return structured report
 */
export const backfillMenuProductBOM = mutation({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<BackfillReport> => {
    await requireRole(ctx, args.token, ["admin"]);

    const report: BackfillReport = {
      total: 0,
      backfilled: 0,
      skipped: 0,
      removed: 0,
      corrected: 0,
      errors: 0,
      details: [],
    };

    // Fetch all menuProducts
    const allMenuProducts = await ctx.db.query("menuProducts").collect();
    report.total = allMenuProducts.length;

    // -----------------------------------------------------------------
    // Pre-step: Reclassify "Brochure - How to eat"
    // Remove from menuProducts table. It remains in componentTypes
    // (code: "BROCHURE", category: "packaging") and the inventory system.
    // -----------------------------------------------------------------
    for (const mp of allMenuProducts) {
      if (mp.name.includes("Brochure") || mp.name === "Brochure - How to eat") {
        // Delete its menuProductComponents entries
        const brochureComponents = await ctx.db
          .query("menuProductComponents")
          .withIndex("by_menu_product", (q) => q.eq("menuProductId", mp._id))
          .collect();

        for (const comp of brochureComponents) {
          await ctx.db.delete(comp._id);
        }

        // Check if any orderItems reference this menuProduct (warning only)
        const referencingOrderItems = await ctx.db
          .query("orderItems")
          .withIndex("by_menu_product", (q) => q.eq("menuProductId", mp._id))
          .collect();

        let warningNote = "";
        if (referencingOrderItems.length > 0) {
          warningNote = ` (WARNING: ${referencingOrderItems.length} orderItems reference this product — they keep snapshot data and will display correctly)`;
        }

        // Delete the menuProduct record itself
        await ctx.db.delete(mp._id);

        report.removed++;
        report.details.push({
          productName: mp.name,
          productCode: mp.code,
          action: "removed",
          message: `Removed from menuProducts — already exists as packaging componentType (code: BROCHURE). Deleted ${brochureComponents.length} component entries.${warningNote}`,
        });
      }
    }

    // -----------------------------------------------------------------
    // Main backfill: Process remaining menuProducts
    // -----------------------------------------------------------------
    // Re-fetch after deleting brochure (or filter from original list)
    const remainingProducts = allMenuProducts.filter(
      (mp) => !mp.name.includes("Brochure") && mp.name !== "Brochure - How to eat"
    );

    // Pre-fetch all componentTypes for lookups
    const allComponentTypes = await ctx.db.query("componentTypes").collect();
    const componentTypesByCode = new Map(
      allComponentTypes.map((ct) => [ct.code, ct])
    );

    for (const mp of remainingProducts) {
      // Cast to AnyDoc: deprecated fields removed from schema in Plan 04.
      const doc = mp as AnyDoc;
      // a. Skip if productionType is null/undefined/empty
      if (!doc.productionType) {
        report.skipped++;
        report.details.push({
          productName: mp.name,
          productCode: mp.code,
          action: "skipped",
          message: "No productionType — skipping (per user decision)",
        });
        continue;
      }

      // b. Look up BOM code from standard mapping
      let targetBomCode = PRODUCTION_TYPE_TO_BOM_CODE[doc.productionType as string];
      let targetQuantity = (doc.productionUnits as number | undefined) ?? 1;
      let wasCorrected = false;

      if (!targetBomCode) {
        report.errors++;
        report.details.push({
          productName: mp.name,
          productCode: mp.code,
          action: "error",
          message: `Unknown productionType "${doc.productionType}" — no mapping found`,
        });
        continue;
      }

      // c. Check KNOWN_CORRECTIONS — override if product name matches
      const correction = KNOWN_CORRECTIONS.find((c) =>
        mp.name.includes(c.nameContains)
      );
      if (correction) {
        targetBomCode = correction.bomCode;
        targetQuantity = correction.quantity;
        wasCorrected = true;
      }

      // d. Find the componentType record for the target BOM code
      const targetComponentType = componentTypesByCode.get(targetBomCode);
      if (!targetComponentType) {
        report.errors++;
        report.details.push({
          productName: mp.name,
          productCode: mp.code,
          action: "error",
          message: `componentType with code "${targetBomCode}" not found in database`,
        });
        continue;
      }

      // e. Delete ALL existing production BOM entries for this menuProduct
      const existingComponents = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", mp._id))
        .collect();

      let deletedCount = 0;
      for (const comp of existingComponents) {
        // Only delete production-category components
        const compType = await ctx.db.get(comp.componentTypeId);
        if (compType && compType.category === "production") {
          await ctx.db.delete(comp._id);
          deletedCount++;
        }
      }

      // f. Insert new BOM entry
      await ctx.db.insert("menuProductComponents", {
        menuProductId: mp._id,
        componentTypeId: targetComponentType._id,
        quantity: targetQuantity,
        sortOrder: 1,
        consumptionStage: "production",
      });

      if (wasCorrected) {
        report.corrected++;
        report.details.push({
          productName: mp.name,
          productCode: mp.code,
          action: "corrected",
          message: `Auto-corrected: productionType "${doc.productionType}" -> ${targetBomCode} x${targetQuantity} (standard mapping would have been ${PRODUCTION_TYPE_TO_BOM_CODE[doc.productionType as string]}). Deleted ${deletedCount} existing production BOM entries.`,
        });
      } else {
        report.backfilled++;
        report.details.push({
          productName: mp.name,
          productCode: mp.code,
          action: "backfilled",
          message: `Mapped: productionType "${doc.productionType}" -> ${targetBomCode} x${targetQuantity}. Deleted ${deletedCount} existing production BOM entries.`,
        });
      }
    }

    return report;
  },
});
