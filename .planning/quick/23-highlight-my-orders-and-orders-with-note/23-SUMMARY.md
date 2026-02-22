---
phase: quick-23
plan: "01"
subsystem: orders/kanban
tags: [kanban, highlight, ux, orders]
dependency_graph:
  requires: []
  provides: [kanban-my-orders-highlight, kanban-notes-highlight]
  affects: [OrderManager, KanbanBoard, KanbanColumn, KanbanCard]
tech_stack:
  added: []
  patterns: [useMemo-sort, prop-threading, useAuth-userId]
key_files:
  created: []
  modified:
    - convex/orders/queries.ts
    - src/components/orders/KanbanCard.tsx
    - src/components/orders/KanbanColumn.tsx
    - src/components/orders/KanbanBoard.tsx
    - src/pages/OrderManager.tsx
decisions:
  - "Sorting is client-side only in KanbanColumn — no backend sort change needed"
  - "Notes highlight skipped when card is also expedited (expedited amber border takes precedence)"
  - "highlightClass uses ring-2 ring-blue-400 for mine, ring-1 ring-amber-300 for notes, combined when both"
  - "Both toggles default to ON (true) so highlights are visible on first load"
metrics:
  duration: "~8 min"
  completed: "2026-02-22"
  tasks: 2
  files: 5
---

# Quick Task 23: Highlight My Orders and Orders with Notes — Summary

**One-liner:** Blue ring highlight + top-sort for current user's orders; amber ring + inline note text for orders with notes; two checkbox toggles in kanban legend control both features.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add `notes` and `createdByUserId` to `listForKanban` return shape | 59ebdc2 |
| 2 | Highlight styling, notes display, sorting, legend toggles in kanban UI | d15dcce |

## What Was Built

### Backend (Task 1)

`convex/orders/queries.ts` — `listForKanban` result type now includes:
- `notes?: string` — order notes text
- `createdByUserId?: string` — string ID of the creating user

Both fields are already present on the orders table; this change simply exposes them in the lean kanban return shape.

### Frontend (Task 2)

**KanbanCard.tsx:**
- Extended `KanbanOrder` interface with `notes?` and `createdByUserId?`
- Extended `KanbanCardProps` with `isMine?`, `highlightMine?`, `highlightNotes?`
- Computes `hasMineHighlight` and `hasNotesHighlight` booleans
- Applies ring/border classes: `ring-2 ring-blue-400` (mine), `ring-1 ring-amber-300` (notes), combined when both
- Expedited amber border takes precedence over notes amber ring
- Renders notes text in `text-xs text-amber-700 bg-amber-50` styled box below items

**KanbanColumn.tsx:**
- Extended props with `currentUserId?`, `highlightMine?`, `highlightNotes?`
- Added `sortedOrders` useMemo that stably sorts user's orders to column top when `highlightMine && currentUserId`
- Uses `sortedOrders` for rendering; keeps `visibleOrders.length` for count badge
- Passes `isMine`, `highlightMine`, `highlightNotes` to each `KanbanCard`

**KanbanBoard.tsx:**
- Extended props with `currentUserId?`, `highlightMine?`, `highlightNotes?`
- Threads all three props to each `KanbanColumn`

**OrderManager.tsx:**
- Imports `useAuth` from `@/contexts/AuthContext`
- All hooks called before any conditional returns (React rules compliance)
- State: `highlightMine` (default `true`), `highlightNotes` (default `true`)
- Legend row above kanban board with two checkbox inputs + colored ring indicators
- Passes `currentUserId={user?.userId}`, `highlightMine`, `highlightNotes` to `KanbanBoard`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `convex/orders/queries.ts` modified — notes + createdByUserId in return shape
- [x] `src/components/orders/KanbanCard.tsx` — isMine highlight logic + notes display
- [x] `src/components/orders/KanbanColumn.tsx` — sortedOrders + prop pass-through
- [x] `src/components/orders/KanbanBoard.tsx` — prop threading
- [x] `src/pages/OrderManager.tsx` — legend toggles + useAuth
- [x] Commits: 59ebdc2, d15dcce
- [x] `npm run type-check` — passed (no errors)
- [x] `npm run build` — passed

## Self-Check: PASSED
