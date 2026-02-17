import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../../lib/auth";
import { GOBIZ_OUTLET_SEED } from "./config";

/**
 * Seed GoBiz outlets (Goldfinch, Crystal, Tamtem) into externalOutlets table.
 * Idempotent: only creates outlets that don't already exist.
 *
 * Run from Convex dashboard Functions tab during initial setup:
 *   integrations/gobiz/mutations.seedGoBizOutlets
 *   Args: { "token": "<admin-token>" }
 */
export const seedGoBizOutlets = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const created: string[] = [];
    const skipped: string[] = [];

    for (const outlet of GOBIZ_OUTLET_SEED) {
      // Check if outlet already exists by source + externalId
      const existing = await ctx.db
        .query("externalOutlets")
        .withIndex("by_source_external_id", (q) =>
          q.eq("source", outlet.source).eq("externalId", outlet.externalId)
        )
        .first();

      if (existing) {
        skipped.push(`${outlet.name} (${outlet.externalId})`);
        continue;
      }

      await ctx.db.insert("externalOutlets", {
        source: outlet.source,
        externalId: outlet.externalId,
        name: outlet.name,
        isActive: true,
        createdBy: "system:seed",
        createdAt: Date.now(),
      });

      created.push(`${outlet.name} (${outlet.externalId})`);
    }

    console.log(`seedGoBizOutlets: created ${created.length}, skipped ${skipped.length}`);
    return { created, skipped };
  },
});
