---
phase: 19-gofood-depot-kitchen-targets
verified: 2026-02-22T12:00:00Z
status: passed
score: 30/30 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 22/22
  context: >
    Previous VERIFICATION.md was produced before the UAT and before gap-closure plans
    19-06 through 19-09 were executed. This re-verification covers the full post-UAT
    state including all four gap-closure plans.
  gaps_closed:
    - "Build type mismatch (Id union) in GoFoodDepotManager.tsx — resolved in 19-06"
    - "destinationLocationId not threaded to transfer dialog — resolved in 19-06"
    - "By Platform grouping mode missing from Finished Goods tab — resolved in 19-07"
    - "Location type labels read Internal/Depot/Venue instead of Internal Inventory/GoFood/K3Mart — resolved in 19-07"
    - "Alerts stat card unreadable in dark mode — resolved in 19-07"
    - "Location platform tagging inaccessible from Inventory page — resolved in 19-07"
    - "Route /dispatch-planner instead of /restock-planner — confirmed already /restock-planner"
    - "Simulate Inventory button present on planner page — confirmed already removed"
    - "GoFood restock section lacked usage guidance — resolved in 19-08"
    - "Restock tooltip text low-contrast (text-muted-foreground in TooltipContent) — resolved in 19-09"
    - "Inline stock edit in depot cockpit had no visual affordance — resolved in 19-09"
    - "Move/Receive buttons had no color differentiation — resolved in 19-09"
    - "No sync prerequisite note on GoFood Depot page — resolved in 19-09"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Navigate to /gofood-depot with seed not run"
    expected: "Full-page SeedWarningBlocker renders with unlinked outlet names and no dismiss button"
    why_human: "Requires live Convex backend with unlinked GoBiz outlet data"
  - test: "Navigate to /gofood-depot, select outlet, observe low-stock alert banner"
    expected: "Alert banner appears at top listing products below 5 units when stock is low; affected rows highlighted red in cockpit table"
    why_human: "Requires live stock data to trigger threshold"
  - test: "Click restock column cell in cockpit table"
    expected: "Tooltip appears with readable breakdown text (e.g. '3-day avg: 7.3 +1 (weekday) = 9') — no text-muted-foreground class, inherits tooltip component color"
    why_human: "Tooltip interaction and contrast cannot be verified programmatically"
  - test: "Hover stock number in depot cockpit Remaining column"
    expected: "Number turns blue and pencil icon fades in; clicking opens inline edit with autoFocus"
    why_human: "Hover interaction and visual affordance require browser rendering"
  - test: "Navigate to /inventory Finished Goods tab, click By Platform"
    expected: "Three sections appear: Internal Inventory, GoFood, K3Mart with flat product rows; no per-location sub-grouping"
    why_human: "Requires live productInventory data with multiple location types"
  - test: "Navigate to /restock-planner GoFood Depot Restock section"
    expected: "Usage guidance 'How to use' text visible above outlet tables even when collapsed; Transfer links per row navigate to /inventory"
    why_human: "Requires live GoBiz outlet and externalRevenue data"
  - test: "GoFood sales sync deducts depot stock automatically"
    expected: "After GoBiz sync runs, product stock at linked outlet decreases by sold quantity"
    why_human: "Requires real GoBiz sync trigger plus confirmed product mappings and linked storage locations"
---

# Phase 19: GoFood Depot Management Verification Report (Re-verification)

**Phase Goal:** Admin can configure per-outlet product mappings for each GoFood depot, track per-depot stock levels with low-stock alerts, receive daily restock suggestions, and see an explicit warning when the finished goods seed has not been run.

**Verified:** 2026-02-22
**Status:** PASSED
**Re-verification:** Yes — covers post-UAT gap-closure state (plans 19-06 through 19-09 included)

---

## Scope Clarification: Requirement IDs

The prompt referenced requirement IDs GF-01, GF-02, GF-03, GF-04, GF-05, KP-01, KP-02, KP-03.

**Actual Phase 19 requirements per ROADMAP.md and REQUIREMENTS.md: GF-02, GF-03, GF-04, GF-05 only.**

- **GF-01** does not exist in REQUIREMENTS.md. Not applicable.
- **KP-01, KP-02, KP-03** do not exist in REQUIREMENTS.md. Kitchen production targets use the KIT-xx naming scheme (KIT-09, KIT-12 through KIT-18) and are assigned to **Phase 20**, not Phase 19. The phase title references "kitchen production targets" but that scope was deferred; Phase 19 delivered GoFood depot management only.

