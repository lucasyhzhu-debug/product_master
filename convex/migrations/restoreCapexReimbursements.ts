/**
 * Migration: Restore employee-paid expenses that were voided during CapEx conversion.
 *
 * Before the fix, convertToCapex voided ALL expenses regardless of payment method.
 * Employee-paid expenses should have stayed in awaiting_payment for reimbursement.
 *
 * This migration finds voided employee-paid expenses with voidReason matching
 * "Converted to fixed asset: ..." and restores them to awaiting_payment status.
 *
 * Also backfills convertedToAssetId by matching on the asset number in voidReason.
 *
 * Safe to run multiple times (idempotent — only patches voided employee-paid capex expenses).
 *
 * Run from Convex dashboard Functions tab:
 *   migrations:restoreCapexReimbursements:run
 */
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Find all voided expenses
    const voidedExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "voided"))
      .collect();

    // Filter to employee-paid capex conversions
    const capexExpenses = voidedExpenses.filter(
      (e) =>
        e.paymentMethod === "employee_paid" &&
        e.voidReason?.startsWith("Converted to fixed asset:")
    );

    let restored = 0;
    let alreadyFixed = 0;
    let assetLinked = 0;

    for (const expense of capexExpenses) {
      // Skip if somehow already fixed (idempotent guard)
      if (expense.status !== "voided") {
        alreadyFixed++;
        continue;
      }

      const patch: Record<string, unknown> = {
        status: "awaiting_payment",
      };

      // Try to backfill convertedToAssetId if not already set
      if (!expense.convertedToAssetId && expense.voidReason) {
        // Extract asset number from voidReason: "Converted to fixed asset: FA-XXXX"
        const match = expense.voidReason.match(
          /Converted to fixed asset:\s*(\S+)/
        );
        if (match) {
          const assetNumber = match[1];
          const asset = await ctx.db
            .query("fixedAssets")
            .filter((q) => q.eq(q.field("assetNumber"), assetNumber))
            .first();
          if (asset) {
            patch.convertedToAssetId = asset._id;
            assetLinked++;
          }
        }
      }

      await ctx.db.patch(expense._id, patch);
      restored++;
    }

    return {
      found: capexExpenses.length,
      restored,
      alreadyFixed,
      assetLinked,
    };
  },
});
