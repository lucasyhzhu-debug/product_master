---
status: awaiting_human_verify
trigger: "Kitchen view still shows duplicated components, toggles tied together, grammage recorded twice, Nutella-Regular missing from BALLS PRODUCED."
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T03:00:00Z
---

## Bug 7 — Kitchen Components sourced from wrong set (Round 4)
<!-- New symptom surfaced during human-verify for round-2/3 (screenshots 16-18). -->

### Symptom

- Manager Settings "KITCHEN COMPONENTS" toggles show only 2: Butter, Marshmallow.
- Expected: all active leaf sub-components referenced in tier-1 recipes:
  Butter, Filling Pistachio, Marshmallow, nutella_filling, Outer Marshmallow.
- The 2 that appear happen to exactly match /inventory Ingredients tab entries —
  suspicious coincidence suggesting the source is inventory-linked ingredients,
  not componentTypes leaves.

### Root cause

The kitchen-components filter was `tier === 0 && unit === "g"`. This worked
only for the two gram-tracked bulk ingredients (Butter, Marshmallow). It
excluded pcs-unit sub-components (Filling Pistachio 28g/pcs, Outer Marshmallow
15g/pcs, nutella_filling 45g/pcs) because the `unit === "g"` guard was added
in Phase 69 to keep tier-1 balls out when links were missing.

Screenshot 16/18 coincidence: the 2 ingredients in /inventory (Butter, Marshmallow)
happen to be the only leaf production componentTypes with `unit === "g"`, so
it LOOKED like the source was inventory. It wasn't — the filter just happened
to collapse to the same 2 rows. Confirmed by reading
`src/hooks/convex/useKitchenTargets.ts:44` and
`src/components/kitchen/ManagerTargetSettings.tsx:86`.

### Fix

Replace the `tier === 0 && unit === "g"` heuristic with the canonical
definition: a kitchen component is a production componentType referenced as
a CHILD of some tier-1+ recipe (i.e. appears in
`productionComponentLinks.childComponentId`).

- `convex/productionRecipes/queries.ts` — `getComponentsWithTiers` now
  collects `productionComponentLinks` once, builds a `recipeChildIds` Set,
  and tags each returned component with `isRecipeChild: boolean`.
- `src/hooks/convex/useKitchenTargets.ts` — kitchenComponents filter now
  `c.isActive && c.isRecipeChild` (was `tier===0 && unit==="g" && isActive`).
- `src/components/kitchen/ManagerTargetSettings.tsx` — kitchenComponentsList
  same change.
- `src/components/kitchen/ShiftEditDialog.tsx` — kitchenComponents same change
  (and added missing `isActive` filter).
- `src/components/kitchen/ComponentProductionSection.tsx` — input suffix now
  renders `comp.unit || "g"` instead of hardcoded "g", so pcs components
  show "pcs" next to the quantity field.
- `src/components/kitchen/EndOfShiftForm.tsx` — review and success payloads
  now include `unit` per entry.
- `src/components/kitchen/ShiftReviewModal.tsx` — renders `{grams}{unit || "g"}`
  for component produced + waste rows.
- `src/components/kitchen/ShiftSuccessScreen.tsx` — renders `{grams}{unit || "g"}`
  for component rows.

Jumbo/BIG_BALL is naturally excluded: it's directly linked to menu products
via `menuProductComponents` but NOT referenced as a child in any
`productionComponentLinks` row, so `isRecipeChild=false`. It stays in
PRODUCTION COMPONENTS (ball targets), not KITCHEN COMPONENTS.

### Evidence

- timestamp: 2026-04-16T02:50:00Z
  checked: src/hooks/convex/useKitchenTargets.ts:44, ManagerTargetSettings.tsx:86, ShiftEditDialog.tsx:93
  found: All three consumers filter `tier === 0 && c.unit === "g"`.
  implication: pcs sub-components never reach the kitchen UI regardless of
    isActive or seed status.

