/**
 * Component Type Dedupe Utilities
 *
 * One-shot admin helpers to diagnose and repair duplicate componentTypes rows
 * introduced by the combination of:
 *   - componentTypes/seed:seedLeafKitchenComponents (seeded canonical codes
 *     like FILLING_PISTACHIO, NUTELLA_FILLING, OUTER_MARSHMALLOW)
 *   - componentTypes/mutations:createIngredientComponentType (generated ING_*
 *     codes for ingredient-backed components)
 *
 * When both exist for the same logical component (e.g. a seed row named
 * "Filling-Pistachio" AND an ingredient named "Filling-Pistachio" tracked
 * via IngredientsManager), two rows with the same normalized display name
 * appear on the Components page. In practice the ING_ row carries real
 * pricing (via ingredients.costPerBaseUnit) while the seeded row has
 * unitCostIdr=0.
 *
 * DATA-CORRECTNESS RULE (priority over cosmetic code names):
 *   The survivor is the row whose data is most useful. A row with real
 *   pricing ALWAYS beats a row without pricing, even if the pricing row has
 *   an ING_ code. After selection, if the survivor's code starts with ING_
 *   and a sibling dup has a non-ING_ code that is not in use elsewhere, we
 *   adopt the canonical code for the survivor (collision-safe).
 *
 * Run from Convex dashboard Functions tab:
 *   componentTypes/dedupe:reportDuplicatesByName  — read-only preview (admin/manager)
 *   componentTypes/dedupe:mergeDuplicatesByName   — repoint + deactivate (admin only)
 *
 * Repointed FK-like columns (9 total on componentTypes._id):
 *   1. productionComponentLinks.parentComponentId
 *   2. productionComponentLinks.childComponentId
 *   3. productionComponentIngredients.componentTypeId
 *   4. menuProductComponents.componentTypeId
 *   5. ingredients.ingredientComponentTypeId
 *   6. inventoryBatches.componentTypeId
 *   7. componentStock.componentTypeId           (merge-by-location: sum totals, delete dup row)
 *   8. componentTransactions.componentTypeId
 *   9. orderComponentReservations.componentTypeId
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { normalizeName, EXPECTED_CANONICAL_CODES } from "./helpers";
import type { Id, Doc } from "../_generated/dataModel";

// ============================================================================
// Survivor selection + field merge helpers
// ============================================================================

type ComponentTypeDoc = Doc<"componentTypes">;

/** A "meaningful" cost is a positive number. 0 / null / undefined => no data. */
function hasMeaningfulCost(c: ComponentTypeDoc): boolean {
  if (c.unitCostIdr && c.unitCostIdr > 0) return true;
  if (c.manualUnitCostIdr && c.manualUnitCostIdr > 0) return true;
  if (c.cachedCalculatedCogs && c.cachedCalculatedCogs > 0) return true;
  return false;
}

/**
 * Deterministic survivor ranking within a normalized-name group.
 *
 * Priority (lower = better):
 *   1. Has meaningful unit cost (priced row wins over Rp 0 row).
 *   2. Non-ING_ code prefix (prefer canonical when pricing ties).
 *   3. Earliest createdAt.
 *   4. code.localeCompare (alpha).
 *   5. _id.localeCompare (final deterministic tiebreaker).
 */
function compareSurvivorPriority(
  a: ComponentTypeDoc,
  b: ComponentTypeDoc
): number {
  // 1. Priced beats unpriced.
  const aCost = hasMeaningfulCost(a) ? 0 : 1;
  const bCost = hasMeaningfulCost(b) ? 0 : 1;
  if (aCost !== bCost) return aCost - bCost;

  // 2. Non-ING_ beats ING_.
  const aIng = a.code.startsWith("ING_") ? 1 : 0;
  const bIng = b.code.startsWith("ING_") ? 1 : 0;
  if (aIng !== bIng) return aIng - bIng;

  // 3. Earliest createdAt.
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;

  // 4. code alpha.
  const codeCmp = a.code.localeCompare(b.code);
  if (codeCmp !== 0) return codeCmp;

  // 5. _id lexicographic.
  return (a._id as string).localeCompare(b._id as string);
}

