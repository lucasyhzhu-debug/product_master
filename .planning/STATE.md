---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Financial Statements
status: active
last_updated: "2026-03-02T04:25:25Z"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 3
  completed_plans: 1
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-02)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.5 Financial Statements -- Phase 32: Income Statement Backend

## Current Position

Phase: 32 of 34 (Income Statement Backend)
Plan: 32.2 of 3 (Income Statement Query)
Status: Active -- Plan 32-01 complete, advancing to 32-02
Last activity: 2026-03-02 -- Plan 32-01 completed (2 tasks, 2 min)

Progress: ███░░░░░░░░░░░░░░░░░ 33% -- 1 of 3 plans complete

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)
**Velocity (v1.4):** 20 plans across 9 phases in 5 days

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
Stopped at: Completed 32-01-PLAN.md
Resume notes: Plan 32-01 complete. Next: execute Plan 32-02 (Income Statement Query).
