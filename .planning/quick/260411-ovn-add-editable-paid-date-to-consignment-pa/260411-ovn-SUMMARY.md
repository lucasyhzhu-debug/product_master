---
phase: 260411-ovn
plan: 01
subsystem: consignment
tags: [consignment, settlements, ux]
dependency_graph:
  requires: []
  provides: [editable-paid-date]
  affects: [consignment-settlements]
tech_stack:
  added: []
  patterns: [date-picker-in-confirm-dialog]
key_files:
  created: []
  modified:
    - convex/consignment/mutations.ts
    - src/components/salesAnalytics/SettlementTimeline.tsx
    - src/components/salesAnalytics/OutletCard.tsx
decisions:
  - "Used ConfirmDialog children prop for date picker injection (no new dialog component needed)"
  - "paidAt is optional on mutation -- backwards compatible with existing callers"
  - "updatedAt always uses Date.now() (mutation time), paidAt uses user-chosen date"
metrics:
  duration: 221s
  completed: "2026-04-11"
  tasks: 2
  files: 3
---

# Quick Task 260411-ovn: Add Editable Paid Date to Consignment Mark as Paid

Optional paidAt timestamp on markAsPaid mutation + date picker in ConfirmDialog defaulting to today, max=today

## Task Results

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Backend -- add optional paidAt arg to markAsPaid | 13d82853 | convex/consignment/mutations.ts |
| 2 | Frontend -- date picker in dialog + pass paidAt | 09e5391b | SettlementTimeline.tsx, OutletCard.tsx |

## Changes Made

### Backend (convex/consignment/mutations.ts)
- Added `paidAt: v.optional(v.number())` to markAsPaid args
- `const paidAt = args.paidAt ?? now` -- uses user value or falls back to Date.now()
- `updatedAt` remains `now` (always current mutation time)

### Frontend (SettlementTimeline.tsx)
- Added date picker inside ConfirmDialog via `children` prop
- State `paidDate` initialized to today when dialog opens
- `max` attribute prevents future date selection
- `onMarkPaid` signature updated to include `paidAt: number`
- Uses `toLocalEpoch` / `fromEpochToDateString` from settlementUtils

### Frontend (OutletCard.tsx)
- `handleMarkPaid` accepts `paidAt` parameter and passes to mutation

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Verification

- `npm run build` passes clean
- Type check passes with no errors

## Self-Check: PASSED
