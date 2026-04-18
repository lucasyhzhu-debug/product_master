# Phase 80.2 — Deferred Items

Out-of-scope issues discovered during execution. Not fixed per executor scope boundary.

## Pre-existing test failures (unrelated to 80.2)

**Detected in:** Plan 02 execution (Wave 2 full test-suite run)
**Status:** Pre-existing on the clean branch state before Phase 80.2 changes.

- `convex/staffAttendance/__tests__/correctAttendance.test.ts` — 2/11 tests failing (lines ~349). Phase 74 Staff Attendance scope — not touched by Phase 80.2.

**Action:** Leave for the Phase 74 owner / a dedicated fix. Phase 80.2 tests (externalData + integrations) all pass.

## Pre-existing lint errors in externalData/mutations.ts

**Detected in:** Plan 02 Task 2.2 (lint run)
**Status:** Pre-existing — verified against `git stash`.

- Line 370: `@typescript-eslint/no-explicit-any` inside `applyRetroactiveProductMappingImpl` (not touched by Plan 02)
- Line 708: `prefer-const` in `setMenuProductForSku` (not touched by Plan 02)
- Line 869: `@typescript-eslint/no-explicit-any` in `autoMatchMenuProduct` (not touched by Plan 02)

Baseline had these at lines 369/707/820 — my insertions above them shifted them to 370/708/869. No new lint errors introduced by Plan 02.

**Action:** Cleanup candidate for a future tech-debt pass. Not in scope for Phase 80.2.

## Project-wide pre-existing lint errors (505 total)

**Detected in:** Plan 04 Task 4.1 (full `npm run lint` run)
**Status:** Pre-existing across the entire codebase — 505 errors in files unrelated to Phase 80.2.

Phase 80.2's touched files (all 12 — k3mart helpers/queries/adapter, externalData mutations/queries, internal adapter, revenueItemsHelpers, and the 5 new test files) introduced ZERO new lint errors. Verified via before/after `git checkout main -- <file>` comparisons:

- `convex/integrations/k3mart/adapter.ts`: 22 errors on both main and branch (lines shifted by my insertions, count unchanged)
- `convex/externalData/mutations.ts` + `queries.ts`: 4 errors total on both sides
- All other touched files: 0 errors on both sides

**Action:** Not in scope for Phase 80.2. Project-wide lint cleanup is a separate tech-debt initiative.

## Pre-existing build failure in WeekdayDualAxisChart.tsx

**Detected in:** Plan 04 Task 4.1 (`npm run build`)
**Status:** Pre-existing on `main` (Phase 80.1 artifact, unrelated to 80.2). Verified by switching to `main` and running `npm run build` — same error appears.

- `src/components/analytics/WeekdayDualAxisChart.tsx(34,3): error TS6133: 'mode' is declared but its value is never read.`

The `mode` prop is destructured in `WeekdayTooltip` but the tooltip body never references it. Fix is trivial (rename to `_mode` or consume the prop).

**Action:** Not in scope for Phase 80.2 (introduced by Phase 80.1 merge). Should be cleaned up on `main` directly or in a follow-up; blocks `npm run build` gate but does not block merge of 80.2 as the issue pre-exists on the target branch. Phase 80.2's own code compiles cleanly via `npm run type-check`.

## Pre-existing test failures (unrelated to 80.2) — re-confirmed in Plan 04

**Detected in:** Plan 04 Task 4.1 (full `npm run test` run)
**Status:** Same 2 Phase 74 staffAttendance failures previously documented, unchanged. Test totals: 1618/1620 passing. Phase 80.2's own 19 new tests all pass.