/**
 * Description of a single field-merge operation: "copy X: A -> B".
 */
type FieldMergePlan = {
  field: string;
  fromValue: unknown;
  toValue: unknown;
};

/**
 * Build a field-merge plan: for each mergeable field on `survivor`, if
 * survivor has no useful value (null/undefined/0/empty) and a dup has a
 * useful value, copy the dup's value onto the survivor. First non-empty dup
 * wins for each field (dupes are iterated in survivor-priority order).
 *
 * Fields considered (present on componentTypes schema):
 *   - unitCostIdr          (number; 0 = no data)
 *   - manualUnitCostIdr    (optional number; 0/undefined = no data)
 *   - cachedCalculatedCogs (optional number)
 *   - gramsPerUnit         (optional number)
 *   - batchSize            (optional number)
 *   - batchSizeUnit        (optional string)
 *   - description          (optional string)
 *   - color                (optional string)
 *   - reorderPoint         (optional number)
 *   - reorderQuantity      (optional number)
 *   - alarmPercentage      (optional number)
 *   - consumptionStage     (optional literal)
 *
 * Returns { patch, plan } — `patch` is the partial update to apply, `plan`
 * is a list of human-readable operations for the dry-run report.
 */
function buildFieldMergePlan(
  survivor: ComponentTypeDoc,
  dupes: ComponentTypeDoc[]
): {
  patch: Partial<ComponentTypeDoc>;
  plan: FieldMergePlan[];
} {
  const patch: Record<string, unknown> = {};
  const plan: FieldMergePlan[] = [];

  // Helper: copy `field` from first dup that has a truthy value, when
  // survivor's current value is missing or zero.
  function mergeNumber(field: keyof ComponentTypeDoc & string) {
    const survivorVal = survivor[field] as number | undefined | null;
    if (survivorVal !== undefined && survivorVal !== null && survivorVal !== 0) return;
    for (const dup of dupes) {
      const dupVal = dup[field] as number | undefined | null;
      if (dupVal !== undefined && dupVal !== null && dupVal !== 0) {
        patch[field] = dupVal;
        plan.push({ field, fromValue: survivorVal, toValue: dupVal });
        return;
      }
    }
  }
  function mergeString(field: keyof ComponentTypeDoc & string) {
    const survivorVal = survivor[field] as string | undefined | null;
    if (survivorVal !== undefined && survivorVal !== null && survivorVal !== "") return;
    for (const dup of dupes) {
      const dupVal = dup[field] as string | undefined | null;
      if (dupVal !== undefined && dupVal !== null && dupVal !== "") {
        patch[field] = dupVal;
        plan.push({ field, fromValue: survivorVal, toValue: dupVal });
        return;
      }
    }
  }

  mergeNumber("unitCostIdr");
  mergeNumber("manualUnitCostIdr");
  mergeNumber("cachedCalculatedCogs");
  mergeNumber("gramsPerUnit");
  mergeNumber("batchSize");
  mergeNumber("reorderPoint");
  mergeNumber("reorderQuantity");
  mergeNumber("alarmPercentage");
  mergeString("batchSizeUnit");
  mergeString("description");
  mergeString("color");
  mergeString("consumptionStage"); // literal union — treat as string for copy

  return { patch: patch as Partial<ComponentTypeDoc>, plan };
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Read-only report of potential duplicate production componentTypes, grouped
 * by normalized display name. Returns per-member fields (code, name, cost,
 * isActive) plus dependent-row counts, AND a sanity-check list of canonical
 * codes (what the seed would create) vs what is actually present in the DB.
 *
 * Authz: admin or manager.
 */
export const reportDuplicatesByName = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const allProduction = await ctx.db
      .query("componentTypes")
      .withIndex("by_category", (q) => q.eq("category", "production"))
      .collect();

    // Sanity check: which canonical codes are present?
    const codesPresent = new Set(allProduction.map((c) => c.code));
    const expectedCodesPresent: Record<string, boolean> = {};
    const missingCanonicalCodes: string[] = [];
    for (const code of EXPECTED_CANONICAL_CODES) {
      const ok = codesPresent.has(code);
      expectedCodesPresent[code] = ok;
      if (!ok) missingCanonicalCodes.push(code);
    }

    // Group by normalized name
    const groups = new Map<string, typeof allProduction>();
    for (const c of allProduction) {
      const key = normalizeName(c.name);
      const arr = groups.get(key);
      if (arr) arr.push(c);
      else groups.set(key, [c]);
    }

    type DupRow = {
      _id: Id<"componentTypes">;
      code: string;
      name: string;
      isActive: boolean;
      createdAt: number;
      unitCostIdr: number;
      manualUnitCostIdr?: number;
      cachedCalculatedCogs?: number;
      hasMeaningfulCost: boolean;
      parentLinkCount: number;
      childLinkCount: number;
      ingredientLinkCount: number;
      menuProductRefCount: number;
      inventoryBatchCount: number;
      componentStockCount: number;
      componentTransactionCount: number;
      orderReservationCount: number;
      ingredientBackedBy?: Id<"ingredients">;
    };

    const dupGroups: Array<{ normalizedName: string; members: DupRow[] }> = [];

    for (const [key, members] of groups) {
      if (members.length < 2) continue;

      const rows: DupRow[] = [];
      for (const m of members) {
        const [
          parentLinks,
          childLinks,
          ingredientLinks,
          menuProductRefs,
          inventoryBatches,
          componentStockRows,
          componentTransactions,
          orderReservations,
        ] = await Promise.all([
          ctx.db
            .query("productionComponentLinks")
            .withIndex("by_parent", (q) => q.eq("parentComponentId", m._id))
            .collect(),
          ctx.db
            .query("productionComponentLinks")
            .withIndex("by_child", (q) => q.eq("childComponentId", m._id))
            .collect(),
          ctx.db
            .query("productionComponentIngredients")
            .withIndex("by_component", (q) => q.eq("componentTypeId", m._id))
            .collect(),
          ctx.db
            .query("menuProductComponents")
            .withIndex("by_component_type", (q) => q.eq("componentTypeId", m._id))
            .collect(),
          ctx.db
            .query("inventoryBatches")
            .withIndex("by_component", (q) => q.eq("componentTypeId", m._id))
            .collect(),
          ctx.db
            .query("componentStock")
            .withIndex("by_component", (q) => q.eq("componentTypeId", m._id))
            .collect(),
          ctx.db
            .query("componentTransactions")
            .withIndex("by_component", (q) => q.eq("componentTypeId", m._id))
            .collect(),
          ctx.db
            .query("orderComponentReservations")
            .withIndex("by_component", (q) => q.eq("componentTypeId", m._id))
            .collect(),
        ]);

        // Full-scan filter acceptable for one-shot admin usage.
        const ingredientBackedBy = await ctx.db
          .query("ingredients")
          .filter((q) => q.eq(q.field("ingredientComponentTypeId"), m._id))
          .first();

        rows.push({
          _id: m._id,
          code: m.code,
          name: m.name,
          isActive: m.isActive,
          createdAt: m.createdAt,
          unitCostIdr: m.unitCostIdr,
          ...(m.manualUnitCostIdr !== undefined
            ? { manualUnitCostIdr: m.manualUnitCostIdr }
            : {}),
          ...(m.cachedCalculatedCogs !== undefined
            ? { cachedCalculatedCogs: m.cachedCalculatedCogs }
            : {}),
          hasMeaningfulCost: hasMeaningfulCost(m),
          parentLinkCount: parentLinks.length,
          childLinkCount: childLinks.length,
          ingredientLinkCount: ingredientLinks.length,
          menuProductRefCount: menuProductRefs.length,
          inventoryBatchCount: inventoryBatches.length,
          componentStockCount: componentStockRows.length,
          componentTransactionCount: componentTransactions.length,
          orderReservationCount: orderReservations.length,
          ...(ingredientBackedBy?._id
            ? { ingredientBackedBy: ingredientBackedBy._id }
            : {}),
        });
      }

      dupGroups.push({ normalizedName: key, members: rows });
    }

    return {
      groupCount: dupGroups.length,
      groups: dupGroups,
      expectedCodesPresent,
      missingCanonicalCodes,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Merge duplicate production componentTypes grouped by normalized display name.
 *
 * See file header for full field-merge and survivor-selection contract.
 *
 * Phase 1: snapshot every row we'll touch (eliminates cross-iteration read
 *          races within a single mutation handler).
 * Phase 2: apply plan — repoint FKs, merge survivor fields, rename code if
 *          survivor was ING_ and a sibling had the canonical code (with
 *          global collision check), then soft-deactivate duplicates.
 *
 * Use `dryRun: true` to return the full plan without writing.
 */
export const mergeDuplicatesByName = mutation({
  args: {
    token: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const dryRun = args.dryRun ?? false;

    const allProduction = await ctx.db
      .query("componentTypes")
      .withIndex("by_category", (q) => q.eq("category", "production"))
      .collect();

    // Global set of live codes (for the rename collision guard). We remove
    // dup codes as we deactivate them so a later group can reclaim a code
    // that was freed earlier in this same run. Survivor renames add the new
    // code in.
    const liveCodesGlobal = new Set<string>(allProduction.map((c) => c.code));

    const groups = new Map<string, typeof allProduction>();
    for (const c of allProduction) {
      const key = normalizeName(c.name);
      const arr = groups.get(key);
      if (arr) arr.push(c);
      else groups.set(key, [c]);
    }

    type MergeReport = {
      normalizedName: string;
      survivor: {
        _id: Id<"componentTypes">;
        code: string;
        name: string;
        unitCostIdr: number;
        hasMeaningfulCost: boolean;
      };
      removed: Array<{
        _id: Id<"componentTypes">;
        code: string;
        unitCostIdr: number;
      }>;
      codeRename?: {
        from: string;
        to: string;
      };
      codeRenameSkipped?: {
        desiredCode: string;
        reason: string;
      };
      fieldMerges: FieldMergePlan[];
      repointed: {
        parentLinks: number;
        childLinks: number;
        ingredientLinks: number;
        menuProductRefs: number;
        ingredients: number;
        inventoryBatches: number;
        componentStockMerged: number;
        componentStockPatched: number;
        componentTransactions: number;
        orderReservations: number;
      };
      warnings: string[];
    };

    const merges: MergeReport[] = [];

    for (const [key, members] of groups) {
      if (members.length < 2) continue;

      // Deterministic survivor selection (pricing > code-prefix > createdAt > code > _id).
      const sorted = [...members].sort(compareSurvivorPriority);
      const survivor = sorted[0];
      const dupes = sorted.slice(1);
      const dupIds = new Set<string>(dupes.map((d) => d._id as string));

      const warnings: string[] = [];

      // ----------------------------------------------------------------
      // PHASE 1: snapshots (unchanged structure from prior version)
      // ----------------------------------------------------------------

      const dupParentLinks: Array<{
        _id: Id<"productionComponentLinks">;
        childComponentId: Id<"componentTypes">;
      }> = [];
      const dupChildLinks: Array<{
        _id: Id<"productionComponentLinks">;
        parentComponentId: Id<"componentTypes">;
      }> = [];
      for (const dup of dupes) {
        const dupParents = await ctx.db
          .query("productionComponentLinks")
          .withIndex("by_parent", (q) => q.eq("parentComponentId", dup._id))
          .collect();
        for (const l of dupParents) {
          dupParentLinks.push({ _id: l._id, childComponentId: l.childComponentId });
        }
        const dupChildren = await ctx.db
          .query("productionComponentLinks")
          .withIndex("by_child", (q) => q.eq("childComponentId", dup._id))
          .collect();
        for (const l of dupChildren) {
          dupChildLinks.push({ _id: l._id, parentComponentId: l.parentComponentId });
        }
      }

      const survivorChildrenSet = new Set<string>(
        (
          await ctx.db
            .query("productionComponentLinks")
            .withIndex("by_parent", (q) => q.eq("parentComponentId", survivor._id))
            .collect()
        ).map((l) => l.childComponentId as string)
      );
      const parentToChildrenCache = new Map<string, Set<string>>();
      parentToChildrenCache.set(survivor._id as string, survivorChildrenSet);
      for (const link of dupChildLinks) {
        const pid = link.parentComponentId as string;
        if (parentToChildrenCache.has(pid)) continue;
        if (dupIds.has(pid)) continue;
        const peers = await ctx.db
          .query("productionComponentLinks")
          .withIndex("by_parent", (q) => q.eq("parentComponentId", link.parentComponentId))
          .collect();
        parentToChildrenCache.set(
          pid,
          new Set(peers.map((p) => p.childComponentId as string))
        );
      }

      const dupIngredientLinks: Array<{ _id: Id<"productionComponentIngredients"> }> = [];
      const dupMenuProductRefs: Array<{ _id: Id<"menuProductComponents"> }> = [];
      const dupInventoryBatches: Array<{ _id: Id<"inventoryBatches"> }> = [];
      const dupComponentTransactions: Array<{ _id: Id<"componentTransactions"> }> = [];
      const dupOrderReservations: Array<{ _id: Id<"orderComponentReservations"> }> = [];
      const dupStockByLocation = new Map<
        string,
        Array<{
          _id: Id<"componentStock">;
          locationId: Id<"storageLocations">;
          totalStock: number;
          totalReserved: number;
          weightedUnitCostIdr: number;
        }>
      >();

      for (const dup of dupes) {
        const [ingLinks, mpRefs, invBatches, stockRows, txns, reservations] = await Promise.all([
          ctx.db
            .query("productionComponentIngredients")
            .withIndex("by_component", (q) => q.eq("componentTypeId", dup._id))
            .collect(),
          ctx.db
            .query("menuProductComponents")
            .withIndex("by_component_type", (q) => q.eq("componentTypeId", dup._id))
            .collect(),
          ctx.db
            .query("inventoryBatches")
            .withIndex("by_component", (q) => q.eq("componentTypeId", dup._id))
            .collect(),
          ctx.db
            .query("componentStock")
            .withIndex("by_component", (q) => q.eq("componentTypeId", dup._id))
            .collect(),
          ctx.db
            .query("componentTransactions")
            .withIndex("by_component", (q) => q.eq("componentTypeId", dup._id))
            .collect(),
          ctx.db
            .query("orderComponentReservations")
            .withIndex("by_component", (q) => q.eq("componentTypeId", dup._id))
            .collect(),
        ]);
        for (const l of ingLinks) dupIngredientLinks.push({ _id: l._id });
        for (const r of mpRefs) dupMenuProductRefs.push({ _id: r._id });
        for (const b of invBatches) dupInventoryBatches.push({ _id: b._id });
        for (const t of txns) dupComponentTransactions.push({ _id: t._id });
        for (const r of reservations) dupOrderReservations.push({ _id: r._id });
        for (const s of stockRows) {
          const entry = {
            _id: s._id,
            locationId: s.locationId,
            totalStock: s.totalStock,
            totalReserved: s.totalReserved,
            weightedUnitCostIdr: s.weightedUnitCostIdr,
          };
          const arr = dupStockByLocation.get(s.locationId as string);
          if (arr) arr.push(entry);
          else dupStockByLocation.set(s.locationId as string, [entry]);
        }
      }

      const survivorStockByLocation = new Map<
        string,
        {
          _id: Id<"componentStock">;
          totalStock: number;
          totalReserved: number;
          weightedUnitCostIdr: number;
        }
      >();
      for (const s of await ctx.db
        .query("componentStock")
        .withIndex("by_component", (q) => q.eq("componentTypeId", survivor._id))
        .collect()) {
        survivorStockByLocation.set(s.locationId as string, {
          _id: s._id,
          totalStock: s.totalStock,
          totalReserved: s.totalReserved,
          weightedUnitCostIdr: s.weightedUnitCostIdr,
        });
      }

      const dupIngredientsRefs: Array<{ _id: Id<"ingredients"> }> = [];
      for (const dup of dupes) {
        const refs = await ctx.db
          .query("ingredients")
          .filter((q) => q.eq(q.field("ingredientComponentTypeId"), dup._id))
          .collect();
        for (const ing of refs) dupIngredientsRefs.push({ _id: ing._id });
      }

      // ----------------------------------------------------------------
      // PHASE 1b: build field-merge plan + code-rename plan
      // ----------------------------------------------------------------

      // Field merge: look at dupes in priority order (best first) so that
      // first non-empty value wins consistently.
      const { patch: fieldPatch, plan: fieldMerges } = buildFieldMergePlan(
        survivor,
        dupes
      );

      // Code rename: survivor carries ING_ AND some dup carries the canonical
      // code. Adopt the canonical code — with collision guard against any
      // other live code in the whole table.
      let codeRename: { from: string; to: string } | undefined;
      let codeRenameSkipped: { desiredCode: string; reason: string } | undefined;

      if (survivor.code.startsWith("ING_")) {
        const canonicalDup = dupes.find((d) => !d.code.startsWith("ING_"));
        if (canonicalDup) {
          const desired = canonicalDup.code;
          // Dupe's code is about to be freed (deactivated) — but we don't
          // free the code string until we've deactivated the dupe row. For
          // the rename collision check we remove the dup's code from the
          // liveCodesGlobal set preemptively since we know we're about to
          // free it. Other live codes (outside this group) must not collide.
          const preserved = new Set(liveCodesGlobal);
          // Remove ALL dup codes from this group — they're all about to be deactivated.
          for (const d of dupes) preserved.delete(d.code);
          // Remove survivor's current ING_ code since it'll be replaced.
          preserved.delete(survivor.code);

          if (preserved.has(desired)) {
            codeRenameSkipped = {
              desiredCode: desired,
              reason: `Another active componentType already uses code "${desired}" outside this duplicate group; rename skipped to avoid by_code collision.`,
            };
            warnings.push(codeRenameSkipped.reason);
          } else {
            codeRename = { from: survivor.code, to: desired };
          }
        }
      }

      // ----------------------------------------------------------------
      // PHASE 2: apply plan (writes gated by dryRun)
      // ----------------------------------------------------------------

      let parentRepointed = 0;
      let childRepointed = 0;
      let ingredientRepointed = 0;
      let menuProductRepointed = 0;
      let ingredientsRepointed = 0;
      let inventoryBatchesRepointed = 0;
      let componentStockMerged = 0;
      let componentStockPatched = 0;
      let componentTransactionsRepointed = 0;
      let orderReservationsRepointed = 0;

      // productionComponentLinks — dup as parent
      for (const link of dupParentLinks) {
        const childIdStr = link.childComponentId as string;
        if (survivorChildrenSet.has(childIdStr)) {
          if (!dryRun) await ctx.db.delete(link._id);
        } else {
          if (!dryRun) await ctx.db.patch(link._id, { parentComponentId: survivor._id });
          survivorChildrenSet.add(childIdStr);
        }
        parentRepointed++;
      }

      // productionComponentLinks — dup as child
      for (const link of dupChildLinks) {
        const parentIdStr = link.parentComponentId as string;
        if (parentIdStr === (survivor._id as string)) {
          if (!dryRun) await ctx.db.delete(link._id);
          childRepointed++;
          continue;
        }
        if (dupIds.has(parentIdStr)) continue; // handled by dupParentLinks
        const existingSet = parentToChildrenCache.get(parentIdStr);
        if (existingSet?.has(survivor._id as string)) {
          if (!dryRun) await ctx.db.delete(link._id);
        } else {
          if (!dryRun) await ctx.db.patch(link._id, { childComponentId: survivor._id });
          existingSet?.add(survivor._id as string);
        }
        childRepointed++;
      }

      for (const link of dupIngredientLinks) {
        if (!dryRun) await ctx.db.patch(link._id, { componentTypeId: survivor._id });
        ingredientRepointed++;
      }
      for (const ref of dupMenuProductRefs) {
        if (!dryRun) await ctx.db.patch(ref._id, { componentTypeId: survivor._id });
        menuProductRepointed++;
      }
      for (const ing of dupIngredientsRefs) {
        if (!dryRun) await ctx.db.patch(ing._id, { ingredientComponentTypeId: survivor._id });
        ingredientsRepointed++;
      }
      for (const batch of dupInventoryBatches) {
        if (!dryRun) await ctx.db.patch(batch._id, { componentTypeId: survivor._id });
        inventoryBatchesRepointed++;
      }

      for (const [locationIdStr, dupRows] of dupStockByLocation) {
        for (const dupStock of dupRows) {
          const survivorStock = survivorStockByLocation.get(locationIdStr);
          if (survivorStock) {
            const combinedStock = survivorStock.totalStock + dupStock.totalStock;
            const newWeighted =
              combinedStock > 0
                ? (survivorStock.weightedUnitCostIdr * survivorStock.totalStock +
                    dupStock.weightedUnitCostIdr * dupStock.totalStock) /
                  combinedStock
                : survivorStock.weightedUnitCostIdr;
            if (!dryRun) {
              await ctx.db.patch(survivorStock._id, {
                totalStock: combinedStock,
                totalReserved: survivorStock.totalReserved + dupStock.totalReserved,
                weightedUnitCostIdr: newWeighted,
                lastUpdated: Date.now(),
              });
              await ctx.db.delete(dupStock._id);
            }
            survivorStock.totalStock = combinedStock;
            survivorStock.totalReserved += dupStock.totalReserved;
            survivorStock.weightedUnitCostIdr = newWeighted;
            componentStockMerged++;
          } else {
            if (!dryRun) {
              await ctx.db.patch(dupStock._id, { componentTypeId: survivor._id });
            }
            survivorStockByLocation.set(locationIdStr, {
              _id: dupStock._id,
              totalStock: dupStock.totalStock,
              totalReserved: dupStock.totalReserved,
              weightedUnitCostIdr: dupStock.weightedUnitCostIdr,
            });
            componentStockPatched++;
          }
        }
      }

      for (const txn of dupComponentTransactions) {
        if (!dryRun) await ctx.db.patch(txn._id, { componentTypeId: survivor._id });
        componentTransactionsRepointed++;
      }
      for (const res of dupOrderReservations) {
        if (!dryRun) await ctx.db.patch(res._id, { componentTypeId: survivor._id });
        orderReservationsRepointed++;
      }

      // ---- Apply field merges onto survivor ----
      const patchForSurvivor: Record<string, unknown> = { ...fieldPatch };
      if (codeRename) {
        patchForSurvivor.code = codeRename.to;
      }
      if (Object.keys(patchForSurvivor).length > 0 && !dryRun) {
        await ctx.db.patch(survivor._id, patchForSurvivor as Partial<ComponentTypeDoc>);
      }

      // Update global live-code set to reflect the plan outcome.
      if (codeRename) {
        liveCodesGlobal.delete(codeRename.from);
        liveCodesGlobal.add(codeRename.to);
      }
      for (const dup of dupes) {
        liveCodesGlobal.delete(dup.code);
      }

      // ---- Soft-deactivate duplicates ----
      for (const dup of dupes) {
        if (!dryRun) await ctx.db.patch(dup._id, { isActive: false });
      }

      // Effective survivor code (for the report): renamed value if applied.
      const effectiveSurvivorCode = codeRename ? codeRename.to : survivor.code;

      merges.push({
        normalizedName: key,
        survivor: {
          _id: survivor._id,
          code: effectiveSurvivorCode,
          name: survivor.name,
          unitCostIdr:
            (fieldPatch.unitCostIdr as number | undefined) ?? survivor.unitCostIdr,
          hasMeaningfulCost:
            hasMeaningfulCost(survivor) ||
            (fieldPatch.unitCostIdr !== undefined &&
              (fieldPatch.unitCostIdr as number) > 0),
        },
        removed: dupes.map((d) => ({
          _id: d._id,
          code: d.code,
          unitCostIdr: d.unitCostIdr,
        })),
        ...(codeRename ? { codeRename } : {}),
        ...(codeRenameSkipped ? { codeRenameSkipped } : {}),
        fieldMerges,
        repointed: {
          parentLinks: parentRepointed,
          childLinks: childRepointed,
          ingredientLinks: ingredientRepointed,
          menuProductRefs: menuProductRepointed,
          ingredients: ingredientsRepointed,
          inventoryBatches: inventoryBatchesRepointed,
          componentStockMerged,
          componentStockPatched,
          componentTransactions: componentTransactionsRepointed,
          orderReservations: orderReservationsRepointed,
        },
        warnings,
      });
    }

    return {
      dryRun,
      groupsMerged: merges.length,
      merges,
    };
  },
});
