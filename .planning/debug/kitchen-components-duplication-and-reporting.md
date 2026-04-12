---
status: awaiting_human_verify
trigger: "Components page shows duplicates and is missing filling pistachio/nutella filling/outer marshmallow. Kitchen reporting only shows Dubai pieces at the top; hazelnut missing."
created: 2026-04-12T00:00:00Z
updated: 2026-04-12T11:00:00Z
---

## Current Focus

hypothesis: Three related root causes, one code bug + two data bugs.
  (A) Kitchen "Balls Produced" visibility is hardcoded to BIG_BALL/MID_BALL via
      `config.enabledProductionComponents ?? ['BIG_BALL', 'MID_BALL']` in KitchenViewV2.
      Any menu product whose BOM ball type is neither BIG_BALL nor MID_BALL is
      filtered out (e.g. Hazelnut-Regular → HAZELNUT_REGULAR code).
  (B) Kitchen ball totals in `getKitchenTargetsForDate` are hardcoded to two
      codes — BIG_BALL accumulated into `bigBalls`, MID_BALL into `midBalls`,
      every other production component ignored for ball-count aggregation.
  (C) Components page duplicates are NOT caused by a query join bug — the
      `getComponentsWithTiers` query pulls directly from `componentTypes` by
      category index with no join. Duplication must come from actual duplicate
      rows in `componentTypes`. Two legitimate creation paths can introduce
      duplicates for the same logical component:
        1. `componentTypes/seed:seedLeafKitchenComponents` creates `FILLING_PISTACHIO`,
           `NUTELLA_FILLING`, `OUTER_MARSHMALLOW`, etc.
        2. `componentTypes/mutations:createIngredientComponentType` creates
           `ING_FILLING_PISTACHIO` / `ING_NUTELLA_FILLING` / `ING_OUTER_MARSHMALLOW`
           when an ingredient with the same (or similar) name has inventory
           tracking enabled via the IngredientsManager "Enable Tracking" button.
      Both would show up as "production" componentTypes with the same display
      name (or near-identical), producing visual duplicates.
  (D) Missing components ("filling pistachio", "nutella filling", "outer
      marshmallow") are absent because `seedLeafKitchenComponents` was never
      run against the production Convex deployment (the seed is idempotent
      but must be invoked from the Convex dashboard Functions tab).

test: Inspect seed + query + filter code paths. Confirm code-fix scope for
  (A)/(B). Add a dedupe/cleanup mutation for (C). Provide a one-shot admin
  helper to report current duplicates so user can verify before/after.
expecting:
  - Code fix: kitchen reporting filter no longer strips non-BIG/MID ball types
    that appear in menu product BOMs.
  - Code fix: getKitchenTargetsForDate aggregates ball totals for any
    `category="production"` `unit="pcs"` componentType, not just the two legacy codes.
  - Seed: run `componentTypes/seed:seedLeafKitchenComponents` from Convex
    dashboard (already idempotent) to create missing kitchen components.
  - Dedup: admin-only mutation that scans componentTypes (category="production"),
    detects orphan `ING_*` rows that shadow a seeded code by name, reports them,
    and offers a migration to merge (re-point dependents, soft-deactivate duplicate).

next_action: Read remaining artifacts (menuProductComponents source, Packaging
  bar, InventoryManager ingredients tab) to confirm no regressions, then
  implement fixes.

## Symptoms

expected:
  1. Components page shows each component type exactly once, no duplicates.
  2. All critical components are present: "filling pistachio", "nutella filling",
     "outer marshmallow", and similar production/filling components.
  3. Kitchen reporting allows recording production for BOTH "dubai" pieces AND
     "hazelnut" pieces (and other product variants).

actual:
  1. Duplicate entries on Components page.
  2. Critical components missing: "filling pistachio", "nutella filling",
     "outer marshmallow".
  3. Kitchen reporting only shows "dubai" at the top; hazelnut entry is not
     rendered.

errors: None — pure data/UI visibility issue.

reproduction:
  - Navigate to /components/production. Observe duplicates + missing entries.
  - Navigate to Kitchen page (KitchenViewV2). Under "Balls Produced", only
    Dubai-style products appear; Hazelnut is hidden.

started: Unclear. Phase 78 (Product Inventory Substitution) landed 2026-04-12
  but did not touch componentTypes/menuProductComponents/kitchenConfig. Most
  likely the latent code bugs were exposed by user creating Dubai/Hazelnut
  products with a BOM that uses HAZELNUT_REGULAR.

## Eliminated

- hypothesis: `getComponentsWithTiers` joins menuProductComponents and lacks dedup.
  evidence: File read; query does `ctx.db.query("componentTypes").withIndex("by_category", production).collect()` then maps over `computeTier`. No joins that could cause duplicates. Duplicates must come from actual duplicate rows in the table.
  timestamp: 2026-04-12T00:10:00Z

- hypothesis: Phase 78 regressed the kitchen view queries.
  evidence: `git show --stat a98d13b6` shows Phase 78 touched productInventory/*, menuProducts schema (fulfillFromProductId/fulfillMultiplier), AvailabilityPanel, ProductForm, docs. NOT componentTypes, menuProductComponents, kitchenConfig, kitchenComponents, or productionRecipes.
  timestamp: 2026-04-12T00:12:00Z

- hypothesis: `enabledKitchenComponents:[]` empty-array bug strikes again for hazelnut.
  evidence: That bug affects the "Components Produced" gram-input section (Phase 69). The user's complaint is about **balls** ("dubai pieces" / "hazelnut production"), which flow through the `packagingBreakdown` + `visibleItems` filter, not `visibleKitchenComponents`. Different codepath.
  timestamp: 2026-04-12T00:15:00Z

## Evidence

- timestamp: 2026-04-12T00:05:00Z
  checked: src/pages/KitchenViewV2.tsx line 71
  found: `const enabledComponents: string[] = config?.enabledProductionComponents ?? ['BIG_BALL', 'MID_BALL'];`
  implication: If user never explicitly saved production-component toggles, only BIG_BALL and MID_BALL pass through. Any menu product whose BOM ball type is HAZELNUT_REGULAR (or any other production `pcs` code) is invisible in EndOfShiftForm — filter at line 158 is `ballTypes.some(bt => enabledComponents.includes(bt))`.

- timestamp: 2026-04-12T00:07:00Z
  checked: convex/kitchenConfig/queries.ts lines 155-160 (getKitchenTargetsForDate)
  found: ```if (componentType.code === "BIG_BALL") { bigBalls += comp.quantity * plannedQty; } else if (componentType.code === "MID_BALL") { midBalls += comp.quantity * plannedQty; }```
  implication: Any production ball type other than the two legacy codes is silently dropped from target aggregation. Kitchen View cannot even ask the user to produce it because the target count is zero and the UI expects BIG/MID buckets.

- timestamp: 2026-04-12T00:09:00Z
  checked: convex/componentTypes/seed.ts `seedLeafKitchenComponents` (lines 181-352)
  found: Idempotent seed that inserts 12 componentTypes (11 g-unit leaves + HAZELNUT_REGULAR tier-1 pcs ball) and productionComponentLinks from each leaf to BIG_BALL and MID_BALL, plus NUTELLA_FILLING → HAZELNUT_REGULAR. Skips existing by code.
  implication: If the seed was never run on the user's deployment, "filling pistachio", "nutella filling", "outer marshmallow" simply do not exist as componentTypes rows — the Components page correctly renders nothing for them.

- timestamp: 2026-04-12T00:11:00Z
  checked: convex/componentTypes/mutations.ts `createIngredientComponentType` (lines 356-431)
  found: Auto-generates code `ING_<INGREDIENT_NAME>` and inserts a new componentType with category="production", trackInventory=true. Bidirectionally links the ingredient via `ingredientComponentTypeId`. Does NOT check for an existing componentType with the same *name* (only checks for code uniqueness with a suffix loop).
  implication: If the user enabled inventory tracking on ingredients named "Filling-Pistachio", "Nutella Filling", "Outer-Marshmallow" (which is what they'd do for kitchen cost tracking), a second componentType with a different code (ING_FILLING_PISTACHIO etc.) but the same display name is created. Both appear on the Components page → visual duplicate.

- timestamp: 2026-04-12T00:13:00Z
  checked: convex/productionRecipes/queries.ts getComponentsWithTiers (lines 113-138)
  found: Pure table scan on componentTypes by_category index, tier computation per row. No joins, no risk of N-times multiplication.
  implication: Duplicates in the UI reflect duplicates in the underlying table.

## Resolution

root_cause:
  Three issues with distinct root causes:
  (A) CODE BUG — KitchenViewV2 defaults `enabledComponents` to ['BIG_BALL','MID_BALL']
      when kitchenConfig.enabledProductionComponents is null. This default hides
      any menu product whose BOM ball code is neither BIG_BALL nor MID_BALL
      (e.g. HAZELNUT_REGULAR). The correct default is "null = all enabled",
      which should include every production `pcs` componentType.
  (B) CODE BUG — getKitchenTargetsForDate hardcodes ball-total aggregation to
      two codes. Any other production `pcs` ball type contributes zero to
      targets, starving the downstream UI entirely.
  (C) DATA ISSUE — duplicate componentTypes rows from two creation paths
      (seedLeafKitchenComponents vs createIngredientComponentType on
       ingredients with the same name). Causes visual duplication.
  (D) DATA ISSUE — seedLeafKitchenComponents has never been run on the
      user's deployment, leaving the named critical components absent.

fix:
  (A) Default `enabledComponents` to null (all enabled) in KitchenViewV2 and
      derive the "all codes" view from componentTypesList when null.
  (B) Rewrite getKitchenTargetsForDate aggregation to sum qty*plannedQty
      across ALL production componentTypes (dynamic buckets by code) instead
      of just BIG/MID. Ball totals returned by the query expanded to a map
      keyed by component code. UI surfaces each bucket with a StatCard.
  (C) Add admin-only mutation `componentTypes/dedupe:mergeIngredientBackedDuplicates`
      that:
        - scans category="production" componentTypes
        - groups by normalized name (case-insensitive, trim, dashes→spaces)
        - for each group of >1, prefers the seeded (non-ING_) one as survivor
        - re-points productionComponentLinks, productionComponentIngredients,
          menuProductComponents, and any ingredient.ingredientComponentTypeId
          from dupe → survivor
        - soft-deactivates (isActive=false) or deletes the orphan
      Report-only dry-run flag so user can preview.
  (D) Add CLAUDE.md note reminding to run seedLeafKitchenComponents on each
      fresh deployment; no code change needed.

verification:
  - npm run type-check passes (post-round-3)
  - npm run build passes (built in 15.97s, post-round-3)
  - npx vitest run tests/convex/componentTypes.test.ts — 11/11 pass
  - Manual kitchen UI + components page verification pending user (seed run +
    browser check).

round 3 — data-correctness findings addressed (dedupe survivor rule):
  D1 — Survivor selection now prefers the row with MEANINGFUL cost
       (unitCostIdr > 0, or manualUnitCostIdr > 0, or cachedCalculatedCogs > 0).
       A priced ING_KUNAFA (Rp 120) now wins over an empty KUNAFA (Rp 0).
       Tiebreakers (non-ING_ → createdAt → code → _id) apply only when
       pricing is equal. Implemented as `compareSurvivorPriority` in
       convex/componentTypes/dedupe.ts.
  D2 — Code rename: if the chosen survivor's code starts with ING_ AND any
       sibling dup has a canonical (non-ING_) code, the survivor's code is
       patched to the canonical form before deactivating dupes. A global
       live-code collision guard prevents by_code index clashes with active
       rows outside the duplicate group. When a collision is detected the
       rename is SKIPPED (not aborted), the survivor keeps its ING_ code,
       and the reason is surfaced in `codeRenameSkipped` + `warnings[]`.
       The cross-group guard set is kept in sync through the run so freed
       codes stay available and renamed codes get reserved.
  D3 — Field merge: `buildFieldMergePlan` copies useful values from dupes
       onto the survivor for any survivor field that is null / undefined /
       0 / empty. First-non-empty-dup (dupes iterated in survivor-priority
       order) wins per field. Merged fields (schema-verified in
       convex/schema.ts lines 750–804): unitCostIdr, manualUnitCostIdr,
       cachedCalculatedCogs, gramsPerUnit, batchSize, batchSizeUnit,
       description, color, reorderPoint, reorderQuantity, alarmPercentage,
       consumptionStage. (`componentTypes` has NO direct ingredientId field
       — the link is reverse via ingredients.ingredientComponentTypeId,
       which is already repointed by the existing FK logic.)
  D4 — Sanity check: `reportDuplicatesByName` now returns
       `expectedCodesPresent: Record<string, boolean>` and
       `missingCanonicalCodes: string[]`, derived from a single source of
       truth `EXPECTED_CANONICAL_CODES` in convex/componentTypes/helpers.ts
       (15 canonical codes: BIG_BALL, MID_BALL, HAZELNUT_REGULAR + all 12
       leaves). Shows at a glance whether HAZELNUT_REGULAR etc actually
       exist in the DB before running merge.
  D5 — Dry-run output enriched. Each merge report entry now includes:
         - survivor { _id, code, name, unitCostIdr, hasMeaningfulCost }
           where `code` reflects any planned rename
         - removed [{ _id, code, unitCostIdr }, …]
         - codeRename?: { from, to }
         - codeRenameSkipped?: { desiredCode, reason }
         - fieldMerges: Array<{ field, fromValue, toValue }>
         - repointed counts (unchanged)
         - warnings: string[]
       Each member row in the report query also surfaces unitCostIdr,
       manualUnitCostIdr, cachedCalculatedCogs, hasMeaningfulCost.

round 2 — staff-review findings addressed (3 Critical + 4 Important + 1 Refinement):
  C1 — Dedupe now repoints 9 FK-like columns to componentTypes._id (added
       inventoryBatches, componentStock [merge-by-location with weighted
       average cost + dup-row delete], componentTransactions,
       orderComponentReservations). Prevents silent FIFO corruption on
       inactive rows.
  C2 — createIngredientComponentType now calls
       requireRole(ctx, token, ["admin","manager"]) at the top of the handler.
       Prevents kitchen/order_staff role from creating production
       componentTypes or patching ingredient FKs.
  C3 — Survivor selection tiebreakers fully deterministic:
       non-ING_ → createdAt → code.localeCompare → _id.localeCompare.
       Stable even for seeds created within the same millisecond.
  I1 — reportDuplicatesByName gated with
       requireRole(ctx, token, ["admin","manager"]).
  I2 — Two-phase mutation. Phase 1 collects ALL dup snapshots upfront into
       Maps/Sets (dupParentLinks, dupChildLinks, parentToChildrenCache,
       survivorChildrenSet, dupStockByLocation, survivorStockByLocation,
       dupIngredientLinks, dupMenuProductRefs, dupInventoryBatches,
       dupComponentTransactions, dupOrderReservations, dupIngredientsRefs).
       Phase 2 applies using in-memory state only — never re-reads a table
       we are mutating. Eliminates "second dup sees first dup's patched
       write" races. In-memory Sets are updated as we go so subsequent
       decisions stay consistent.
  I3 — Loading fallback in KitchenViewV2 returns undefined (no filter = show
       all) instead of the legacy two-code array. Confirmed both
       ProductionTargetsBar (line 46 `enabledComponents?: string[]`) and
       EndOfShiftForm (line 78 `enabledComponents?: string[]`) already
       accept optional + treat `!enabledComponents` as "show all".
  I4 — normalizeName extracted to convex/componentTypes/helpers.ts and
       imported by both mutations.ts and dedupe.ts (single source of truth).
  R1 — Extra ball-type StatCard grid uses `grid-cols-2 sm:grid-cols-3` for
       3+ items (mobile-friendly).
  R2 — Skipped per guidance (one-shot admin usage; full-scan filter
       documented inline).

files_changed (cumulative across rounds):
  - convex/componentTypes/helpers.ts             # NEW — normalizeName + EXPECTED_CANONICAL_CODES constant
  - convex/componentTypes/mutations.ts           # requireRole gate + helper import + reuse-by-name branch
  - convex/componentTypes/dedupe.ts              # NEW — cost-aware survivor selection, code rename w/ collision guard, field merge, rich dry-run output, 9 FK cols, two-phase plan, auth-gated
  - convex/kitchenConfig/queries.ts              # getKitchenTargetsForDate returns otherBalls for non-BIG/MID ball codes
  - src/pages/KitchenViewV2.tsx                  # enabledComponents default derives all production pcs codes; undefined during load
  - src/components/kitchen/ProductionTargetsBar.tsx  # renders StatCards for otherBalls; mobile-friendly grid

user actions required (on BOTH dev and prod Convex deployments):
  1. Deploy this branch (`fix/kitchen-components-dup-report`).
  2. From the Convex dashboard Functions tab, run in order:
       a. componentTypes/seed:seedLeafKitchenComponents { token }
          → ensures FILLING_PISTACHIO, NUTELLA_FILLING, OUTER_MARSHMALLOW,
            HAZELNUT_REGULAR, etc. exist. Idempotent.
       b. componentTypes/dedupe:reportDuplicatesByName { token }
          → preview duplicate groups + dependent-row counts + per-row unit
            cost. Also returns expectedCodesPresent + missingCanonicalCodes
            so you can confirm HAZELNUT_REGULAR and friends actually exist.
       c. componentTypes/dedupe:mergeDuplicatesByName { token, dryRun: true }
          → preview full merge plan: survivor (with final code reflecting
            any planned rename), removed rows, fieldMerges (e.g.
            `unitCostIdr: 0 → 120`), codeRename / codeRenameSkipped, and
            repointed counts. Sanity-check before applying.
       d. componentTypes/dedupe:mergeDuplicatesByName { token, dryRun: false }
          → apply merges. Token must belong to an admin user.
  2. After the deploy + seed + dedupe: reload Components page; confirm
     duplicates are gone and Filling-Pistachio/Nutella Filling/Outer-Marshmallow
     are all present.
  3. Reload Kitchen page; confirm Hazelnut products appear under
     "Balls Produced" and the Hazelnut-Regular StatCard appears at the top
     when dispatch plan has hazelnut BOM qty > 0.