All four applicable requirements (GF-02, GF-03, GF-04, GF-05) are verified below.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `productInventoryTransactions` schema supports `transfer` type with `transferPairLocationId` | VERIFIED | `convex/schema.ts`: `transferPairLocationId: v.optional(v.id("storageLocations"))` at line 1097; `v.literal("transfer")` in union |
| 2 | `gofoodDepotStock` schema has `outletId` field with composite index `by_outlet_product` | VERIFIED | `convex/schema.ts` lines confirming field + index present |
| 3 | `gofoodOutletProductMappings` table exists in schema | VERIFIED | `convex/schema.ts` line 1329: full table definition with both indexes |
| 4 | `transferStock` mutation atomically debits source, credits destination, logs two transactions | VERIFIED | `convex/productInventory/mutations.ts` line 421: full implementation exported |
| 5 | `isSeedRequired` query returns `seedRequired=true` when any GoBiz outlet lacks `linkedStorageLocationId` | VERIFIED | `convex/gofoodDepot/queries.ts` line 416: exported query |
| 6 | `getRestockSuggestions` query returns per-product restock amounts with breakdown | VERIFIED | `convex/gofoodDepot/queries.ts` line 444: exported |
| 7 | `getOutletProductMappings` query returns mappings per outlet with unmapped products | VERIFIED | `convex/gofoodDepot/queries.ts` line 587: exported |
| 8 | `computeRestockSuggestion` pure function handles Mon/Fri/Sat/weekday rules correctly | VERIFIED | `convex/gofoodDepot/helpers.ts` line 19: exported; business logic verified in previous verification |
| 9 | `saveOutletProductMappings` and `initOutletMappingsFromPrevious` mutations exist | VERIFIED | `convex/gofoodDepot/mutations.ts` lines 600, 664: both exported |
| 10 | GoFood Depot page renders with outlet selector, seed warning, cockpit table, mapping section | VERIFIED | `src/pages/GoFoodDepotManager.tsx`: 236 lines; all sections present; all hooks before conditional returns |
| 11 | Seed warning is a full-page blocker with no dismiss button | VERIFIED | `src/components/gofoodDepot/SeedWarningBlocker.tsx`: renders when `seedData?.seedRequired`; no close control |
| 12 | Low-stock alert banner appears when any product drops below 5 remaining | VERIFIED | `GoFoodDepotManager.tsx` lines 93-98: `depotStock.filter(row => (row.quantity ?? 0) < 5)`; banner at lines 182-194 |
| 13 | Mapping section has explicit Save button; unmapped products flagged | VERIFIED | `src/components/gofoodDepot/DepotMappingSection.tsx`: Save button confirmed in prior verification (273 lines) |
| 14 | `destinationLocationId` flows from `selectedOutlet.linkedStorageLocationId` to transfer dialog | VERIFIED | `GoFoodDepotManager.tsx` line 213: `destinationLocationId={selectedOutlet?.linkedStorageLocationId}`; `DepotCockpitTable.tsx`: prop accepted at line 77, destructured at line 181, included in `setTransferDialogProduct` at line 318, passed to dialog at line 341 |
| 15 | Build passes with no TypeScript errors | VERIFIED | `npm run build` exit 0; `npm run type-check` exit 0 |
| 16 | Route `/gofood-depot` exists with ProtectedRoute in App.tsx | VERIFIED | `src/App.tsx` line 280: `path="gofood-depot"` with GoFoodDepotManager |
| 17 | Route `/restock-planner` exists (not `/dispatch-planner`) | VERIFIED | `src/App.tsx` line 270: `path="restock-planner"` |
| 18 | Nav link reads "Restock" pointing to `/restock-planner` | VERIFIED | `src/components/layout/Header.tsx` line 75: `{ path: '/restock-planner', label: 'Restock', ... }` |
| 19 | ChannelSettingsDialog title reads "Restock Planner Settings" | VERIFIED | `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` line 120: "Restock Planner Settings" |
| 20 | No "Simulate Inventory" button on Restock Planner page | VERIFIED | Grep for `Simulate Inventory` in `RestockPlanner.tsx` returns no matches |
| 21 | GoFood Restock section has always-visible usage guidance text | VERIFIED | `src/components/restockPlanner/GoFoodRestockSection.tsx` line 154: "How to use:" guidance present; line 102: "Transfer ->" link per row |
| 22 | Finished Goods tab has three grouping modes: By Product / By Location / By Platform | VERIFIED | `FinishedGoodsTab.tsx` line 73: `type GroupingMode = "product" | "location" | "platform"`; toggle buttons at lines 1109, 1122, 1135 |
| 23 | By Platform view shows Internal Inventory / GoFood / K3Mart sections flat | VERIFIED | `FinishedGoodsTab.tsx` line 1144: "By Platform" button renders `PlatformGroupedView`; `bucketLocationType` and `locationTypeLabel` helpers confirmed in file |
| 24 | Location type labels read "Internal Inventory", "GoFood", "K3Mart" (not "Internal/Depot/Venue") | VERIFIED | `FinishedGoodsHero.tsx` line 202: `label="Internal Inventory"`; grep confirms "Internal Inventory" and "GoFood" labels |
| 25 | Alerts stat card uses dark-mode-safe colors | VERIFIED | `FinishedGoodsHero.tsx` line 78: `dark:border-orange-500/30 dark:bg-orange-500/10` present |
| 26 | Location platform tagging accessible via Settings panel on Inventory page | VERIFIED | `FinishedGoodsTab.tsx` line 1266: Settings panel has location type dropdowns with description "Controls the 'By Platform' grouping and hero stat cards" |
| 27 | Restock tooltip does not use `text-muted-foreground` (contrast fix) | VERIFIED | `DepotCockpitTable.tsx` line 292: `<p className="font-medium mb-1">Restock Calculation</p>` — no muted class on breakdown paragraph |
| 28 | Inline stock edit shows pencil icon on hover | VERIFIED | `DepotCockpitTable.tsx` line 166: `<Pencil ... opacity-0 group-hover:opacity-100 transition-opacity />` |
| 29 | Move/Receive buttons have color-coded styling (blue/green) | VERIFIED | `FinishedGoodsTab.tsx` lines 415, 441, 662, 688: `border-primary/40 text-primary` (blue) and `border-green-500/40 text-green-700 dark:text-green-400` (green) |
| 30 | GoFood Depot page shows GoBiz sync prerequisite info note | VERIFIED | `GoFoodDepotManager.tsx` lines 170-179: info note about sync prerequisites always visible |

