/**
 * BOM Refactor V2 - Clean Slate Migration
 *
 * Wipes all test data from component/inventory tables, keeping only
 * BIG_BALL + MID_BALL production components. Seeds new fields.
 *
 * Run: npx convex run migrations/bomRefactorV2:cleanSlateAndSeed
 * Or:  npm run migrate:bom-v2
 */

import { mutation } from "../_generated/server";

export const cleanSlateAndSeed = mutation({
  args: {},
  handler: async (ctx) => {
    const summary = {
      deleted: {
        reservations: 0,
        transactions: 0,
        batches: 0,
        stock: 0,
        bomLinks: 0,
        componentTypes: 0,
      },
      kept: {
        BIG_BALL: false,
        MID_BALL: false,
      },
      updated: {
        menuProducts: 0,
      },
    };

    // Step 1: Delete all orderComponentReservations
    const reservations = await ctx.db.query("orderComponentReservations").collect();
    for (const r of reservations) {
      await ctx.db.delete(r._id);
    }
    summary.deleted.reservations = reservations.length;

    // Step 2: Delete all componentTransactions
    const transactions = await ctx.db.query("componentTransactions").collect();
    for (const t of transactions) {
      await ctx.db.delete(t._id);
    }
    summary.deleted.transactions = transactions.length;

    // Step 3: Delete all inventoryBatches
    const batches = await ctx.db.query("inventoryBatches").collect();
    for (const b of batches) {
      await ctx.db.delete(b._id);
    }
    summary.deleted.batches = batches.length;

    // Step 4: Delete all componentStock
    const stockRecords = await ctx.db.query("componentStock").collect();
    for (const s of stockRecords) {
      await ctx.db.delete(s._id);
    }
    summary.deleted.stock = stockRecords.length;

    // Step 5: Delete all menuProductComponents (BOM links)
    const bomLinks = await ctx.db.query("menuProductComponents").collect();
    for (const link of bomLinks) {
      await ctx.db.delete(link._id);
    }
    summary.deleted.bomLinks = bomLinks.length;

    // Step 6: Delete packaging componentTypes (keep only BIG_BALL + MID_BALL)
    const allComponentTypes = await ctx.db.query("componentTypes").collect();
    for (const ct of allComponentTypes) {
      if (ct.code !== "BIG_BALL" && ct.code !== "MID_BALL") {
        await ctx.db.delete(ct._id);
        summary.deleted.componentTypes++;
      }
    }

    // Step 7: Update BIG_BALL + MID_BALL with new fields
    const bigBall = await ctx.db
      .query("componentTypes")
      .withIndex("by_code", (q) => q.eq("code", "BIG_BALL"))
      .first();
    if (bigBall) {
      await ctx.db.patch(bigBall._id, {
        consumptionStage: "none",
        description: undefined,
        alarmPercentage: undefined,
      });
      summary.kept.BIG_BALL = true;
    }

    const midBall = await ctx.db
      .query("componentTypes")
      .withIndex("by_code", (q) => q.eq("code", "MID_BALL"))
      .first();
    if (midBall) {
      await ctx.db.patch(midBall._id, {
        consumptionStage: "none",
        description: undefined,
        alarmPercentage: undefined,
      });
      summary.kept.MID_BALL = true;
    }

    // Step 8: Seed productType on menuProducts + clear cached summary
    const menuProducts = await ctx.db.query("menuProducts").collect();
    for (const mp of menuProducts) {
      await ctx.db.patch(mp._id, {
        productType: "food",
        cachedProductionSummary: undefined,
      });
      summary.updated.menuProducts++;
    }

    return summary;
  },
});