- timestamp: 2026-04-16T02:55:00Z
  checked: Screenshot 18 /components/production — leaf components list
  found: Active leaves are Butter (g), Filling Pistachio (pcs 28g),
    Jumbo (pcs 80g), Marshmallow (g), nutella_filling (pcs 45g),
    Outer Marshmallow (pcs 15g). Of these, only Butter + Marshmallow have
    unit="g" → matches the 2 toggles in screenshot 17.
  implication: Root cause confirmed — `unit==="g"` guard is too narrow.

- timestamp: 2026-04-16T03:00:00Z
  checked: convex/productionRecipes/queries.ts getComponentsWithTiers fix
  found: Now collects productionComponentLinks once, tags each component
    with isRecipeChild. Jumbo/BIG_BALL not referenced as child → excluded.
  implication: Kitchen consumers get the correct set automatically; no
    schema changes, no seed runs required.

- timestamp: 2026-04-16T03:05:00Z
  checked: npm run type-check + npm run build
  found: type-check passes clean; build completes in 20.71s with zero errors.
  implication: Round-4 fix is type-safe and ships.

### files_changed (round 4)
- convex/productionRecipes/queries.ts                     # add isRecipeChild tag
- src/hooks/convex/useKitchenTargets.ts                   # filter isRecipeChild
- src/components/kitchen/ManagerTargetSettings.tsx        # filter isRecipeChild
- src/components/kitchen/ShiftEditDialog.tsx              # filter isRecipeChild + isActive
- src/components/kitchen/ComponentProductionSection.tsx   # render native unit
- src/components/kitchen/EndOfShiftForm.tsx               # pass unit through
- src/components/kitchen/ShiftReviewModal.tsx             # render native unit
- src/components/kitchen/ShiftSuccessScreen.tsx           # render native unit

---

## Current Focus

