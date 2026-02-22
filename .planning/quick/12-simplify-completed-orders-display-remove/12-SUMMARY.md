---
phase: quick-12
plan: "01"
subsystem: orders/kanban
tags: [ui, orders, kanban, simplification]
dependency_graph:
  requires: []
  provides: [simplified-complete-column-cards]
  affects: [src/components/orders/KanbanCard.tsx, src/components/orders/KanbanColumn.tsx]
tech_stack:
  added: []
  patterns: [optional-prop-with-default, conditional-render]
key_files:
  created: []
  modified:
    - src/components/orders/KanbanCard.tsx
    - src/components/orders/KanbanColumn.tsx
decisions:
  - "Expedited badge moves to header row (next to customer name) in simplified mode, not dropped entirely"
  - "simplified prop defaults to false so all non-complete columns are unaffected"
metrics:
  duration: "~5 minutes"
  completed: 2026-02-22
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 12: Simplify Completed Orders Display — Remove Date/Overdue Badge Summary

**One-liner:** KanbanCard gains a `simplified` boolean prop that hides the due-date/overdue/Cancelled badge row, with EXPEDITED badge relocated to the header row; KanbanColumn passes `simplified={isCompleteColumn}` so only the Complete column uses it.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add simplified prop to KanbanCard | dfcbda1 | src/components/orders/KanbanCard.tsx |
| 2 | Pass simplified=true from KanbanColumn | be8ba38 | src/components/orders/KanbanColumn.tsx |

## What Was Built

### KanbanCard — `simplified` prop

Added optional `simplified?: boolean` prop (defaults to `false`).

When `simplified=true`:
- The entire "Due date + status badges" block is suppressed (`!simplified && (dueDateStr || isExpedited || isCancelled)`)
- The EXPEDITED badge is rendered inline next to the customer name in the header row using a flex container
- All other content (customer name, order number, creator, price/discount block, items list) is unchanged

When `simplified=false` (default): behavior is identical to before.

### KanbanColumn — passes prop

`simplified={isCompleteColumn}` is now passed to every `KanbanCard` rendered in the column. `isCompleteColumn` was already computed at line 37 (`config.key === 'complete'`), so no new logic was needed.

## Decisions Made

1. **Expedited badge relocation (not removal):** The plan required the expedited flag to still appear in simplified mode. Rather than drop it, we moved it inline to the header row next to the customer name, wrapped in a flex container. This preserves the amber border on the card (which comes from the card's `className` condition — unchanged) and adds the text badge for clarity.

2. **Default to false:** The prop defaults to `false` so every existing call site that does not pass `simplified` is completely unaffected.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run type-check` — passed (no errors)
- `npm run build` — passed (1934 kB bundle, CSS warnings are pre-existing and unrelated)

## Self-Check: PASSED

- `src/components/orders/KanbanCard.tsx` — modified, committed dfcbda1
- `src/components/orders/KanbanColumn.tsx` — modified, committed be8ba38
- Both commits verified in git log
