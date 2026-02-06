import { mutation } from "../_generated/server";

/**
 * One-time migration: Remove the legacy `productionUnitTypeId` field from all
 * menuProductComponents documents in production.
 *
 * After running this, the schema can be updated to remove the optional field
 * and re-deployed.
 *
 * Usage: npx convex run migrations/stripLegacyProductionUnitTypeId:run
 */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const allComponents = await ctx.db.query("menuProductComponents").collect();
    let stripped = 0;
    let skipped = 0;

    for (const comp of allComponents) {
      // Check if the document has the legacy field
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((comp as any).productionUnitTypeId !== undefined) {
        // Replace the document without the legacy field
        await ctx.db.patch(comp._id, {
          productionUnitTypeId: undefined,
        });
        stripped++;
      } else {
        skipped++;
      }
    }

    return {
      total: allComponents.length,
      stripped,
      skipped,
      message: `Stripped productionUnitTypeId from ${stripped} documents (${skipped} already clean)`,
    };
  },
});
