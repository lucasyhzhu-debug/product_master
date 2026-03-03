---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Financial Statements
status: unknown
last_updated: "2026-03-02T15:07:55.978Z"
progress:
  total_phases: 13
  completed_phases: 11
  total_plans: 58
  completed_plans: 59
---

---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Financial Statements
status: complete
last_updated: "2026-03-02T15:02:33Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-02)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.5 Financial Statements -- COMPLETE (all 3 phases shipped)

## Current Position

Phase: 34 of 34 (Income Statement Testing) -- COMPLETE
Plan: 34.1 of 1 (all complete)
Status: v1.5 milestone complete -- all 3 phases (32, 33, 34) delivered, 9 plans total, 684 tests passing
Last activity: 2026-03-02 -- Plan 34-01 completed (2 tasks, 4 min)

Progress: ████████████████████ 100% -- 1 of 1 plans complete (Phase 34)

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)
**Velocity (v1.4):** 20 plans across 9 phases in 5 days

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 33 | 33-01 | 4min | 3 | 5 |
| 33 | 33-02 | 4min | 2 | 5 |
| 33 | 33-03 | 5min | 2 | 3 |
| 33 | 33-04 | 7min | 2 | 7 |
| 33 | 33-05 | 5min | 9 | 7 |
| 34 | 34-01 | 4min | 2 | 3 |

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

Phase 33 decisions (Plan 33-02):
- Channel gross margin sub-row as separate table row with prev week + delta columns
- COGS breakdown stays as inline text sub-row for density management
- Seller shipping gap warning non-dismissable when marketplace channels have revenue
- DataQualityPanel uses controlled Collapsible, default open tied to issueCount > 0
- formatWithConfidence helper handles all 4 confidence levels

Phase 33 decisions (Plan 33-03):
- CSV generation extracted to standalone src/lib/csvExport.ts (~300 lines) for maintainability
- All deduction rows always included in CSV (even zero) per accounting convention
- Per-channel deduction breakdown rows after aggregate "All" rows
- Delta percentages computed inline for deduction and COGS rows
- IncomeStatementData interface duplicated client-side (no Convex server imports)

Phase 33 decisions (Plan 33-04):
- financialHelpers uses .tsx extension (not .ts) because it contains JSX component definitions
- CSS variable tokens (--color-status-success/error/warning) replace raw dark: overrides for dark mode
- computeDelta shared as single function; CSV wrapper (formatDeltaPct) handles string formatting
- WIB_OFFSET_MS and WEEK_MS defined once in financialHelpers, imported by useFinancials and FinancialStatement

Phase 33 decisions (Plan 33-05):
- colSpan always 4 on SectionHeaderRow/COGS sub-row -- HTML allows colSpan > visible columns
- DeltaIndicator unit prop: "pp" at 1 decimal precision for percentage points, "%" at 0 for regular
- CSV formula injection sanitization with single-quote prefix (Excel/Sheets text-force convention)
- DataQualityPanel useEffect sync on issueCount to handle week navigation

Phase 34 decisions:
- totalMappedProducts/totalProducts count revenue item rows (not unit quantities) -- resolveItemsCOGS increments once per item, not per quantity
- Sentinel value (99999) on consignment externalRevenue.revenueGross proves query reads gross from consignmentSettlements, not externalRevenue
- 22 total income statement tests (12 integration + 10 unit) cover all 4 Phase 34 success criteria

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
Stopped at: Completed 34-01-PLAN.md (Phase 34 complete, v1.5 milestone shipped)
Resume notes: v1.5 Financial Statements milestone complete. All 3 phases delivered (32: backend, 33: frontend, 34: testing). 9 plans total, 684 tests passing, npm run build succeeds. All 14 requirements (IS-01 through IS-14) addressed. Next: merge gsd/phase-34-income-statement-testing branch to main.
