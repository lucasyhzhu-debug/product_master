---
phase: 32-income-statement-backend
plan: 02
subsystem: api
tags: [convex, income-statement, cogs, revenue, bom, p&l]

# Dependency graph
requires:
  - phase: 32-01
    provides: buildProductCOGSMap, calculateWeekRange helpers
provides:
  - getWeeklyIncomeStatement query (full weekly P&L with COGS, deductions, gap analysis)
  - Exported fetchInternalOrderDataMap for cross-module use
affects: [32-03, income-statement-frontend, financials-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-aggregation-function, parallel-data-prefetch, confidence-classification]

key-files:
  created:
    - convex/reports/incomeStatement.ts
  modified:
    - convex/externalData/queries.ts

key-decisions:
  - "aggregateWeek is a pure function (no ctx, no async) for testability and parallel safety"
  - "All I/O happens upfront in handler via Promise.all, then passed to pure computation"
  - "Consignment settlements resolved via linkedRevenueId for COGS when available"
  - "Channel confidence = revenue confidence downgraded if any product has missing COGS"

patterns-established:
  - "Pure aggregation: fetch all data in handler, pass to pure function for computation"
  - "Confidence propagation: channel confidence is lowest of its line items"
  - "Gap analysis inline: unmapped products, zero-cost components, missing channels returned with P&L"

requirements-completed: [IS-01, IS-02, IS-03, IS-04, IS-05, IS-06]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 32 Plan 02: Weekly Income Statement Query Summary

**Full weekly P&L query with per-channel revenue, BOM COGS resolution, confidence classification, and gap analysis via pure aggregateWeek function**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T04:28:02Z
- **Completed:** 2026-03-02T04:31:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Created `getWeeklyIncomeStatement` query computing complete weekly P&L
- Per-channel revenue aggregation from externalRevenue + consignmentSettlements with proper deduction handling
- Full BOM COGS resolution via buildProductCOGSMap for all revenue items across all channels
- Confidence classification (exact/calculated/inferred/missing) on every financial figure
- Gap analysis: unmapped products, zero-cost components, missing channels
- Previous week comparison with delta amounts and percentage changes
- Pure aggregateWeek function (no ctx, no async) for testability

## Task Commits

Each task was committed atomically:

1. **Task 1: Create income statement query file** - `540ff4f` (feat)

## Files Created/Modified
- `convex/reports/incomeStatement.ts` - Weekly income statement query with pure aggregateWeek, COGS resolution, gap analysis
- `convex/externalData/queries.ts` - Added `export` keyword to fetchInternalOrderDataMap

## Decisions Made
- aggregateWeek is a pure synchronous function (no ctx, no async) -- all database I/O happens upfront in the handler via Promise.all, then data is passed to the pure function. This enables testability without Convex context and avoids concurrent ctx.db issues.
- Consignment COGS resolved via linkedRevenueId when available -- settlements with a linkedRevenueId get their items from the revenueItemsMap for BOM COGS resolution. Without it, COGS = 0 with confidence "missing".
- Channel confidence = lowest confidence among its line items -- if any product in a channel has "missing" COGS, the whole channel confidence is downgraded.
- Internal channel discount formula: totalAmount - (finalTotal - deliveryFee) -- delivery fees are pass-through and excluded from P&L per CONTEXT.md decision.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- getWeeklyIncomeStatement query ready for Plan 32-03 (unit tests)
- Query can be consumed by Phase 33 frontend (financials page)
- All 6 IS requirements (IS-01 through IS-06) satisfied by the query

## Self-Check: PASSED

- FOUND: convex/reports/incomeStatement.ts
- FOUND: convex/externalData/queries.ts
- FOUND: 32-02-SUMMARY.md
- FOUND: commit 540ff4f

---
*Phase: 32-income-statement-backend*
*Completed: 2026-03-02*
