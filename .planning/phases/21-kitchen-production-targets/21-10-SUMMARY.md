---
phase: 21-kitchen-production-targets
plan: "10"
subsystem: kitchen-ui
tags:
  - kitchen
  - per-component-toggles
  - eos-form
  - chef-selector
  - order-notes
  - bom
dependency_graph:
  requires:
    - 21-08 (enabledProductionComponents schema field)
    - 21-09 (unified manager settings, PackagingMixEditor)
  provides:
    - per-component-toggle-cascade (stat cards, badges, EoS rows)
    - eos-target-display
    - chef-selector-in-eos
    - chef-name-in-header
    - order-notes-on-cards
  affects:
    - src/components/kitchen/ProductionTargetsBar.tsx
    - src/components/kitchen/EndOfShiftForm.tsx
    - src/components/kitchen/KitchenOrderSummary.tsx
    - src/pages/KitchenViewV2.tsx
    - convex/menuProductComponents/queries.ts
tech_stack:
  added: []
  patterns:
    - enabledComponents-prop-cascade (ProductionTargetsBar + EndOfShiftForm receive enabledComponents + productBallTypes)
    - productBallTypes-map (menuProductComponents.listAll + componentTypes.list(production) built in KitchenViewV2 via useMemo)
    - bom-derived-visibility (filter packagingBreakdown and EoS rows from BOM codes, not hardcoded logic)
    - chef-selector-in-form (optional users prop; chefName/chefUserId passed to submitShiftRecord)
key_files:
  created: []
  modified:
    - src/components/kitchen/ProductionTargetsBar.tsx
    - src/components/kitchen/EndOfShiftForm.tsx
    - src/components/kitchen/KitchenOrderSummary.tsx
    - src/pages/KitchenViewV2.tsx
    - convex/menuProductComponents/queries.ts
    - docs/CHANGELOG.md
decisions:
  - "productBallTypes map built in KitchenViewV2 via listAll (unenriched) — avoids per-product subscriptions; single query for all products"
  - "enabledComponents defaults to ['BIG_BALL','MID_BALL'] when config is undefined (pre-load) or has null enabledProductionComponents — null-means-all pattern"
  - "Mixed-type products (need both balls) shown with amber flag in EoS but remain editable — users may still enter partial production"
  - "Products with no BOM data (ballTypes empty) are shown by default — prevents data loss if BOM not configured"
  - "latestChefName read from todayShiftRecords[0].chefName — no new query needed; most recent shift record is shown first by query ordering"
  - "Chef selector passes chefUserId as Id<users> cast — users._id from listUsers is already typed as Id<users> on backend"
metrics:
  duration_minutes: 8
  completed_date: "2026-02-23"
  tasks_completed: 2
  files_modified: 6
---

# Phase 21 Plan 10: Per-Component Toggle Cascade + EoS Polish Summary

One-liner: Per-component toggle cascade wired through stat cards, packaging badges, and End-of-Shift form rows; target display, chef selector, order notes, and chef header added.

## What Was Built

### Task 1 — ProductionTargetsBar + KitchenOrderSummary + listAll backend query

**convex/menuProductComponents/queries.ts:**
- Added `listAll` query (unenriched flat collection) — needed by KitchenViewV2 to build the productBallTypes map without per-product subscriptions

**ProductionTargetsBar.tsx (rewritten):**
- New props: `enabledComponents?: string[]` and `productBallTypes?: Record<string, string[]>`
- `showOriginal` / `showJumboResolved` derived from enabledComponents (falls back to legacy `showJumbo` if enabledComponents not provided)
- Dynamic `grid-cols-N` based on number of visible stat cards (0, 1, or 2)
- Packaging breakdown filtered: badges hidden if ALL ball types for that product are disabled
- Amber style for mixed-type products (some enabled, some not)
- Backward compat: `showJumbo` prop still accepted but is secondary to enabledComponents

**KitchenOrderSummary.tsx:**
- `OrderRow` interface extended with `notes?: string`
- Order card renders notes below items when present (Gap 11)

### Task 2 — EndOfShiftForm + KitchenViewV2 wiring

**EndOfShiftForm.tsx (updated):**
- New props: `enabledComponents?`, `productBallTypes?`, `users?`
- `visibleItems` filters `packagingBreakdown` — products with ALL ball types disabled are hidden from form
- `flaggedItemIds` identifies mixed-type products — shown with AlertTriangle amber warning
- Target quantity displayed inline below product name: `target: N`
- Chef selector at top of form using Select component from users prop
- `selectedChefId` state; on confirm resolves to `chefName` + `chefUserId` and passes to `submitShiftRecord`
- `handleDone` resets `selectedChefId`
- Validation uses `visibleItems` (not full packagingItems) for "at least one produced" check

**KitchenViewV2.tsx (updated):**
- `useQuery(api.menuProductComponents.queries.listAll)` — flat BOM components
- `useQuery(api.componentTypes.queries.list, {})` — all component types
- `productBallTypes` memo: filters to production category, builds `menuProductId -> code[]` map
- `enabledComponents` derived from `config?.enabledProductionComponents ?? ['BIG_BALL','MID_BALL']`
- `useQuery(api.auth.queries.listUsers)` — for chef selector; filtered to active users
- `latestChefName` from `todayShiftRecords[0].chefName` — typed via inline cast
- Page header: shows "Shift for: [Chef Name]" below date when chef assigned (Gap 8)
- ProductionTargetsBar now receives `enabledComponents` + `productBallTypes` (showJumbo removed)
- EndOfShiftForm now receives `enabledComponents` + `productBallTypes` + `users`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 38173bb | feat(21-10): per-component toggles in ProductionTargetsBar + order notes in KitchenOrderSummary |
| Task 2 | 25c21ec | feat(21-10): EoS form target display, filtered rows, chef selector; KitchenViewV2 BOM wiring + chef header |

## Verification Results

- `npm run type-check` — PASS (clean after each task)
- `npm run build` — PASS (8.39s, no errors, only pre-existing CSS warnings)

### Verification against success criteria:

- [x] `npm run type-check` passes
- [x] `npm run build` succeeds
- [x] Per-component toggle cascade works (stat cards, badges, EoS rows)
- [x] Target display next to each EoS input row
- [x] Chef selector functional (users from listUsers, filtered to isActive)
- [x] Order notes visible on order cards
- [x] Chef name in header (from most recent todayShiftRecord)

## Deviations from Plan

None — plan executed exactly as written.

The plan noted "check if `listAll` exists for menuProductComponents" — it did not, so a simple `listAll` query was added to `convex/menuProductComponents/queries.ts` (Rule 3: auto-fix blocking issue, needed to build productBallTypes map in KitchenViewV2).

## Self-Check: PASSED

Files exist:
- `src/components/kitchen/ProductionTargetsBar.tsx` — FOUND (enabledComponents, productBallTypes props)
- `src/components/kitchen/EndOfShiftForm.tsx` — FOUND (target display, filtered rows, chef selector)
- `src/components/kitchen/KitchenOrderSummary.tsx` — FOUND (notes field)
- `src/pages/KitchenViewV2.tsx` — FOUND (BOM wiring, chef header)
- `convex/menuProductComponents/queries.ts` — FOUND (listAll added)
- `docs/CHANGELOG.md` — FOUND (v1.3.4 entry)

Commits exist:
- 38173bb — FOUND (feat 21-10 ProductionTargetsBar + KitchenOrderSummary)
- 25c21ec — FOUND (feat 21-10 EndOfShiftForm + KitchenViewV2)
