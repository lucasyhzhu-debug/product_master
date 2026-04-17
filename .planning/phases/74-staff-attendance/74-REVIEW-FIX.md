---
phase: 74-staff-attendance
fixed_at: 2026-04-17T00:00:00Z
review_path: .planning/phases/74-staff-attendance/74-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 74: Code Review Fix Report

**Fixed at:** 2026-04-17
**Source review:** `.planning/phases/74-staff-attendance/74-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 4
- Fixed: 4
- Skipped: 0
- Info findings (IN-01 through IN-05): deferred — out of scope for this pass

## Fixed Issues

### WR-01: `detectOverlaps` misses transitive overlaps across 3+ sessions

**Files modified:** `convex/staffAttendance/flagEngine.ts`, `convex/staffAttendance/__tests__/flagEngine.test.ts`
**Commit:** `ed7e0576`
**Applied fix:** Replaced the pairwise `(prev, cur)` scan with a running
`maxEnd` / `maxEndId` tracker so a long earlier session still flags later
shorter sessions it envelops. Added two regression tests covering the
closed-outer (A 08:00–18:00, B 09:00–10:00, C 11:00–12:00) and open-outer
(A open, B, C inside) fixtures from the review. All 20 flagEngine tests pass
(18 original + 2 new).

### WR-02: `toWibDateString` silently produces wrong date for non-finite inputs

**Files modified:** `convex/staffAttendance/flagEngine.ts`
**Commit:** `4ad879e4`
**Applied fix:** Guard added at function top — `if (!Number.isFinite(utcMs))
throw new Error(\`toWibDateString: non-finite input ${utcMs}\`)`. Converts a
cryptic downstream `RangeError: Invalid time value` into a named, self-locating
failure. No runtime behavior change for existing finite callers.

### WR-03: Client-computed `date` can drift from WIB when crossing UTC midnight

**Files modified:** `convex/staffAttendance/mutations.ts`
**Commit:** `fde99df0`
**Applied fix:** In `correctAttendance`:
- `add_missed` branch: derive WIB date from `args.clockIn` and throw
  `ConvexError` if it disagrees with `args.date`.
- `edit_timestamps` branch: when `args.clockIn` is provided, verify the
  existing row's `date` still matches the new clockIn's WIB date. Rejects
  timestamp edits that would cross a WIB-date boundary (error message
  instructs the manager to use add_missed + delete for cross-date moves).

Both guards use the existing `toWibDateString` helper so the behavior is
consistent with the clock-in flow. Deviation note: the review only explicitly
required the add_missed guard; the edit_timestamps guard was also added per
the review's own suggestion ("Also consider the same guard in edit_timestamps
when `clockIn` changes across a WIB-date boundary…").

### WR-04: `getMyLastShiftSummary` N+1 risk on full-table BOM fetch

**Files modified:** `convex/staffAttendance/queries.ts`
**Commit:** `f4a47aca`
**Applied fix:** Replaced unconditional `ctx.db.query("menuProductComponents")
.collect()` with a scoped per-product lookup via the `by_menu_product` index,
keyed off the `menuProductId` values actually present in the user's same-day
`kitchenShiftRecords.produced[]`. Per-product collects run in parallel via
`Promise.all`. Bucket construction (`bomByProduct` Map) preserves the existing
downstream iteration shape so the ball-counting loop is unchanged.

## Skipped Issues

_None — all 4 in-scope findings were applied cleanly._

## Verification

- `npm run type-check` — passed (clean exit, no errors)
- `npx vitest run convex/staffAttendance/__tests__/flagEngine.test.ts` — 20/20 passed (18 original + 2 WR-01 regression tests)

---

_Fixed: 2026-04-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
