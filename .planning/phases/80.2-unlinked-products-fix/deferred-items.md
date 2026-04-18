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
