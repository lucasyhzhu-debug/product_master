---
phase: quick-25
plan: 01
subsystem: kitchen
tags: [eos-form, waste-filter, inline-error, live-delta, frontend]
dependency_graph:
  requires: []
  provides: [EOS-WASTE-FILTER, EOS-INLINE-ERROR, EOS-LIVE-DELTA]
  affects: [EndOfShiftForm, ShiftReviewModal]
tech_stack:
  added: []
  patterns: [derived-filter-state, inline-error-state, live-delta-display]
key_files:
  created: []
  modified:
    - src/components/kitchen/EndOfShiftForm.tsx
    - src/components/kitchen/ShiftReviewModal.tsx
decisions:
  - "visibleWasteEntries derived from wasteEntries (not separate state) — same filter pattern as visibleItems; JSX still maps wasteEntries to preserve original indices for update/remove callbacks"
  - "confirmError state replaces toast.error for mutation failures; toast retained for input-step validation errors only"
  - "delta uses invisible (not hidden) when null to reserve column width and prevent layout shift when value is entered"
metrics:
  duration_seconds: 186
  completed_date: "2026-02-23T04:45:10Z"
  tasks_completed: 3
  files_modified: 2
---

# Quick Task 25: EoS Form Gap Closure — Waste Filter, Inline Error, Live Delta Summary

**One-liner:** Three EoS form gap fixes — waste entries filtered by enabledComponents, mutation errors shown as inline amber banner, and per-product live over/under delta next to the input field.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Filter waste entries by enabled components | cad0d56 | EndOfShiftForm.tsx |
| 2 | Inline error on review screen instead of toast | 22bf1df | EndOfShiftForm.tsx, ShiftReviewModal.tsx |
| 3 | Per-product live over/under delta on input step | 82481e2 | EndOfShiftForm.tsx |

## What Was Built

### Task 1: Waste filter by enabled components
- Added `visibleWasteEntries` derived value after `flaggedItemIds` block using the same filter pattern as `visibleItems`
- `buildWasteList()` now uses `visibleWasteEntries.filter(e => e.quantity > 0)` so disabled-component waste is excluded from submission
- JSX renders `wasteEntries.map` (not `visibleWasteEntries.map`) to preserve original array indices for `updateWasteEntry`/`removeWasteEntry` callbacks; `isDisabled` check returns null for skipped entries
- Empty state check updated to `visibleWasteEntries.length === 0`

### Task 2: Inline mutation error on review screen
- Added `const [confirmError, setConfirmError] = useState<string | null>(null)` to `EndOfShiftForm`
- `handleReview` calls `setConfirmError(null)` before `setStep("review")` to clear stale errors
- `handleConfirm` catch block calls `setConfirmError(msg)` instead of `toast.error(msg)`
- `error={confirmError}` prop passed to `ShiftReviewModal` in review render
- `ShiftReviewModal`: added `error?: string | null` to `ShiftReviewModalProps` interface and destructure
- Renders amber inline banner (`rounded-md border border-amber-300 bg-amber-50`) above action buttons when `error` is set

### Task 3: Live per-product delta
- Replaced old sub-line `target: X` span with inline layout: `[Product name — flex-1] target: X [input w-20] [delta w-20]`
- Per item: `const delta = qty > 0 ? qty - item.quantity : null`
- Delta span uses `invisible` class when `delta === null` (reserves 80px column, no layout shift)
- Amber color (`text-amber-600 dark:text-amber-400`) when under target
- Emerald color (`text-emerald-600 dark:text-emerald-400`) when on target or over
- Text: `✓ on target` / `+N over` / `N under`

## Decisions Made

1. **visibleWasteEntries as derived filter (not state):** Derived from `wasteEntries` each render using same filter logic as `visibleItems`. JSX still iterates `wasteEntries` (not `visibleWasteEntries`) to preserve original indices for `updateWasteEntry(index, ...)` and `removeWasteEntry(index)` callbacks. Inline `isDisabled` check returns `null` to skip disabled rows.

2. **confirmError state over toast:** `toast.error` retained for input-step validation (validate() errors). Mutation errors in `handleConfirm` catch use `setConfirmError` — displayed inline in ShiftReviewModal above Back/Confirm buttons. User stays on review screen with visible error context.

3. **invisible over hidden for delta:** `invisible` Tailwind class hides the delta visually but preserves its 80px width in the flex layout. This prevents the input field from shifting left/right when a value is entered or cleared.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```
npm run type-check  -- PASSED (all 3 tasks)
npm run build       -- PASSED (Tasks 2 and 3; pre-existing CSS warnings only)
```

## Self-Check: PASSED

Files exist:
- src/components/kitchen/EndOfShiftForm.tsx — FOUND
- src/components/kitchen/ShiftReviewModal.tsx — FOUND

Commits exist:
- cad0d56 — FOUND (Task 1)
- 22bf1df — FOUND (Task 2)
- 82481e2 — FOUND (Task 3)
