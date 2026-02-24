---
phase: 21-kitchen-production-targets
plan: "11"
subsystem: kitchen-ui
tags:
  - kitchen
  - shift-review
  - target-deltas
  - success-screen
  - framer-motion
  - chef-history
  - eos-polish
dependency_graph:
  requires:
    - 21-10 (targets prop, EndOfShiftForm packagingItems, chef fields in mutations)
  provides:
    - shift-review-target-deltas (produced vs target +/- variance per product)
    - waste-toward-target-total (produced + waste = total made in review)
    - success-screen-card-layout (Framer Motion stagger animation per row)
    - chef-in-shift-history (chefName shown on history cards)
    - chef-edit-in-dialog (manager can update chef on past records)
  affects:
    - src/components/kitchen/ShiftReviewModal.tsx
    - src/components/kitchen/ShiftSuccessScreen.tsx
    - src/components/kitchen/ShiftHistoryList.tsx
    - src/components/kitchen/ShiftEditDialog.tsx
    - src/components/kitchen/EndOfShiftForm.tsx
tech_stack:
  added: []
  patterns:
    - targets-prop-threading (packagingItems passed from EndOfShiftForm to both ShiftReviewModal and ShiftSuccessScreen)
    - waste-toward-target (totalMade = produced + waste for delta calculation only; waste still stored separately)
    - framer-motion-stagger (container + itemVariant variants with staggerChildren: 0.12, delayChildren: 0.2)
    - chef-name-on-record (chefName field on ShiftRecord interface; shown in history card when different from submitter)
key_files:
  created: []
  modified:
    - src/components/kitchen/ShiftReviewModal.tsx
    - src/components/kitchen/ShiftSuccessScreen.tsx
    - src/components/kitchen/ShiftHistoryList.tsx
    - src/components/kitchen/ShiftEditDialog.tsx
    - src/components/kitchen/EndOfShiftForm.tsx
    - docs/CHANGELOG.md
decisions:
  - "Waste counts toward total made in review delta (totalMade = produced + waste) — staff want to know if their real output met the target regardless of spoilage reason"
  - "target prop is optional on ShiftReviewModal and ShiftSuccessScreen — backward compatible with any caller that doesn't yet pass targets"
  - "ShiftEditDialog uses plain text Input for chefName (not a user Select) — manager may want to type a name not in the system; no chefUserId update from dialog (name only)"
  - "ShiftRecord interface adds chefName + chefUserId as optional fields — aligns with what the backend already returns"
metrics:
  duration_minutes: 8
  completed_date: "2026-02-23"
  tasks_completed: 2
  files_modified: 6
---

# Phase 21 Plan 11: Shift Review Deltas + Success Screen Animation + Chef History Summary

One-liner: Target deltas in shift review (produced+waste vs target with +/- variance), Framer Motion stagger on success screen, and chef name display and edit in shift history.

## What Was Built

### Task 1 — ShiftReviewModal target deltas + EndOfShiftForm targets prop threading

**ShiftReviewModal.tsx (rewritten):**
- New optional `targets` prop (`Array<{ menuProductId, name, quantity }>`)
- Card-style bordered rows per produced item (replaces flat list)
- Per-product delta: `totalMade = produced + wasteForProduct`; delta = totalMade - target
- Delta color: emerald = met/exceeded, amber = fell short
- Delta display: `+N (totalMade/target)` or `-N (totalMade/target)` per row
- Waste inline note: "+ N waste" shown on the produced row when waste exists for that product
- Totals summary section: total produced, total waste (if any), total made (produced + waste)
- Waste section remains separate below the production cards (stored separately for trend analysis)

**EndOfShiftForm.tsx:**
- ShiftReviewModal now receives `targets={packagingItems}` — passes the packaging breakdown as target list
- ShiftSuccessScreen now receives `targets={packagingItems}` — available for future use
- No other changes needed (packagingItems was already derived from `targets?.packagingBreakdown ?? []`)

### Task 2 — ShiftSuccessScreen redesign + chef in ShiftHistoryList + ShiftEditDialog

**ShiftSuccessScreen.tsx (redesigned):**
- Replaced centered text layout with card list layout
- Header: CheckCircle2 icon (h-8 w-8) + "Shift Recorded" title, left-aligned
- Production section: `motion.div` container with `staggerChildren: 0.12` + `delayChildren: 0.2`
- Each produced item: `motion.div` with `opacity: 0, x: -10` → `opacity: 1, x: 0` (duration 0.3s)
- Each row: CheckCircle2 icon + product name (left) + N units (right)
- Waste section: separate `motion.div` with same stagger; rows show product name + reason label + `-N` count in destructive color
- Accepts optional `targets` prop (not used in display yet, available for future delta)

**ShiftHistoryList.tsx:**
- `ShiftRecord` interface extended with `chefName?: string` and `chefUserId?: string`
- `ShiftRecordCard`: shows `(chef: Name)` between submitter name and time when `chefName` differs from `submittedBy`
- Flex-wrap added to the submitter row to handle longer lines

**ShiftEditDialog.tsx:**
- `chefName` state initialized from `record.chefName ?? ""`
- Chef input field added above Edit Note: Label "Chef (actual cook)", `Input` with `h-8 text-sm`, placeholder "Chef name..."
- `updateShiftRecord` call now includes `chefName: chefName.trim() || undefined`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 224b9e8 | feat(21-11): shift review with target deltas + waste-toward-target totals |
| Task 2 | b984c35 | feat(21-11): success screen card layout + Framer Motion stagger + chef in history and edit dialog |

## Verification Results

- `npm run type-check` — PASS (clean, no errors)
- `npm run build` — PASS (8.32s, pre-existing CSS warnings only)

### Verification against success criteria:

- [x] `npm run type-check` passes
- [x] `npm run build` succeeds
- [x] Review summary has target deltas (+/- variance per product)
- [x] Waste counts toward target total (produced + waste = total made)
- [x] Success screen has card layout + stagger animation
- [x] Waste shown separately on success screen with reasons
- [x] Chef name visible on shift history records
- [x] Chef editable via ShiftEditDialog

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

Note: `ShiftEditDialog` uses a plain text `Input` for chefName rather than a user `Select`. The plan said "text input or user selector" — the text input approach is simpler and doesn't require passing the users list to the dialog. Managers can type any chef name, including names not in the system.

## Self-Check: PASSED

Files exist:
- `src/components/kitchen/ShiftReviewModal.tsx` — FOUND (targets prop, card rows, delta display, totals summary)
- `src/components/kitchen/ShiftSuccessScreen.tsx` — FOUND (motion.div stagger, card list, waste section)
- `src/components/kitchen/ShiftHistoryList.tsx` — FOUND (chefName on ShiftRecord, chef display in card)
- `src/components/kitchen/ShiftEditDialog.tsx` — FOUND (chefName state, input field, in mutation call)
- `src/components/kitchen/EndOfShiftForm.tsx` — FOUND (targets prop passed to ShiftReviewModal + ShiftSuccessScreen)
- `docs/CHANGELOG.md` — FOUND (v1.3.5 entry)

Commits exist:
- 224b9e8 — FOUND (feat 21-11 shift review target deltas)
- b984c35 — FOUND (feat 21-11 success screen + chef history)
