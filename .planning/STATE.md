---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Tech Debt & Resilience
status: in-progress
stopped_at: Completed 40-01-PLAN.md (Retroactive Verification Gap Closure)
last_updated: "2026-03-09T10:00:00Z"
last_activity: 2026-03-09 - Completed Phase 40 Plan 01: Retroactive VERIFICATION.md creation for Phases 35-37
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 16
  completed_plans: 16
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-03)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** Phase 40 — Retroactive Verification Gap Closure (plan 01 of 01 complete)

## Current Position

Phase: 40 — Retroactive Verification Gap Closure
Plan: 1 of 1
Status: Phase 40-01 complete -- All 12 documentation gaps closed
Last activity: 2026-03-09 - Created VERIFICATION.md for Phases 35-37, fixed SUMMARY frontmatter, updated REQUIREMENTS.md

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)
**Velocity (v1.4):** 20 plans across 9 phases in 5 days
**Velocity (v1.5):** 9 plans across 3 phases in 2 days
**Velocity (v1.6):** Phase 35: P01 13min, P02 16min | Phase 36: P01 5min, P02 9min, P03 11min | Phase 38: P01 7min, P02 6min, P03 8min, P04 5min | Phase 39: P01 5min, P02 12min, P03 3min

## Accumulated Context

### Decisions

All v1.0-v1.5 decisions archived in PROJECT.md Key Decisions table.

- P35-01: 42 schema findings identified (1 critical, 20 moderate, 21 low) across 65 tables
- P35-01: 22 unused indexes for removal, 6 range bounds anti-patterns, 1 critical missing index usage
- P35-01: productionUnitTypes + componentTypes merge documented but NOT recommended for this phase
- P35-02: 20 unused indexes removed (not 22 -- productionUnitTypes.by_active was incorrectly flagged, OI-06/OI-08 kept)
- P35-02: 5 compound indexes added to eliminate post-scan filters on 30+ query sites
- P35-02: Critical session cleanup (MIS-01) fixed to use by_expiry index
- P35-02: 10 range bound anti-patterns fixed (IRB-01: 5 sites, IRB-02: 5 sites)
- P36-01: Direct import updates (no re-export bridges) per CONTEXT.md override of design doc
- P36-01: WIB helpers placed in periodRange.ts (reuses existing WIB_OFFSET_HOURS) rather than new file
- P36-02: Unified GoBiz/Internal demand-to-product builder (identical pattern, single helper)
- P36-02: Pre-fetch orderDataMap pattern eliminates async closure in dashboard aggregation
- P36-02: queries.ts reduced from 1,773 to 1,387 LOC (22% reduction, 5 helper files)
- P36-03: k3martCockpit/queries.ts reduced from 985 to 760 LOC (22.8% reduction, 2 helper files)
- P36-03: queryHelpers/ directory pattern (not helpers/) avoids Windows case-insensitive collision
- P36-03: 760 LOC slightly over 750 target -- remaining functions too ctx-dependent for pure extraction
- P38-01: OverviewTab.tsx split from 1,273 to 283 LOC (78% reduction), 14 new files in salesAnalytics + shared dateUtils.ts
- P38-01: PeriodData type includes all PeriodSummary fields (totalAdBurn, totalPromoBurn) for prop type safety
- P38-01: Shared WIB helpers consolidated in src/lib/dateUtils.ts (6 exports, single source of truth)
- P38-02: GrabFoodManager.tsx split from 1,486 to 173 LOC (88% reduction), 6 tab components in salesAnalytics/
- P38-02: Named GrabFoodSettingsTab (not SettingsTab) to avoid barrel collision with existing SettingsTab
- P38-02: formatCurrencyIDR eliminated from codebase, replaced with formatCurrency(amount ?? 0) pattern
- P38-03: FinishedGoodsTab.tsx split from 1,474 to 488 LOC (67% reduction), 6 new files (utils + 4 views + settings)
- P38-03: handleUpdateLocationType wrapper bridges FinishedGoodsSettings string params to typed Convex mutation
- P38-04: VouchersManager.tsx split from 1,285 to 506 LOC (60.6% reduction), 5 components + barrel in src/components/vouchers/
- P38-04: FreeVoucherDialog made self-contained with own state/handler (critical for LOC target)
- P39-01: Auto-seed creates depot location + links outlet + seeds zero-stock inventory in a single call
- P39-01: DEPOT_CONFIG array makes adding new depot patterns trivial (pattern match on outlet name)
- P39-01: Unknown outlets still skip with warning log (no auto-seed for unmapped outlets)
- P39-03: Period badges are Badge components with cursor-pointer class, not buttons -- use text-based selectors
- P39-03: HeroCards has 5 cards (Gross Sales, Net Sales, Commissions Paid, Discounts Given, Delivery Fees)
- P39-03: Channel breakdown is ChannelSummary card grid (All Channels + dynamic channels) not a traditional table
- [Phase 39]: P39-03: Period badges use cursor-pointer class selector (Badge components, not buttons)
- [Phase 39]: P39-02: Order lifecycle E2E test handles address validation + stock shortage dialogs during status transitions
- [Phase 39]: P39-02: Kitchen EoS test gracefully degrades when no production targets configured (passes with logging)

### Open Blockers (carried forward)

- GrabFood `orders:read` OAuth2 scope not yet granted -- infrastructure works, 401 handled gracefully
- Crystal and Tamtem GrabFood merchantIDs pending -- only GFSBPOS-254-353 confirmed
- GrabFood grabItemID values per outlet needed for menu toggle activation
- BigSeller COGS = 0 for all Frollie orders -- profit analytics meaningless until configured

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 29 | Add sync history entries for platform token refreshes | 2026-02-25 | 01071c3 | Verified | [29-add-sync-history-entries-for-platform-to](./quick/29-add-sync-history-entries-for-platform-to/) |
| 30 | Add monthly view and custom date filter to income statement | 2026-03-05 | e107f19 | Verified | [30-add-monthly-view-and-custom-date-filter-](./quick/30-add-monthly-view-and-custom-date-filter-/) |
| 31 | Remove Sales Details table from Sales Analytics Overview | 2026-03-07 | e769b4f | Verified | [31-remove-detailed-transactions-table-from-](./quick/31-remove-detailed-transactions-table-from-/) |

## Session Continuity

Last session: 2026-03-09T10:00:00Z
Stopped at: Completed Phase 40 Plan 01 (Retroactive Verification Gap Closure)
Resume notes: Phase 40 complete. All 12 documentation gaps closed. v1.6 milestone ready for completion.