**Score:** 30/30 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/schema.ts` | Extended schema: transfer type, outletId on gofoodDepotStock, gofoodOutletProductMappings table | VERIFIED | All three schema additions confirmed |
| `convex/productInventory/mutations.ts` | `transferStock` mutation | VERIFIED | Exported at line 421 |
| `convex/productInventory/queries.ts` | `getStockOverviewGrouped` query | VERIFIED | Exported at line 235 |
| `convex/gofoodDepot/helpers.ts` | `computeRestockSuggestion` pure function | VERIFIED | Exported at line 19 |
| `convex/gofoodDepot/queries.ts` | `isSeedRequired`, `getRestockSuggestions`, `getOutletProductMappings` | VERIFIED | Lines 416, 444, 587 |
| `convex/gofoodDepot/mutations.ts` | `saveOutletProductMappings`, `initOutletMappingsFromPrevious` | VERIFIED | Lines 600, 664 |
| `src/pages/GoFoodDepotManager.tsx` | GoFood depot page with outlet selector, sync note, seed warning, cockpit table, mapping section | VERIFIED | 236 lines; destinationLocationId wired from selectedOutlet; sync info note at lines 170-179 |
| `src/components/gofoodDepot/DepotCockpitTable.tsx` | Cockpit table with destinationLocationId prop chain, pencil edit affordance, readable tooltip | VERIFIED | destinationLocationId in Props interface, state, and dialog pass-through; pencil icon with group-hover |
| `src/components/gofoodDepot/DepotMappingSection.tsx` | Mapping editor with explicit Save, unmapped flagging | VERIFIED | 273 lines |
| `src/components/gofoodDepot/DepotStockTransferDialog.tsx` | Stock transfer dialog, no amber warning when outlet is linked | VERIFIED | Already accepted destinationLocationId; amber warning only fires when prop is undefined |
| `src/components/gofoodDepot/SeedWarningBlocker.tsx` | Full-page blocker | VERIFIED | 75 lines; no dismiss button |
| `src/hooks/convex/useGoFoodDepot.ts` | Convex hooks for depot data | VERIFIED | All hooks exported |
| `src/components/inventory/FinishedGoodsTab.tsx` | Three grouping modes, location type editor in Settings, color-coded Move/Receive buttons | VERIFIED | GroupingMode = "product" \| "location" \| "platform"; Settings panel at line 1266; button colors at lines 415/441/662/688 |
| `src/components/inventory/FinishedGoodsHero.tsx` | Dark-mode Alerts card, "Internal Inventory" label | VERIFIED | `dark:border-orange-500/30` at line 78; "Internal Inventory" label at line 202 |
| `src/components/restockPlanner/GoFoodRestockSection.tsx` | Usage guidance + Transfer links | VERIFIED | "How to use" at line 154; "Transfer ->" at line 102 |
| `src/App.tsx` | `/restock-planner` and `/gofood-depot` routes | VERIFIED | Lines 270, 280 |
| `src/components/layout/Header.tsx` | Nav link to `/restock-planner` labeled "Restock" | VERIFIED | Line 75 |
| `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` | Title "Restock Planner Settings" | VERIFIED | Line 120 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/productInventory/mutations.ts` | `convex/schema.ts` | `transfer` transaction type + `transferPairLocationId` | VERIFIED | Both present in schema and used in mutation |
| `convex/gofoodDepot/queries.ts` | `convex/gofoodDepot/helpers.ts` | `import computeRestockSuggestion` | VERIFIED | Confirmed in prior verification; pattern present |
| `convex/gofoodDepot/mutations.ts` | `convex/schema.ts` | `gofoodOutletProductMappings` insert/patch | VERIFIED | Table at schema line 1329; mutations at lines 600, 664 |
| `src/pages/GoFoodDepotManager.tsx` | `src/components/gofoodDepot/DepotCockpitTable.tsx` | `destinationLocationId={selectedOutlet?.linkedStorageLocationId}` | VERIFIED | GoFoodDepotManager.tsx line 213 |
| `src/components/gofoodDepot/DepotCockpitTable.tsx` | `src/components/gofoodDepot/DepotStockTransferDialog.tsx` | `destinationLocationId` in Props, state, and dialog pass | VERIFIED | Props line 77; state line 188; setTransferDialogProduct line 318; dialog prop line 341 |
| `src/App.tsx` | `src/pages/GoFoodDepotManager.tsx` | React Router `/gofood-depot` | VERIFIED | App.tsx line 280 |
| `src/App.tsx` | `src/pages/RestockPlanner.tsx` | React Router `/restock-planner` | VERIFIED | App.tsx line 270 |
| `src/components/layout/Header.tsx` | `/restock-planner` | nav path attribute | VERIFIED | Header.tsx line 75 |
| `src/components/restockPlanner/GoFoodRestockSection.tsx` | `convex/gofoodDepot/queries.ts` | `useQuery(api.gofoodDepot.queries.getRestockSuggestions, { outletId })` | VERIFIED | GoFoodRestockSection.tsx line 30 |
| `src/components/inventory/FinishedGoodsTab.tsx` | `GroupingMode type` | `platform` option in union | VERIFIED | Line 73: `type GroupingMode = "product" | "location" | "platform"` |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| GF-02 | 19-02, 19-03, 19-06 | Admin can configure per-outlet product mappings; new outlets default to previous depot's mapping | SATISFIED | `saveOutletProductMappings` + `initOutletMappingsFromPrevious` mutations; `DepotMappingSection` with explicit Save; `destinationLocationId` wire gap fixed in 19-06 enabling functional transfers |
| GF-03 | 19-01, 19-03, 19-04, 19-06, 19-07, 19-09 | Per-depot stock tracking with alert when any depot drops below 5 remaining | SATISFIED | `outletId` on `gofoodDepotStock`; low-stock filter + banner; `FinishedGoodsTab` By Platform grouping; label fixes; Move/Receive color coding; sync info note |
| GF-04 | 19-02, 19-03, 19-05, 19-07, 19-08, 19-09 | Restock suggestion: n+1 avg last 3 days, n+2 Fri/Sat, Monday reset to Thursday total | SATISFIED | `computeRestockSuggestion` with exact day-of-week logic; `getRestockSuggestions` query; tooltip contrast fixed; `GoFoodRestockSection` usage guidance added |
| GF-05 | 19-01, 19-03, 19-08 | Admin-visible warning when `seedFinishedGoodsLocations` not run | SATISFIED | `isSeedRequired` query; `SeedWarningBlocker` full-page hard blocker; "Restock Planner" rename (19-08) |

