/**
 * Fix dispatchPlans outletId references — Phase 29 migration gap
 *
 * Phase 29 merged dispatchConsignmentOutlets into consignmentOutlets but
 * didn't migrate existing dispatchPlans documents that still reference
 * old dispatchConsignmentOutlets IDs.
 *
 * In Convex, db.get() resolves IDs from their native table regardless of
 * type cast, so we must check against the set of known valid IDs.
 */

import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Query: Find dispatchPlans with outletIds NOT in externalOutlets or consignmentOutlets
 */
export const inspectOutletIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Build sets of all valid outlet IDs
    const externalOutlets = await ctx.db.query("externalOutlets").collect();
    const consignmentOutlets = await ctx.db.query("consignmentOutlets").collect();
    const validIds = new Set([
      ...externalOutlets.map(o => o._id),
      ...consignmentOutlets.map(o => o._id),
    ]);

    const plans = await ctx.db.query("dispatchPlans").collect();
    const invalid: Array<{
      id: string;
      outletId: string;
      date: string;
      channel: string;
    }> = [];

    for (const plan of plans) {
      if (!plan.outletId) continue;
      if (!validIds.has(plan.outletId as any)) {
        invalid.push({
          id: plan._id,
          outletId: plan.outletId as string,
          date: plan.date,
          channel: plan.channel,
        });
      }
    }

    return {
      totalPlans: plans.length,
      externalOutletCount: externalOutlets.length,
      consignmentOutletCount: consignmentOutlets.length,
      validIdCount: validIds.size,
      withOutletId: plans.filter(p => p.outletId).length,
      invalidCount: invalid.length,
      invalid,
    };
  },
});

/**
 * Mutation: Clear invalid outletIds from dispatchPlans
 */
export const clearInvalidOutlets = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Build sets of all valid outlet IDs
    const externalOutlets = await ctx.db.query("externalOutlets").collect();
    const consignmentOutlets = await ctx.db.query("consignmentOutlets").collect();
    const validIds = new Set([
      ...externalOutlets.map(o => o._id),
      ...consignmentOutlets.map(o => o._id),
    ]);

    const plans = await ctx.db.query("dispatchPlans").collect();
    let fixed = 0;
    let skipped = 0;
    const fixedIds: string[] = [];

    for (const plan of plans) {
      if (!plan.outletId) {
        skipped++;
        continue;
      }

      if (!validIds.has(plan.outletId as any)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.patch(plan._id, { outletId: undefined } as any);
        fixedIds.push(plan._id);
        fixed++;
      } else {
        skipped++;
      }
    }

    return {
      status: "completed" as const,
      totalPlans: plans.length,
      fixed,
      skipped,
      fixedIds,
    };
  },
});
