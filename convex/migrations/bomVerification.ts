/**
 * BOM Verification Query - Step 1 companion of the Strangler Fig Migration
 *
 * Compares BOM-derived ball composition against deprecated
 * productionType/productionUnits fields for every menuProduct.
 * Reports mismatches as a structured list for manual review.
 *
 * Run from Convex dashboard Functions tab:
 *   migrations/bomVerification:verifyBOMConsistency
 *
 * CRITICAL MAPPING (same as bomBackfill.ts):
 *   "original"   -> BIG_BALL (80g/Jumbo) -- CLAUDE.md Pitfall #11
 *   "bite_sized"  -> MID_BALL (45g/Original)
 *
 * Per user decision: "Log mismatches, don't halt" -- returns all results
 * including mismatches. Does not throw on mismatch.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Standard mapping from deprecated productionType to BOM component code.
 * Must match the mapping in convex/migrations/bomBackfill.ts exactly.
 */
const PRODUCTION_TYPE_TO_BOM_CODE: Record<string, string> = {
  "original": "BIG_BALL",    // 80g/Jumbo
  "bite_sized": "MID_BALL",  // 45g/Original
};

interface VerificationDetail {
  productId: string;
  productName: string;
  deprecatedType: string | undefined;
  deprecatedUnits: number | undefined;
  bomCode: string | null;
  bomQuantity: number | null;
  status: "match" | "mismatch" | "no_bom" | "no_deprecated";
}

interface VerificationResult {
  total: number;
  matched: number;
  mismatched: number;
  skipped: number;
  details: VerificationDetail[];
}

/**
 * Comparison query that reports BOM vs deprecated field mismatches.
 *
 * Algorithm:
 * 1. Fetch all menuProducts
 * 2. For each menuProduct:
 *    a. Read productionType and productionUnits (deprecated fields)
 *    b. Query menuProductComponents joined with componentTypes (category="production")
 *    c. Compare expected BOM (from mapping) against actual BOM
 *    d. Report status: match, mismatch, no_bom, or no_deprecated
 * 3. Return structured VerificationResult
 */
export const verifyBOMConsistency = query({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<VerificationResult> => {
    await requireRole(ctx, args.token, ["admin"]);

    const result: VerificationResult = {
      total: 0,
      matched: 0,
      mismatched: 0,
      skipped: 0,
      details: [],
    };

    // Fetch all menuProducts
    const allMenuProducts = await ctx.db.query("menuProducts").collect();
    result.total = allMenuProducts.length;

    for (const mp of allMenuProducts) {
      const deprecatedType = mp.productionType || undefined;
      const deprecatedUnits = mp.productionUnits ?? undefined;

      // Query BOM entries: menuProductComponents with category="production"
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", mp._id))
        .collect();

      // Filter to production-category components only
      let bomCode: string | null = null;
      let bomQuantity: number | null = null;

      for (const comp of components) {
        const compType = await ctx.db.get(comp.componentTypeId);
        if (compType && compType.category === "production") {
          // Take the first production component (products should have at most one)
          bomCode = compType.code;
          bomQuantity = comp.quantity;
          break;
        }
      }

      // Determine status
      if (!deprecatedType) {
        // No deprecated fields -> no_deprecated (skip)
        result.skipped++;
        result.details.push({
          productId: mp._id,
          productName: mp.name,
          deprecatedType,
          deprecatedUnits,
          bomCode,
          bomQuantity,
          status: "no_deprecated",
        });
        continue;
      }

      if (bomCode === null) {
        // Has deprecated fields but no BOM entries
        result.mismatched++;
        result.details.push({
          productId: mp._id,
          productName: mp.name,
          deprecatedType,
          deprecatedUnits,
          bomCode,
          bomQuantity,
          status: "no_bom",
        });
        continue;
      }

      // Compare: Map deprecated productionType through PRODUCTION_TYPE_TO_BOM_CODE
      const expectedBomCode = PRODUCTION_TYPE_TO_BOM_CODE[deprecatedType];

      if (!expectedBomCode) {
        // Unknown productionType -- count as mismatch
        result.mismatched++;
        result.details.push({
          productId: mp._id,
          productName: mp.name,
          deprecatedType,
          deprecatedUnits,
          bomCode,
          bomQuantity,
          status: "mismatch",
        });
        continue;
      }

      // Compare expected code + units against actual BOM code + quantity
      const codesMatch = expectedBomCode === bomCode;
      const unitsMatch = deprecatedUnits === bomQuantity;

      if (codesMatch && unitsMatch) {
        result.matched++;
        result.details.push({
          productId: mp._id,
          productName: mp.name,
          deprecatedType,
          deprecatedUnits,
          bomCode,
          bomQuantity,
          status: "match",
        });
      } else {
        result.mismatched++;
        result.details.push({
          productId: mp._id,
          productName: mp.name,
          deprecatedType,
          deprecatedUnits,
          bomCode,
          bomQuantity,
          status: "mismatch",
        });
      }
    }

    return result;
  },
});
