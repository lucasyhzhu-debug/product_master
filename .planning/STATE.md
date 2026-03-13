---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 45-01-PLAN.md (expense approval backend)
last_updated: "2026-03-13T13:58:24Z"
last_activity: 2026-03-13 -- Completed 45-01-PLAN.md (DoA helpers, approve/reject/void mutations, approval queries)
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 8
  completed_plans: 7
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-12)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.7 Expense & Accounting -- Phase 45 in progress (1/2 plans)

## Current Position

Phase: 45 of 50 (Expense Approval & Void)
Plan: 1 of 2
Status: Plan 45-01 complete, 45-02 remaining
Last activity: 2026-03-13 -- Completed 45-01-PLAN.md (DoA helpers, approve/reject/void mutations, approval queries)

Progress: [████████░░] 87%

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)
**Velocity (v1.4):** 20 plans across 9 phases in 5 days
**Velocity (v1.5):** 9 plans across 3 phases in 2 days
**Velocity (v1.6):** 16 plans across 6 phases in 7 days

## Accumulated Context

### Decisions

All v1.0-v1.6 decisions archived in PROJECT.md Key Decisions table.

**v1.7 Decisions:**
- 41-01: 39 PSAK accounts (not 36) -- detailed enumeration is authoritative over summary count
- 41-01: Upsert seed pattern (patch on re-run) matching productionUnitTypes:seedDefaults
- 41-01: journalEntryLines.entryDate denormalized for cross-table index queries
- 41-02: getWibDateStr delegates to getWibComponents (no WIB logic duplication)
- 41-02: Counter uses .unique() not .first() to prevent silent corruption from duplicate rows
- 41-02: Optional now parameter matches calculatePeriodRange testability pattern
- 42-01: Negative check fires before integer check in validateJournalLines (fractional negative throws "non-negative")
- 42-01: NON_REVERSIBLE_TYPES explicit guard prevents accidental double-voids
- 42-01: createReversalEntry passes original.sourceId through for by_source index queryability
- 42-01: Integration tests for ctx-dependent journal functions deferred -- pure function extraction covers critical logic
- 43-01: canDelete prop on EntityManager is backward-compatible (no canDelete = all items deletable)
- 43-01: Account code immutable after creation (stripped from update payload, not just system accounts)
- 43-01: Double toast suppressed via empty successMessage on mutation hooks (EntityManager handles toast)
- 43-01: Lock icon uses aria-label not title prop (Lucide React type constraint)
- 44-01: ALL_ROLES constant for all-user access instead of new auth wrapper
- 44-01: recordStatusChange internal helper (not exported) keeps audit trail coupling tight
- 44-01: updateDraft excludes self from duplicate check to prevent false positives
- 44-02: useSessionQuery for protectedQuery endpoints (first usage in codebase; useQuery lacks sessionId auto-injection)
- 44-02: ReceiptUpload is self-contained component with generateUploadUrl prop and SHA-256 client-side hashing
- 45-01: DoA helpers are pure functions (no ctx) for TDD testability
- 45-01: canApproveExpense checks self-approval BEFORE role check (fail-fast)
- 45-01: VOIDABLE_STATUSES kept module-level (not exported) -- isVoidableStatus() is the public API
- 45-01: getRejectionChain uses explicit Doc<"expenses"> to break circular type inference

### Research Findings (v1.7)

Key staff review fixes embedded in roadmap:
- C1: Reversal JE uses original entry date, not Date.now() (Phase 42)
- C2: Single-query aggregation for OpEx in P&L, not N+1 per GL account (Phase 49)
- C3: Should-Have fraud controls (FRAUD-06/07/08) included with analytics (Phase 50)
- I3: Frontend permissions defined before routes reference them (Phase 48)

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

Last session: 2026-03-13
Stopped at: Completed 45-01-PLAN.md (expense approval backend)
Resume notes: Phase 45 plan 01 complete (1/2). Backend: approve/reject/void mutations + approval queries. Next: 45-02 (approval frontend).
