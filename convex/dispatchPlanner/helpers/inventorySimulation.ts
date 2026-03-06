/**
 * Inventory simulation engine for the dispatch planner.
 * Ctx-dependent helper that walks BOM and ingredient hierarchies
 * to project 7-day inventory sufficiency.
 */
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { collectLeafIngredients } from "../../lib/hierarchyTraversal";
import { generateWeekDates } from "../helpers";

/**
 * Simulate inventory sufficiency for a 7-day planning window.
 * Walks BOM for each product in dispatch plans, compares against componentStock.
 * Also walks production component hierarchy to calculate ingredient requirements.
 *
 * @param ctx - Convex query context (needed for DB reads and hierarchy traversal)
 * @param startDate - Start date string (YYYY-MM-DD)
 * @returns Day-by-day simulation results with shortages and ingredient status
 */
export async function simulateInventoryForDates(
  ctx: QueryCtx,
  startDate: string,
): Promise<{
  days: Array<{
    date: string;
    status: "ok" | "low" | "out";
    shortages: Array<{
      componentTypeName: string;
      required: number;
      available: number;
      deficit: number;
    }>;
    ingredientShortages: Array<{
      ingredientName: string;
      required: number;
      available: number;
      deficit: number;
      runsOutDate: string | null;
    }>;
  }>;
  ingredientStatus: Array<{
    ingredientName: string;
    currentStock: number;
    totalRequired7Days: number;
    runsOutDate: string | null;
  }>;
  unlinkedIngredients: string[];
}> {
  const dates = generateWeekDates(startDate);

  // Fetch all dispatch plans for the date range
  const allPlans: Doc<"dispatchPlans">[] = [];
  for (const date of dates) {
    const plans = await ctx.db
      .query("dispatchPlans")
      .withIndex("by_date", (q: any) => q.eq("date", date))
      .collect();
    allPlans.push(...plans);
  }

  // Fetch all component types
  const componentTypes = await ctx.db
    .query("componentTypes")
    .withIndex("by_active", (q: any) => q.eq("isActive", true))
    .collect();
  const componentTypeMap = new Map<string, Doc<"componentTypes">>();
  for (const ct of componentTypes) {
    componentTypeMap.set(ct._id as string, ct);
  }

  // Fetch all menu product components (BOM)
  const allBomEntries = await ctx.db
    .query("menuProductComponents")
    .collect();

  // Group BOM by menuProductId
  const bomByProduct = new Map<string, Doc<"menuProductComponents">[]>();
  for (const entry of allBomEntries) {
    const mpId = entry.menuProductId as string;
    if (!bomByProduct.has(mpId)) {
      bomByProduct.set(mpId, []);
    }
    bomByProduct.get(mpId)!.push(entry);
  }

  // Fetch current component stock (aggregate across locations)
  const allStock = await ctx.db.query("componentStock").collect();
  const stockByComponent = new Map<string, number>();
  for (const s of allStock) {
    const ctId = s.componentTypeId as string;
    const available = s.totalStock - s.totalReserved;
    stockByComponent.set(
      ctId,
      (stockByComponent.get(ctId) ?? 0) + available
    );
  }

  // ---- Ingredient simulation: collect leaf ingredients per production component ----
  // Cache leaf ingredients per production component to avoid repeated traversals
  const ingredientCache = new Map<string, Awaited<ReturnType<typeof collectLeafIngredients>>>();

  // Identify production components (balls) -- category=production, trackInventory=false
  const productionComponentIds = new Set<string>();
  for (const ct of componentTypes) {
    if (ct.category === "production" && !ct.trackInventory) {
      productionComponentIds.add(ct._id as string);
    }
  }

  // Build ingredient stock map: ingredient-type componentTypes (category=production, trackInventory=true)
  const ingredientComponentTypes = componentTypes.filter(
    (ct: Doc<"componentTypes">) => ct.category === "production" && ct.trackInventory
  );
  const ingredientStockMap = new Map<string, number>(); // ingredientComponentTypeId -> available
  for (const ict of ingredientComponentTypes) {
    ingredientStockMap.set(
      ict._id as string,
      stockByComponent.get(ict._id as string) ?? 0
    );
  }

  // Pre-load ingredient -> componentType mapping for ID-based stock lookup
  const allIngredients = await ctx.db.query("ingredients").collect();
  const ingredientToComponentTypeId = new Map<string, string>(); // ingredientId -> componentTypeId
  const unlinkedIngredientSet = new Set<string>(); // ingredient names (for warning)
  for (const ing of allIngredients) {
    if (ing.ingredientComponentTypeId) {
      ingredientToComponentTypeId.set(ing._id as string, ing.ingredientComponentTypeId as string);
    }
  }

  // Walk through days cumulatively
  const cumulativeRequired = new Map<string, number>();
  const cumulativeIngredientRequired = new Map<string, number>(); // ingredientName -> cumulative qty needed
  // Track by ingredient name for display, keyed by a composite of ingredientName
  const ingredientNameMap = new Map<string, { name: string; unit: string }>(); // ingredientId -> info

  const result: Array<{
    date: string;
    status: "ok" | "low" | "out";
    shortages: Array<{
      componentTypeName: string;
      required: number;
      available: number;
      deficit: number;
    }>;
    ingredientShortages: Array<{
      ingredientName: string;
      required: number;
      available: number;
      deficit: number;
      runsOutDate: string | null;
    }>;
  }> = [];

  // Track when each ingredient first goes negative
  const ingredientRunsOutDate = new Map<string, string>(); // ingredientId -> date string

  for (const date of dates) {
    const dayPlans = allPlans.filter(
      (p: Doc<"dispatchPlans">) => p.date === date
    );

    // Calculate required components and ingredients for this day
    for (const plan of dayPlans) {
      const bom = bomByProduct.get(plan.menuProductId as string);
      if (!bom) continue;

      for (const entry of bom) {
        const ctId = entry.componentTypeId as string;
        const ct = componentTypeMap.get(ctId);
        if (!ct) continue;

        // Track packaging/component requirements
        const unitsNeeded = plan.plannedQty * entry.quantity;
        cumulativeRequired.set(
          ctId,
          (cumulativeRequired.get(ctId) ?? 0) + unitsNeeded
        );

        // For production components (balls), walk hierarchy to get ingredient requirements
        if (productionComponentIds.has(ctId)) {
          if (!ingredientCache.has(ctId)) {
            try {
              const leaves = await collectLeafIngredients(ctx, ct._id);
              ingredientCache.set(ctId, leaves);
            } catch {
              ingredientCache.set(ctId, []);
            }
          }

          const leaves = ingredientCache.get(ctId) ?? [];
          for (const leaf of leaves) {
            const ingKey = leaf.ingredientId as string;
            const ingQtyPerUnit = leaf.totalQuantity; // per 1 unit of this component
            const totalIngNeeded = ingQtyPerUnit * plan.plannedQty;

            cumulativeIngredientRequired.set(
              ingKey,
              (cumulativeIngredientRequired.get(ingKey) ?? 0) + totalIngNeeded
            );

            if (!ingredientNameMap.has(ingKey)) {
              ingredientNameMap.set(ingKey, {
                name: leaf.ingredientName,
                unit: leaf.unit,
              });
            }
          }
        }
      }
    }

    // Check packaging/component sufficiency
    const shortages: Array<{
      componentTypeName: string;
      required: number;
      available: number;
      deficit: number;
    }> = [];

    let dayStatus: "ok" | "low" | "out" = "ok";

    for (const [ctId, required] of cumulativeRequired) {
      const ct = componentTypeMap.get(ctId);
      if (!ct) continue;

      // Skip non-tracked packaging items; always process production components
      if (ct.category === "packaging" && !ct.trackInventory) continue;

      const available = stockByComponent.get(ctId) ?? 0;

      if (available < required) {
        dayStatus = "out";
        shortages.push({
          componentTypeName: ct.name,
          required,
          available,
          deficit: required - available,
        });
      } else if (available < required * 1.2) {
        if (dayStatus !== "out") dayStatus = "low";
        shortages.push({
          componentTypeName: ct.name,
          required,
          available,
          deficit: 0,
        });
      }
    }

    // Check ingredient sufficiency
    // Note: ingredient stock is tracked via componentTypes with trackInventory=true
    // We need to find the componentType that corresponds to each ingredient
    // For now, match by name since ingredient-linked componentTypes share names
    const ingredientShortages: Array<{
      ingredientName: string;
      required: number;
      available: number;
      deficit: number;
      runsOutDate: string | null;
    }> = [];

    for (const [ingId, required] of cumulativeIngredientRequired) {
      const ingInfo = ingredientNameMap.get(ingId);
      if (!ingInfo) continue;

      // ID-based ingredient -> componentType lookup
      const linkedCtId = ingredientToComponentTypeId.get(ingId);
      if (!linkedCtId) {
        // Track unlinked ingredient name for warning; skip (no fallback to name match)
        unlinkedIngredientSet.add(ingInfo.name);
        continue;
      }
      const available = ingredientStockMap.get(linkedCtId) ?? 0;

      if (available < required) {
        if (dayStatus !== "out") dayStatus = "out";

        // Track first runs-out date
        if (!ingredientRunsOutDate.has(ingId)) {
          ingredientRunsOutDate.set(ingId, date);
        }

        ingredientShortages.push({
          ingredientName: ingInfo.name,
          required,
          available,
          deficit: required - available,
          runsOutDate: ingredientRunsOutDate.get(ingId) ?? date,
        });
      } else if (available < required * 1.2) {
        if (dayStatus !== "out") dayStatus = "low";
        ingredientShortages.push({
          ingredientName: ingInfo.name,
          required,
          available,
          deficit: 0,
          runsOutDate: null,
        });
      }
    }

    result.push({
      date,
      status: dayStatus,
      shortages,
      ingredientShortages,
    });
  }

  // Build top-level ingredientStatus summary
  const ingredientStatus: Array<{
    ingredientName: string;
    currentStock: number;
    totalRequired7Days: number;
    runsOutDate: string | null;
  }> = [];

  for (const [ingId, totalRequired] of cumulativeIngredientRequired) {
    const ingInfo = ingredientNameMap.get(ingId);
    if (!ingInfo) continue;

    const linkedCtId = ingredientToComponentTypeId.get(ingId);
    const currentStock = linkedCtId ? (ingredientStockMap.get(linkedCtId) ?? 0) : 0;
    // Skip unlinked ingredients in the status summary (already captured in unlinkedIngredientSet)
    if (!linkedCtId) continue;

    ingredientStatus.push({
      ingredientName: ingInfo.name,
      currentStock,
      totalRequired7Days: totalRequired,
      runsOutDate: ingredientRunsOutDate.get(ingId) ?? null,
    });
  }

  return {
    days: result,
    ingredientStatus,
    unlinkedIngredients: Array.from(unlinkedIngredientSet),
  };
}
