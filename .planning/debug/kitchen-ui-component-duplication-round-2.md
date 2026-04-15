---
status: awaiting_human_verify
trigger: "Kitchen view still shows duplicated components, toggles tied together, grammage recorded twice, Nutella-Regular missing from BALLS PRODUCED."
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:30:00Z
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
  - `npm run type-check` passes (no errors)
  - `npm run build` passes (built in 20.00s)
  - Manual browser verification pending user
files_changed:
  - src/hooks/convex/useKitchenTargets.ts
  - src/components/kitchen/ManagerTargetSettings.tsx
  - src/pages/KitchenViewV2.tsx