**Note on IDs in prompt:** GF-01 does not exist in REQUIREMENTS.md. KP-01, KP-02, KP-03 do not exist — kitchen production requirements use KIT-xx naming and are assigned to Phase 20, not Phase 19. Phase 19 scope is GoFood depot management only per ROADMAP.md line 74: "Requirements: GF-02, GF-03, GF-04, GF-05".

No orphaned requirements found. All four GF requirements claimed by plans and fully implemented including gap closures.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `GoFoodDepotManager.tsx` lines 209-212 | `as any[]` casts on `depotStock`, `stockGrouped`, `storageLocations` | Info | Documented intentional workaround for Convex union Id type incompatibility — not a stub, build passes |
| `convex/gofoodDepot/queries.ts` | `return null` early returns | Info | Legitimate defensive guards (no GoFood targets today, Goldfinch location not found) — not stubs |
| `src/components/restockPlanner/GoFoodRestockSection.tsx` | `return null` when no GoBiz outlets | Info | Legitimate conditional render — not a stub |

No blocker or warning anti-patterns found. All three items are documented defensive patterns, not placeholder implementations.

---

## Human Verification Required

### 1. Seed Warning Blocker

**Test:** Navigate to `/gofood-depot` using a Manager or Admin account when at least one GoBiz outlet lacks a `linkedStorageLocationId`.
**Expected:** Full-page amber warning card appears listing unlinked outlets. No close or dismiss button. Page content (outlet selector, cockpit table) is completely hidden.
**Why human:** Requires live Convex backend with specific database state.

