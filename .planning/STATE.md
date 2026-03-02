---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Financial Statements
status: active
last_updated: "2026-03-02T08:10:18Z"
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 9
  completed_plans: 4
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-02)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.5 Financial Statements -- Phase 33: Income Statement Frontend

## Current Position

Phase: 33 of 34 (Income Statement Frontend)
Plan: 33.2 of 3
Status: Active -- Plan 33-01 complete, advancing to Plan 33-02
Last activity: 2026-03-02 -- Plan 33-01 completed (3 tasks, 4 min)

Progress: ████░░░░░░░░░░░░░░░░ 33% -- 1 of 3 plans complete (Phase 33)

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)
**Velocity (v1.4):** 20 plans across 9 phases in 5 days

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 33 | 33-01 | 4min | 3 | 5 |

## Accumulated Context

### Decisions

All v1.0-v1.4 decisions archived in PROJECT.md Key Decisions table.

v1.5 design decisions documented in `docs/plans/2026-03-01-income-statement-design.md`:
- Real-time query aggregation (no snapshot tables)
- Consignment folded into unified P&L as another channel
- Full COGS (production + packaging) via BOM resolution
- Confidence indicators as first-class data quality signal
- Unmapped items = honest zero COGS with "missing" flag

Phase 32 decisions:
- buildProductCOGSMap uses string keys for Map (Convex IDs as strings)
- calculateWeekRange currentEnd is exclusive (next Monday 00:00 WIB) for index range queries
- aggregateWeek is a pure function (no ctx, no async) -- all I/O happens in handler
- Channel confidence = lowest confidence among its line items
- Internal discount = totalAmount - (finalTotal - deliveryFee), delivery fees excluded from P&L
- Pure helpers tested without convex-test for faster execution
- Integration tests seed data directly via ctx.db.insert (not mutation API) for isolation
- 18 new tests (10 unit + 8 integration), 680 total suite passing

Phase 33 decisions (Plan 33-01):
- Revenue section expanded by default, Deductions and COGS collapsed
- Period-agnostic column headers derived from query response (not hardcoded)
- Channel rows expandable to show gross margin % and COGS breakdown inline
- Mobile: CSS-first hidden comparison columns with JS toggle override
- Gross margin delta displayed as percentage points (pp) not relative percent

### Open Blockers (carried forward)

- GrabFood `orders:read` OAuth2 scope not yet granted -- infrastructure works, 401 handled gracefully
- Crystal and Tamtem GrabFood merchantIDs pending -- only GFSBPOS-254-353 confirmed
- GrabFood grabItemID values per outlet needed for menu toggle activation
- BigSeller COGS = 0 for all Frollie orders -- profit analytics meaningless until configured

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 29 | Add sync history entries for platform token refreshes | 2026-02-25 | 01071c3 | Verified | [29-add-sync-history-entries-for-platform-to](./quick/29-add-sync-history-entries-for-platform-to/) |

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 33-01-PLAN.md
Resume notes: Plan 33-01 complete (3/3 tasks). Page at /financials with P&L table, week navigation, channel drill-down. Next: Plan 33-02 (confidence indicators + data quality panel).