hypothesis: Kitchen-view consumers of `getComponentsWithTiers`
  (ManagerTargetSettings.productionComponents / kitchenComponentsList and
  useKitchenTargets.kitchenComponents) do NOT filter by `isActive`.
  Round-1 dedupe SOFT-DEACTIVATES duplicate shadow rows via
  `ctx.db.patch(dup._id, { isActive: false })` — it never deletes them.
  The ProductionComponentsManager page works correctly because it explicitly
  filters `sortedComponents.filter((c) => c.isActive)` (line 223). The kitchen
  consumers do not. Result: inactive shadow rows leak into the Kitchen view as
  visual duplicates; each duplicate renders a row keyed by `_id` but reads/
  writes `componentProduced[code]` — two rows share the same code, so their
  toggles appear "linked" (same code flipped twice) and their grammage is
  submitted twice in `componentProducedList` (iterates duplicates, reads
  `componentProduced[code]` for each, producing N duplicate entries).

  Second bug (Nutella-Regular BALLS PRODUCED): `productBallTypes` map in
  KitchenViewV2 doesn't filter by `isActive` either — if a BOM link still
  points to an inactive row, its code is added. Additionally, BALLS PRODUCED
  only shows products that exist in `targets.packagingBreakdown`. That list
  is derived from dispatch plan or defaultPackagingMix, NOT from
  enabledComponents. Nutella-Regular won't appear unless the Nutella-Regular
  *menu product* is in the dispatch plan or packaging mix for the day. The
  user's mental model ("toggle ON = appears in BALLS PRODUCED") doesn't
  match the reality ("toggle ON = included in target calculation if the
  menu product is scheduled"). This is a UX gap, not a code bug in its
  narrow sense. The mitigation here is to (a) include Nutella-Regular ball
  totals in a dedicated StatCard via existing `otherBalls` (already shipped
  round-1 in `ProductionTargetsBar`), and (b) ensure the BOM→code resolution
  uses the ACTIVE survivor's code after dedupe so Nutella-Regular products
  added to the plan surface correctly.

test: Read dedupe.ts soft-deactivate path, confirm ProductionComponentsManager
  active-filter, then apply `.filter(c => c.isActive)` + `.filter` uniq-by-code
  in the kitchen consumers and verify type-check + build pass.

expecting:
  - After fix, kitchen UI renders each active componentType exactly once.
  - Submitting a shift records one entry per enabled component (no duplicates).
  - ProductionComponentsManager page unchanged (it already filters active).
  - No breaking type changes.

next_action: Apply fix in useKitchenTargets + ManagerTargetSettings +
  KitchenViewV2 (productBallTypes + enabledComponents default filter).

## Symptoms

expected:
  1. Each kitchen component appears exactly once.
  2. Nutella-Regular (HAZELNUT_REGULAR) shows as a reportable ball unit when
     the toggle is ON and the product is in today's plan.
  3. Single gram entry per component on submit.
  4. Toggling Marshmallow adds ONE row, not multiple.

actual:
  1. Manager Settings duplicates every Kitchen Component toggle (Butter×2,
     Cacao Powder×2, …, Pistachio Spread×2). Toggling one flips both
     (shared `code`).
  2. Nutella-Regular does NOT appear under BALLS PRODUCED even though
     toggle is ON.
  3. 2026-04-14 submission recorded "Pistachio Spread 7528g" twice in the
     same row (total 15056g).
  4. Enabling Marshmallow spawned 2 Marshmallow rows AND an extra
     Pistachio Spread row.
  5. `/components/production` Active list is CLEAN (no duplicates).

errors: None.

reproduction:
  - Navigate to Kitchen → observe duplicated Kitchen Components toggles.
  - Navigate to `/components/production` → observe single rows.
  - Enable Marshmallow → duplicate rows + Pistachio Spread extras appear.
  - Submit End of Shift → componentProduced payload contains duplicate
    entries per code.

started: After round-1 dedupe fix (branch `fix/kitchen-components-dup-report`)
  was merged and the admin ran seedLeafKitchenComponents +
  mergeDuplicatesByName. Round-1 deactivated dupe rows rather than deleting
  them, leaving the Kitchen view consumers (which don't filter by isActive)
  rendering inactive shadows.

## Eliminated

- hypothesis: Dedupe mutation wasn't run on user's deployment.
  evidence: Screenshot 12 (/components/production Active section) shows a
    single row per canonical component name. That page filters
    `isActive=true`, so single-row Active list means either (a) dedupe ran
    and soft-deactivated dupes, or (b) there were never dupes. Either way,
    the Active layer is clean.
  timestamp: 2026-04-16T00:05:00Z

- hypothesis: `getComponentsWithTiers` query joins menuProductComponents
  and N-multiplies.
  evidence: Query does `ctx.db.query("componentTypes").withIndex("by_category", production).collect()` then `computeTier` per row. Flat scan,
    no joins. Verified for round-1.
  timestamp: 2026-04-16T00:06:00Z

- hypothesis: `componentProduced[code]` stores duplicates as a list.
  evidence: Line 142 EndOfShiftForm — state is `Record<string, number>`,
    last write wins. But `componentProducedList` at line 308 iterates
    `visibleKitchenComponents` (may contain duplicate code rows), reads
    `componentProduced[c.code]` for each, producing duplicate ARRAY entries
    with identical grams. That's the doubling mechanism.
  timestamp: 2026-04-16T00:07:00Z

## Evidence

- timestamp: 2026-04-16T00:08:00Z
  checked: convex/componentTypes/dedupe.ts line 757
  found: `if (!dryRun) await ctx.db.patch(dup._id, { isActive: false });`
  implication: Dedupe is SOFT deactivate. Dupe rows remain in the table
    with `isActive=false`. Queries that don't filter by isActive still
    return them.

- timestamp: 2026-04-16T00:09:00Z
  checked: src/pages/ProductionComponentsManager.tsx line 223
  found: `const activeComponents = sortedComponents.filter((c) => c.isActive);`
  implication: This page silently hides inactive rows. That's why screenshot 12 is clean.

- timestamp: 2026-04-16T00:10:00Z
  checked: src/hooks/convex/useKitchenTargets.ts lines 37-41 + ManagerTargetSettings.tsx lines 67-77
  found: Both filter only by `tier`/`unit`/`category`. NO `isActive` filter.
  implication: Inactive shadow rows flow straight into the Kitchen UI toggles
    and the "Components Produced" gram-input list.

- timestamp: 2026-04-16T00:11:00Z
  checked: src/pages/KitchenViewV2.tsx lines 97-111 (productBallTypes)
  found: Builds `codeMap` from `componentTypesList.filter(ct => ct.category === 'production')`. Does NOT filter by `isActive`. If a BOM link still
    points to an inactive row, `codeMap.get()` returns the inactive row's
    code, which may not match any active `enabledComponents` entry.
  implication: `productBallTypes[menuProductId]` can contain stale codes
    that make `visibleItems` filter behave unexpectedly. Fix: exclude
    inactive rows from codeMap.

- timestamp: 2026-04-16T00:12:00Z
  checked: src/components/kitchen/EndOfShiftForm.tsx line 308
  found: `componentProducedList = visibleKitchenComponents.filter(...).map(c => ({..., grams: componentProduced[c.code]!}))`
  implication: If `visibleKitchenComponents` contains two rows with same
    code, map produces two payload entries with identical grams. That's
    the 2026-04-14 "Pistachio Spread 7528g + Pistachio Spread 7528g"
    shift record.

## Bug 5 — Ball Targets editor hardcoded to BIG_BALL/MID_BALL
<!-- New symptom surfaced during human-verify for round-2 (screenshot 14). -->

- timestamp: 2026-04-16T01:30:00Z
  checked: src/components/kitchen/ManagerTargetSettings.tsx lines 264-293 (pre-fix)
  found: Ball Targets renders only two inputs — "Original (45g)" bound to
    `midBallTarget` and "Jumbo (80g)" bound to `bigBallTarget`. Nutella-Regular
    (HAZELNUT_REGULAR) and any other active+enabled tier-1 pcs code gets no
    input, so the user cannot set a default target for it.
  implication: Classic "hardcoded to two codes" pattern. Must iterate
    `productionComponents.filter(unit=='pcs')` and render one input per code.
    Needs a schema field to persist non-BIG/MID targets.

- timestamp: 2026-04-16T01:35:00Z
  checked: convex/schema.ts kitchenConfig table (pre-fix)
  found: Schema has `bigBallTarget: v.number()` + `midBallTarget: v.number()`
    as fixed-shape fields. No variable-key storage for other codes.
  implication: Added an additive `otherBallTargets: v.optional(v.array({code, target}))`
    alongside the legacy fields — no breaking schema change.

- timestamp: 2026-04-16T01:40:00Z
  checked: convex/kitchenConfig/queries.ts getKitchenTargetsForDate
    (Priority 3 defaults branch)
  found: Pre-fix returned `otherBalls: []` for the defaults branch. Dispatch-plan
    branch already surfaces otherBalls via BOM traversal.
  implication: Defaults branch now reads `config.otherBallTargets`, looks up
    componentType name by code, and returns one otherBalls entry per non-zero
    target — ProductionTargetsBar already renders StatCards for these.

## Bug 6 — Dispatch plan dropdown filters products to BIG_BALL/MID_BALL only
<!-- New symptom surfaced during human-verify for round-2 (screenshot 13). -->

- timestamp: 2026-04-16T01:45:00Z
  checked: src/components/kitchen/PackagingMixEditor.tsx lines 61-93 + 322-373 (pre-fix)
  found: `getBomInfo` hardcoded to track only `bigBallsPerUnit` (BIG_BALL) and
    `midBallsPerUnit` (MID_BALL). Sections hardcoded to two groups. Dropdown
    `getAvailableForGroup` checked only these two codes. Any menu product whose
    BOM uses HAZELNUT_REGULAR got zero balls tracked, didn't match either
    section, and fell into "Other (no BOM data)" — but could not be added via
    any dropdown because no section for its code exists.
  implication: Rewrote `BomInfo` to `ballsByCode: Record<string, number>`.
    Added `ballGroups: BallGroupDef[]` prop so ManagerTargetSettings drives
    sections dynamically from the active+enabled tier-1 pcs components. Each
    code gets one section, one dropdown, one target counter. Products are
    placed into exactly one section (primary code = first ballGroup code their
    BOM includes with qty>0) to prevent double-counting.

## Resolution

root_cause:
  Two-layer bug, one root cause:
  (1) `getComponentsWithTiers` returns ALL rows (active + inactive). Round-1
      dedupe soft-deactivates duplicates via `isActive=false` without
      deletion. Kitchen-facing consumers do not filter by `isActive`, so
      shadow rows leak into:
        - ManagerTargetSettings production/kitchen toggles
        - useKitchenTargets.kitchenComponents
        - KitchenViewV2 productBallTypes codeMap
        - (transitively) EndOfShiftForm visibleKitchenComponents +
          componentProducedList (duplicate submit payload).
  (2) ProductionComponentsManager happens to filter isActive client-side,
      which is why that page looks clean (screenshot 12).

  The "Nutella-Regular missing from BALLS PRODUCED" is not a bug per se —
  BALLS PRODUCED is derived from `targets.packagingBreakdown`, which only
  includes menu products in the dispatch plan or defaultPackagingMix.
  However, stale inactive codes in `productBallTypes` can still cause
  mismatches. After the isActive filter the resolution is deterministic.

fix:
  - Filter `isActive === true` at the kitchen consumer layer:
      * src/hooks/convex/useKitchenTargets.ts kitchenComponents
      * src/components/kitchen/ManagerTargetSettings.tsx productionComponents + kitchenComponentsList
      * src/pages/KitchenViewV2.tsx codeMap (productBallTypes) +
        enabledComponents default-derivation (already filters isActive,
        keep as-is)
  - Defensive: dedupe-by-code within the consumer via Map so even if two
    active rows ever share a code (schema doesn't enforce uniqueness),
    only the first wins in the UI.

verification:
  - `npm run type-check` passes (no errors, post Bug-5/6 fixes)
  - `npm run build` passes (built in 19.38s, post Bug-5/6 fixes)
  - Manual browser verification pending user

fix (Bug 5 — Ball Targets editor):
  - Schema: added additive `otherBallTargets: v.optional(v.array({code, target}))`
    to `kitchenConfig` alongside existing bigBallTarget/midBallTarget.
  - Backend getConfig: returns `otherBallTargets` (default []).
  - Backend updateConfig: accepts + validates + persists `otherBallTargets`.
  - Backend getKitchenTargetsForDate (defaults branch): reads
    `config.otherBallTargets`, resolves componentType names via `by_code`
    index, emits `otherBalls` entries so ProductionTargetsBar StatCards render.
  - Frontend ManagerTargetSettings: replaced the two hardcoded Input rows with
    a memoized `ballTargetRows` list derived from
    `productionComponents.filter(unit=='pcs')`. Grid auto-adjusts for 1/2/3+
    inputs. BIG_BALL/MID_BALL keep dedicated state for backward compat; every
    other code reads/writes `otherBallTargets[code]`. Disabled codes still
    surface (dimmed) so users can enable + target in one save action.
  - Override validation: checks any non-zero ball target (not just BIG/MID).
  - maxProductionTarget legacy field now counts totalBalls across all codes.

fix (Bug 6 — Dispatch plan dropdown):
  - Frontend PackagingMixEditor: rewrote `BomInfo` to
    `ballsByCode: Record<string, number>` (was bigBallsPerUnit/midBallsPerUnit).
  - Replaced hardcoded two sections with `ballGroups: BallGroupDef[]` prop.
    Each group = { code, title, target }. Rendered in order.
  - Products assigned to exactly one section via `primaryCodeForRow` (first
    ballGroup code their BOM has qty>0 for) to prevent double-count when a
    product's BOM uses multiple codes.
  - `getAvailableForGroup(code)` only lists products whose primary code matches
    and who aren't already in the mix.
  - ManagerTargetSettings builds `ballGroups` from `ballTargetRows` with
    title format "{Name} Products ({gramsPerUnit}g)" when grams are known,
    else "{Name} Products".

files_changed (cumulative across rounds):
  - convex/schema.ts                                      # +otherBallTargets field, +componentTracking field
  - convex/kitchenConfig/queries.ts                       # surface otherBallTargets + componentTracking in getConfig + defaults branch
  - convex/kitchenConfig/mutations.ts                     # accept + validate + persist otherBallTargets + componentTracking
  - src/hooks/convex/useKitchenTargets.ts                 # [round-2 primary] isActive filter, [round-5] unitByCode from componentTracking
  - src/components/kitchen/ManagerTargetSettings.tsx      # [round-2 + Bug 5] dynamic ball target rows, [round-5] unified Component Tracking table
  - src/components/kitchen/PackagingMixEditor.tsx         # [Bug 6] dynamic ballGroups, BomInfo.ballsByCode
  - src/components/kitchen/EndOfShiftForm.tsx             # [round-5] accept unitByCode, apply configured unit to visibleKitchenComponents
  - src/components/kitchen/ComponentProductionSection.tsx # [round-5] waste unit label uses component unit (not hardcoded "g")
  - src/pages/KitchenViewV2.tsx                           # [round-2] enabledComponents derivation, [round-5] componentTracking-aware derivation, pass unitByCode

## Round 5 — Unified Component Tracking config

### Design

Replace the two separate toggle groups (PRODUCTION COMPONENTS + KITCHEN COMPONENTS)
in Manager Settings with a single "COMPONENT TRACKING" table. Each row has:
- Component name (grouped by Tier 1 / Leaf Components)
- Track? toggle (whether the component appears in End of Shift form)
- Unit selector (g / pcs button pair, manager decides)

### Schema change

Added `componentTracking: v.optional(v.array(v.object({ code, tracked, unit })))` to
`kitchenConfig` table. When present, this is authoritative. When absent (old config),
derive from legacy `enabledProductionComponents` + `enabledKitchenComponents` fields.
Legacy fields are still synced on save for backward compat.

### Changes

1. **convex/schema.ts** — added `componentTracking` field
2. **convex/kitchenConfig/mutations.ts** — accept + persist `componentTracking`
3. **convex/kitchenConfig/queries.ts** — return `componentTracking` (null when absent)
4. **ManagerTargetSettings.tsx** — replaced two toggle sections with unified table;
   `componentTracking` state replaces `enabledComponents` + `enabledKitchenComponents`;
   on save, derives legacy fields from componentTracking for backward compat
5. **useKitchenTargets.ts** — reads `componentTracking` from config, builds `unitByCode`
   map, exposes it to consumers
6. **KitchenViewV2.tsx** — `enabledComponents` now prefers componentTracking when present;
   `enabledKitchenComponentCodes` derived from componentTracking; passes `unitByCode` to
   EndOfShiftForm
7. **EndOfShiftForm.tsx** — accepts `unitByCode`, applies configured unit to
   `visibleKitchenComponents` so ComponentProductionSection/ShiftReviewModal/ShiftSuccessScreen
   display the manager-configured unit
8. **ComponentProductionSection.tsx** — waste unit label now uses component's unit
   (not hardcoded "g")

### Verification

- `npm run type-check` passes clean
- `npm run build` completes in 20.16s with zero errors