### 2. Low-Stock Alert Banner

**Test:** Ensure a GoFood depot has at least one product with `productInventory.quantity < 5`, then navigate to `/gofood-depot` and select that outlet.
**Expected:** Amber/red alert banner appears at top listing affected product names. Corresponding cockpit rows are highlighted.
**Why human:** Requires live stock data below the threshold.

### 3. Restock Tooltip Contrast

**Test:** Hover over a "Restock Tomorrow" value in the depot cockpit table.
**Expected:** Tooltip appears with readable breakdown text — both in light mode and dark mode (toggle to verify). Text must not be washed out.
**Why human:** Contrast verification requires browser rendering; the `text-muted-foreground` removal was confirmed in code but visual result needs confirmation.

### 4. Inline Stock Edit Affordance

**Test:** Hover over a stock number in the "Stock at depot" column of the cockpit table.
**Expected:** Number turns blue and a pencil icon fades in. Clicking opens an inline input with autoFocus.
**Why human:** Hover and focus behavior requires browser interaction.

### 5. By Platform Grouping

**Test:** Navigate to `/inventory`, Finished Goods tab, click "By Platform".
**Expected:** Three sections appear — Internal Inventory, GoFood, K3Mart — each listing products with total stock flat (no per-location sub-rows).
**Why human:** Requires live productInventory data with locations of different types.

### 6. Restock Section Usage Guidance

**Test:** Navigate to `/restock-planner`, expand GoFood Depot Restock section.
**Expected:** "How to use" guidance text visible above outlet tables even when section is collapsed. Each product row has a "Transfer ->" link that navigates to `/inventory`.
**Why human:** Requires live GoBiz outlet + externalRevenue data to populate outlet tables.

### 7. GoBiz Sales Sync Inventory Deduction

**Test:** Trigger a GoBiz sync and verify that sold quantities reduce the depot's `productInventory` stock at the outlet's linked storage location.
**Expected:** Stock decreases by the quantity shown in the sync result. If prerequisites (linked location, product mapping) are unmet, the depot page's info note should explain why stock is not decreasing.
**Why human:** Requires real GoBiz sync API call plus confirmed product mappings and linked storage locations in production.

---

## Re-verification Summary

The previous VERIFICATION.md (22/22, passed) was generated before the UAT which uncovered 14 issues across 4 gap-closure plans (19-06 through 19-09). This re-verification confirms all gap-closure work was successfully implemented.

**Gap-Closure Verification:**
- **19-06 (Build fix + destinationLocationId wire):** Build passes; `destinationLocationId` threaded from `selectedOutlet?.linkedStorageLocationId` through `DepotCockpitTable` props, state, and into `DepotStockTransferDialog`.
- **19-07 (By Platform + dark mode + label fixes):** Three-mode grouping toggle confirmed in code (`GroupingMode = "product" | "location" | "platform"`); "Internal Inventory" label confirmed in hero; dark-mode-safe colors on Alerts card; location type editor in Settings panel.
- **19-08 (Rename + usage guidance):** Route `/restock-planner` confirmed in App.tsx; nav "Restock" in Header; "Restock Planner Settings" dialog title confirmed; no Simulate Inventory button found; usage guidance "How to use" and "Transfer ->" links confirmed in GoFoodRestockSection.
- **19-09 (Polish):** No `text-muted-foreground` in TooltipContent; pencil icon with `group-hover:opacity-100`; blue/green color coding on Move/Receive buttons; GoBiz sync prerequisite info note in GoFoodDepotManager.

**Phase 19 goal is fully achieved.** All four GF requirements (GF-02, GF-03, GF-04, GF-05) are satisfied. Build passes. The "kitchen production targets" component of the phase title was scoped out during planning — those requirements (KIT-09, KIT-12–18) are Phase 20's responsibility.

---

_Verified: 2026-02-22_
_Verifier: Claude (gsd-verifier) — Re-verification after UAT gap closure_
