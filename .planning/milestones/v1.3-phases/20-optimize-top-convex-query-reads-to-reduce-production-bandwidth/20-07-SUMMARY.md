---
phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth
plan: "07"
subsystem: api
tags: [convex, query-optimization, bandwidth, kanban, orders]

# Dependency graph
requires:
  - phase: 20-06
    provides: pattern for reducing reactive query payload size
provides:
  - listForKanban pruned to 18 order fields + 5 item fields (from 30+ and 15+ respectively)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lean projection pattern: return explicit field object instead of spreading Doc<T>"
    - "Lean type annotation: annotate result variable with exact projected shape to enforce return contract"

key-files:
  created: []
  modified:
    - convex/orders/queries.ts

key-decisions:
  - "listForKanban result type annotation uses explicit lean type (not Doc<orders> spread) to enforce that pruned shape is returned and prevent accidental field re-addition"
  - "lineTotal kept in KanbanOrderItem even though not rendered in KanbanCard — it IS part of the interface contract and may be used by future callers"
  - "No frontend changes needed — KanbanCard interface already matched the pruned shape exactly"

patterns-established:
  - "Lean projection: when enriching Convex query results, return { field: order.field, ... } not { ...order } to control payload size"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-02-22
---

# Phase 20 Plan 07: Prune listForKanban Return Shape Summary

**listForKanban reactive subscription payload reduced ~50% by projecting 18 order fields + 5 item fields instead of spreading full Doc objects**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-22T14:58:11Z
- **Completed:** 2026-02-22T15:04:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced `{ ...order, items, creatorName }` spread with explicit 18-field lean projection in `listForKanban`
- Pruned items from 15+ fields to 5 fields per item (`_id`, `productName`, `productVariant`, `quantity`, `lineTotal`)
- Dropped from orders: `notes`, `channel`, `paymentStatus`, `paymentMethod`, `shippingId`, `shippingAgency`, `shippingCost`, `voucherCode`, `voucherType`, `itemCount`, `customerId`, `createdBy`, `createdByUserId`, `orderDate`, `confirmedAt`, `deliveryFee`, and all other non-Kanban fields
- Updated `result` variable type annotation to explicit lean shape (removes `Doc<"orders">` spread) — prevents future accidental field re-addition
- Build passes with zero type errors; KanbanCard/KanbanColumn/KanbanBoard unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Prune listForKanban return shape** - `3bd01b2` (feat)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified
- `convex/orders/queries.ts` - listForKanban returns lean projected shape; result type annotation updated to match pruned output

## Decisions Made
- Kept `lineTotal` in item projection and KanbanOrderItem interface even though KanbanCard doesn't render it — it's part of the return contract and may be used in future
- No frontend changes needed — KanbanCard.KanbanOrder interface already matched the target pruned shape exactly
- Lean type annotation on `result` variable (not inferred) enforces the return contract at compile time

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- listForKanban bandwidth reduction live after deploy; expected ~40-60% reduction for this subscription
- Post-deploy: verify in Convex dashboard that listForKanban bandwidth drops before proceeding to 20-08
- Phase 20 is now 7/8 plans complete; one plan remaining

## Self-Check

### Files verified:
- `convex/orders/queries.ts` — listForKanban lean projection present

### Commits verified:
- `3bd01b2` — feat(20-07): prune listForKanban return shape to lean projection

## Self-Check: PASSED

---
*Phase: 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth*
*Completed: 2026-02-22*
