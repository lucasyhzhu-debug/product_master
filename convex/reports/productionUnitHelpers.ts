import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Canonical predicate for "is this componentType a production unit?"
 *
 * Phase 81 / D-01: The rule is `category === "production"` ALONE.
 * Drops the historical `unit === "pcs"` clause (future-proofs gram-denominated
 * bulk variants) and the `gramsPerUnit !== undefined` clause (BOM unification
 * trajectory per CLAUDE.md rule 10). All callers should use this predicate
 * instead of hand-rolling the filter inline.
 *
 * If you reach this from a numeric-aggregation callsite that depends on
 * `gramsPerUnit` being defined (e.g., a `(gramsPerUnit ?? 0) * qty` reduce),
 * compose with a secondary filter — see convex/menuProducts/mutations.ts for
 * the canonical example.
 */
export function isProductionUnit(
  ct: Pick<Doc<"componentTypes">, "category">,
): boolean {
  return ct.category === "production";
}

/**
 * Build a map of menuProductId -> total production pieces per unit of that product.
 *
 * Dynamic iteration over ALL componentTypes via the canonical isProductionUnit
 * predicate (category === "production" per D-01). Gram-denominated production
 * variants now auto-count — no `unit === "pcs"` requirement.
 *
 * NEVER hardcode BIG_BALL / MID_BALL here — future production types (Hazelnut, new
 * stuffed variants) must be counted automatically. This is the single source of
 * truth for the "units sold = BOM production pieces" rule used across analytics.
 */
export async function getProductionUnitsPerProduct(
  ctx: QueryCtx,
): Promise<Map<Id<"menuProducts">, number>> {
  const allComponentTypes = await ctx.db.query("componentTypes").collect();
  const productionTierOneIds = new Set<string>();
  // Phase 81 / D-01: dropped unit === "pcs" — gram-denominated production variants now auto-count.
  for (const ct of allComponentTypes) {
    if (isProductionUnit(ct)) {
      productionTierOneIds.add(ct._id as string);
    }
  }

  const allBom = await ctx.db.query("menuProductComponents").collect();
  const result = new Map<Id<"menuProducts">, number>();
  for (const row of allBom) {
    if (!productionTierOneIds.has(row.componentTypeId as string)) continue;
    const mpId = row.menuProductId;
    result.set(mpId, (result.get(mpId) ?? 0) + row.quantity);
  }
  return result;
}

/**
 * Per-type breakdown: menuProductId -> { componentTypeCode -> pcs }.
 * Used by D1 (units stacked by type) and D4 (mix over time).
 */
export async function getProductionUnitsByTypePerProduct(
  ctx: QueryCtx,
): Promise<{
  byProduct: Map<Id<"menuProducts">, Map<string, number>>;
  typeCodes: string[]; // ordered, for stable legend
  typeCodeToName: Map<string, string>;
}> {
  const allComponentTypes = await ctx.db.query("componentTypes").collect();
  // Phase 81 / D-01: dropped unit === "pcs" — gram-denominated production variants now auto-count.
  const productionTypes = allComponentTypes
    .filter(isProductionUnit)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  const idToCode = new Map<string, string>();
  const codeToName = new Map<string, string>();
  const typeCodes: string[] = [];
  for (const ct of productionTypes) {
    idToCode.set(ct._id as string, ct.code);
    codeToName.set(ct.code, ct.name);
    typeCodes.push(ct.code);
  }

  const allBom = await ctx.db.query("menuProductComponents").collect();
  const byProduct = new Map<Id<"menuProducts">, Map<string, number>>();
  for (const row of allBom) {
    const code = idToCode.get(row.componentTypeId as string);
    if (!code) continue;
    const mpId = row.menuProductId;
    if (!byProduct.has(mpId)) byProduct.set(mpId, new Map());
    const m = byProduct.get(mpId)!;
    m.set(code, (m.get(code) ?? 0) + row.quantity);
  }

  return { byProduct, typeCodes, typeCodeToName: codeToName };
}

/**
 * Count total production units for a given order item, resolving via BOM.
 * Returns 0 if the orderItem has no linked menuProduct (manual items don't count).
 */
export function unitsForOrderItem(
  item: Pick<Doc<"orderItems">, "menuProductId" | "quantity">,
  unitsPerProduct: Map<Id<"menuProducts">, number>,
): number {
  if (!item.menuProductId) return 0;
  const per = unitsPerProduct.get(item.menuProductId) ?? 0;
  return per * item.quantity;
}
