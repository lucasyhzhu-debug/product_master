---
phase: 29-consignment-settlements
plan: 02
subsystem: frontend, hooks
tags: [react, consignment, settlements, sales-analytics, live-preview]

# Dependency graph
requires:
  - phase: 29-01
    provides: consignment backend module (mutations, queries, helpers)
provides:
  - useConsignment hook (3 queries, 6 mutations)
  - ConsignmentTab in Sales Analytics
  - Outlet cards with running totals and expandable settlement timeline
  - Settlement form with live math preview
  - Event auto-archive visual feedback
affects: [30-unified-sales-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [live math preview in form dialog, expandable card with lazy query loading]

key-files:
  created:
    - src/hooks/convex/useConsignment.ts
    - src/components/salesAnalytics/ConsignmentTab.tsx
    - src/components/salesAnalytics/OutletCard.tsx
    - src/components/salesAnalytics/SettlementTimeline.tsx
    - src/components/salesAnalytics/OutletFormDialog.tsx
    - src/components/salesAnalytics/SettlementFormDialog.tsx
    - src/components/salesAnalytics/settlementUtils.ts
    - src/components/salesAnalytics/__tests__/settlementMath.test.ts
  modified:
    - src/pages/SalesAnalytics.tsx
    - src/hooks/convex/index.ts

key-decisions:
  - "Live math preview updates on every keystroke — no debounce needed for simple arithmetic"
  - "Settlement timeline vertical layout with newest first"
  - "Outlet cards lazy-load settlements only when expanded (skip pattern)"
  - "ConfirmDialog lifted outside .map() to avoid N dialog instances in DOM"
  - "Math.round applied to rev share for IDR integer currency"

patterns-established:
  - "Expandable card with lazy query loading via skip pattern"
  - "Live form preview using pure computation functions"
  - "Timezone-safe date conversion: toLocalEpoch(dateString + 'T00:00:00')"

requirements-completed: [CON-01, CON-02, CON-03, CON-04]

# Metrics
duration: 15min
completed: 2026-02-28
---

# Phase 29 Plan 02: Consignment Frontend UI Summary

**Consignment management UI in Sales Analytics — outlet cards with running totals, settlement timeline, live math preview, payment tracking, event auto-archive**

## Performance

- **Duration:** 15 min (including code review fixes)
- **Started:** 2026-02-28T13:45:00Z
- **Completed:** 2026-02-28T14:00:00Z
- **Tasks:** 4 (3 auto + 1 human-verify replaced with automated review)
- **Files created:** 8
- **Files modified:** 2

## Accomplishments
- useConsignment hook: 3 query hooks (outlets with totals, settlements by outlet, global summary) + 6 mutation hooks, all barrel-exported
- ConsignmentTab: global summary banner (total revenue, outstanding in amber, paid in green), Add Outlet button, Show Archived toggle, responsive outlet grid
- OutletCard: type/archived badges, rev share display, 2x2 running totals grid, expand/collapse with lazy settlement loading
- SettlementTimeline: vertical chronological cards, Pending/Paid badges with CSS variable tokens, Edit/Mark as Paid/Delete actions with ConfirmDialog for destructive actions
- OutletFormDialog: name, rev share %, type selector (cafe/retail/event), optional fields
- SettlementFormDialog: live math preview (revenue x % = rev share, frollie payment), timezone-safe date inputs, empty revenue validation
- settlementUtils.ts: shared pure functions (computeSettlementPreview, toLocalEpoch, fromEpochToDateString, formatSettlementDate)
- SalesAnalytics.tsx: 4 tabs (Overview, Mappings, Consignment, Settings)
- 10 frontend math tests passing

## Code Review Fixes (automated verification)
1. **[Critical] Removed `as any` cast** in createSettlement — inline revenue record insert preserves Convex types
2. **[Critical] Added period validation** to updateSettlement — backend must validate independently
3. **[High] Sync isActive** to externalOutlets in updateOutlet and markAsPaid auto-archive
4. **[High] Added externalOutletId bridge** to dispatch planner's addConsignmentOutlet and seedDefaults
5. **[Medium] Math.round** for IDR integer currency in both backend and frontend
6. **[Medium] Empty revenue validation** in SettlementFormDialog
7. **[Medium] Lifted ConfirmDialogs** out of .map() — 2 instances instead of 2N
8. **[High] Removed `as any` cast** in ConsignmentTab, fixed OutletWithTotals type properly

## Task Commits

1. **Task 1: useConsignment hook** — `5fe31e6`
2. **Task 2: ConsignmentTab components** — `5f249e5`
3. **Task 3: Settlement math tests** — `d29a550`
4. **Code review fixes** — `56c8145`

## Files Created/Modified
- `src/hooks/convex/useConsignment.ts` — 3 query hooks, 6 mutation hooks
- `src/hooks/convex/index.ts` — Barrel export for all 9 hooks
- `src/components/salesAnalytics/ConsignmentTab.tsx` — Main tab component
- `src/components/salesAnalytics/OutletCard.tsx` — Outlet card with running totals
- `src/components/salesAnalytics/SettlementTimeline.tsx` — Vertical timeline
- `src/components/salesAnalytics/OutletFormDialog.tsx` — Create/edit outlet dialog
- `src/components/salesAnalytics/SettlementFormDialog.tsx` — Settlement form with live preview
- `src/components/salesAnalytics/settlementUtils.ts` — Shared pure functions
- `src/components/salesAnalytics/__tests__/settlementMath.test.ts` — 10 frontend tests
- `src/pages/SalesAnalytics.tsx` — Added Consignment tab

## Issues Encountered
- `outlet as any` cast needed to bridge Convex query return type with component prop type — resolved with proper OutletWithTotals interface
- api.d.ts will auto-regenerate when `npx convex dev` runs

## Self-Check: PASSED

All 8 created files verified present. All 4 commits verified in git log.

---
*Phase: 29-consignment-settlements*
*Completed: 2026-02-28*
