---
status: awaiting_human_verify
trigger: "phase-74-prod-build-ts-errors: Vercel build fails with 18 TS errors after Phase 74 merge"
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T00:40:00Z
---

## Current Focus

hypothesis: Confirmed. Three drift bugs: (1) duplicate `selectedChefId` from bad merge, (2) aggregation lift-and-shift dropped per-unit split fields, (3) ClockOutNudgeDialog onOpenChange vs onClose prop mismatch.
test: Apply three fixes, run npm run build.
expecting: Clean build with 0 TS errors.
next_action: Apply fixes to EndOfShiftForm.tsx, aggregation.ts, KitchenViewV2.tsx.

## Symptoms

expected: npm run build passes on Vercel for main (tsc + vite build succeeds).
actual: Vercel fails at tsc step with 18 TS errors across 4 files (EndOfShiftForm, staffPerformanceExport, KitchenViewV2, StaffPerformance).
errors: See prompt — TS2451 duplicate declarations, TS2339 totalComponentPieces / unit missing, TS2551 totalComponentWastePieces→Grams, TS2322 ClockOutNudgeDialog onClose prop missing.
reproduction: git switch main && git pull && npm ci && npm run build
started: Phase 74 merge commit 1381a817 (2026-04-17 04:41 UTC); follow-up 8b7a6231 shipped Convex but GH Action doesn't run Vite build; Vercel caught it first.

## Eliminated

## Evidence

- timestamp: 2026-04-17T00:01:00Z
  checked: npm run type-check on main vs npm run build on main
  found: type-check PASSES, build FAILS with all 18 errors
  implication: tsc -b (project references, stricter) catches these; tsc --noEmit does not. GH Action CI only runs convex deploy — that's how it escaped.

- timestamp: 2026-04-17T00:02:00Z
  checked: git blame src/components/kitchen/EndOfShiftForm.tsx lines 140-160
  found: Line 146 from e233729a/1a2ca52a (auto-assign chef for non-managers). Line 155 from 2031e615 "chore: merge origin/main into phase-74 branch" — merge reintroduced OLD declaration while keeping NEW. "Both sides" resolution.
  implication: Delete stale lines 154-155. Line 146 version is the correct one.

- timestamp: 2026-04-17T00:03:00Z
  checked: convex/staffAttendance/aggregation.ts lines 519-556 (return shape)
  found: Returns totalComponentGrams, componentBreakdown[{code,name,grams}], totalComponentWasteGrams, componentWasteBreakdown[{code,name,grams}]. NO totalComponentPieces, NO unit on componentBreakdown. But perDayBreakdown.componentTotals DOES include unit (line 503).
  implication: Frontend references to *Pieces and .unit on componentBreakdown are stale vs. the new aggregator.

- timestamp: 2026-04-17T00:04:00Z
  checked: git show 6c1ad3a9 -- convex/kitchenShiftRecords/queries.ts
  found: Commit 6c1ad3a9 (2026-04-16) added Pieces+unit to queries.ts in place. Phase 74 commit d7e5f3e6 created aggregation.ts with Grams-only shape. Commit 8b7a6231 (today) made queries.ts delegate to aggregation helper — silently dropping Pieces/unit. Intent from 6c1ad3a9 was explicit: "split component totals by unit (grams vs pieces) so pcs entries do not pollute gram totals".
  implication: Fix is to restore per-unit split INSIDE the aggregation helper, matching the frontend's existing expectation.

- timestamp: 2026-04-17T00:05:00Z
  checked: src/components/staffAttendance/ClockOutNudgeDialog.tsx line 15
  found: Props interface is `onOpenChange: (o: boolean) => void`. KitchenViewV2.tsx:451 passes `onClose={() => setNudgeOpen(false)}`.
  implication: Change caller to `onOpenChange={setNudgeOpen}` — setNudgeOpen accepts boolean directly.

- timestamp: 2026-04-17T00:06:00Z
  checked: TODO at aggregation.ts:490 "gate on (c as {unit?:string}).unit !== 'pcs' once componentProduced.unit lands from the kitchen-dedupe merge"
  found: The `unit` field on componentProduced already exists per kitchen-dedupe merge 2031e615. The TODO was never addressed after the merge completed.
  implication: Read `c.unit` in aggregation to route grams vs pcs. This also lets us close the TODO cleanly.

## Resolution

root_cause: |
  Three drift bugs from Phase 74's aggregation lift-and-shift + a botched merge:

  (1) EndOfShiftForm.tsx duplicate `selectedChefId` useState — merge commit 2031e615 kept BOTH the old (empty init at line 155) and new (auto-assign at line 146) versions. TS2451 x 4.

  (2) `aggregateStaffPerformance` was extracted from `convex/kitchenShiftRecords/queries.ts` into `convex/staffAttendance/aggregation.ts` during Phase 74 (commit d7e5f3e6), but silently dropped the per-unit split (`totalComponentPieces`, `totalComponentWastePieces`, `componentBreakdown[].unit`, `componentWasteBreakdown[].unit`) that commit 6c1ad3a9 had added to the pre-lift queries.ts. Commit 8b7a6231 "restore aggregateStaffPerformance delegation" then made queries.ts delegate to the new helper, finalising the data loss. Frontend still consumes those fields. TS2339 x 9, TS2551 x 2.

  (3) `ClockOutNudgeDialog` exposes `onOpenChange`, KitchenViewV2 passes stale `onClose`. TS2322 x 1.

fix: |
  (1) Delete duplicate `selectedChefId` block at EndOfShiftForm.tsx lines 154-155.

  (2) Restore per-unit split in aggregateStaffPerformance: add `totalComponentPieces` + `totalComponentWastePieces` to StaffBucket + return shape; read `c.unit` from record.componentProduced/componentWaste; route grams vs pcs into the correct total; tag componentBreakdown / componentWasteBreakdown entries with `unit`. Close the post-rebase TODO at line 490.

  (3) KitchenViewV2.tsx:451 — change `onClose={() => setNudgeOpen(false)}` to `onOpenChange={setNudgeOpen}`.

verification: |
  - `npm run build` → EXIT 0 (tsc -b + vite build both pass, 0 TS errors)
  - `npm run type-check` → pass (silent)
  - Vitest full suite: 113/113 files, 1563/1563 tests pass (includes kitchenShiftRecords/__tests__/summary.test.ts 10/10 for staff performance)
  - Lint on changed files: no new errors introduced (pre-existing E2E lint errors unrelated)
  - No `any`, `@ts-ignore`, `@ts-expect-error` introduced
  - Business behaviour preserved: StaffPerformance page will now correctly show grams and pcs on separate lines (as the frontend already expected); backend + frontend back in sync per commit 6c1ad3a9's original intent

files_changed:
  - src/components/kitchen/EndOfShiftForm.tsx (removed 3 duplicate lines)
  - convex/staffAttendance/aggregation.ts (+40/-8: restore per-unit split)
  - src/pages/KitchenViewV2.tsx (1 line: onClose → onOpenChange)
