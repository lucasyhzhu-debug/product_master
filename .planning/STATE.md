---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 51-01-PLAN.md
last_updated: "2026-03-15T02:35:12.980Z"
last_activity: 2026-03-15 -- Completed 51-01-PLAN.md (metadata field on journalEntries + journal engine extension)
progress:
  total_phases: 12
  completed_phases: 10
  total_plans: 20
  completed_plans: 17
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 50-02-PLAN.md
last_updated: "2026-03-15T02:34:46.276Z"
last_activity: 2026-03-14 -- Completed 50-02-PLAN.md (expense analytics frontend dashboard with charts and fraud flags)
progress:
  total_phases: 12
  completed_phases: 10
  total_plans: 20
  completed_plans: 17
  percent: 85
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 50-02-PLAN.md
last_updated: "2026-03-14T15:44:14.427Z"
last_activity: 2026-03-14 -- Completed 50-02-PLAN.md (expense analytics frontend dashboard with charts and fraud flags)
progress:
  [█████████░] 85%
  completed_phases: 10
  total_plans: 16
  completed_plans: 16
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 49-01-PLAN.md
last_updated: "2026-03-14T14:10:22.539Z"
last_activity: 2026-03-14 -- Completed 49-01-PLAN.md (extended P&L below Gross Profit with journal aggregation)
progress:
  total_phases: 11
  completed_phases: 9
  total_plans: 14
  completed_plans: 14
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 49-01-PLAN.md
last_updated: "2026-03-14T13:53:54.367Z"
last_activity: 2026-03-14 -- Completed 49-01-PLAN.md (extended P&L below Gross Profit with journal aggregation)
progress:
  total_phases: 11
  completed_phases: 9
  total_plans: 14
  completed_plans: 14
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 48-01-PLAN.md
last_updated: "2026-03-14T13:53:06.890Z"
last_activity: 2026-03-14 -- Completed 48-01-PLAN.md (4 permission flags, route migration, ExpenseAnalytics stub, nav links)
progress:
  total_phases: 11
  completed_phases: 9
  total_plans: 14
  completed_plans: 14
  percent: 100
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 48-01-PLAN.md
last_updated: "2026-03-14T11:57:26.173Z"
last_activity: 2026-03-14 -- Completed 48-01-PLAN.md (4 permission flags, route migration, ExpenseAnalytics stub, nav links)
progress:
  [██████████] 100%
  completed_phases: 8
  total_plans: 13
  completed_plans: 13
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 48-01-PLAN.md (frontend permissions & routes)
last_updated: "2026-03-14T11:44:48Z"
last_activity: "2026-03-14 -- Completed 48-01-PLAN.md (4 permission flags, route migration, ExpenseAnalytics stub, nav links)"
progress:
  total_phases: 10
  completed_phases: 8
  total_plans: 13
  completed_plans: 13
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-12)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.7 Expense & Accounting -- Phase 51 in progress (historical expense import)

## Current Position

Phase: 51 of 52 (Bulk Upload of Previously Reimbursed Expenses)
Plan: 2 of 4
Status: Plan 51-02 complete. Backend mutation and client CSV validation delivered (TDD). Continuing with Plan 03.
Last activity: 2026-03-15 -- Completed 51-02-PLAN.md (bulkCreateJournalEntries mutation + parseAndValidateCsv helper, 33 tests)

Progress: [██████████] 95%

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
- 45-02: allowedRoles pattern for route guard since canApproveExpenses permission flag deferred to Phase 48
- 45-02: ApprovalActions uses separate Dialog instances per action type (approve/reject/void) for simpler state management
- 45-02: Receipt thumbnail deferred -- expense queries don't resolve storage URLs, shows "Receipt attached" badge instead
- [Phase 46]: recordStatusChange extracted to shared auditTrail.ts (reusable by both expenses and reimbursements)
- [Phase 46]: listBatches uses .take(100) cap instead of .collect() (I3 fix for unbounded growth)
- [Phase 46]: confirmBatch uses transferDate as JE business date, not Date.now() (C1 staff review)
- [Phase 46]: Double-batching guard checks by_expense index on reimbursementBatchItems for pending batches
- [Phase 46]: useUpdateBankDetails lives in useBankAccounts.ts (domain grouping) not useExpenses.ts
- [Phase 46]: EntityManager mutation hooks suppress toasts (empty strings) to avoid double toast
- [Phase 46]: canAccessUsers permission for reimbursement nav items (canManageReimbursements deferred to Phase 48)
- [Phase 46]: Auto-open ConfirmBatchDialog after batch creation for streamlined admin workflow
- 47-01: Shared validation in convex/lib/validation.ts eliminates duplication across expenses, reimbursements, and payroll
- 47-01: Insert payroll entry first (for sourceId), then create JE, then patch with journalEntryId
- 47-01: Explicit journalEntryId guard (no non-null assertion) in voidEntry for safety
- 47-02: JE preview uses AlertDialog (not Dialog) for confirm/cancel UX consistency
- 47-02: Employee type filter uses button group matching ReimbursementManager pattern
- 47-02: canAccessUsers permission for payroll nav item (canManagePayroll deferred to Phase 48)
- 48-01: canManageReimbursements used for /reimbursements, /bank-accounts, /payroll, /accounts (all admin-only, semantically correct)
- 48-01: Expenses nav link in mainNavItems after Financials (high-frequency for all roles)
- 48-01: Admin dropdown items migrated from canAccessUsers to canManageReimbursements for semantic correctness
- [Phase 49]: by_entryDate single query per period (PNL-04) instead of N+1 by_account_entryDate
- [Phase 49]: aggregateJournalLines computes total BEFORE filtering near-zero items (total includes all, items filtered for display)
- [Phase 49]: unionMergeByCode shared helper for OpEx and Other sections avoids duplicated merge logic
- 50-01: aggregateJournalLines extracted to convex/lib/journalHelpers.ts (shared between incomeStatement + analytics)
- 50-01: by_status_expenseDate compound index for O(1) status+date queries
- 50-01: YYYY-MM composite key for 6-month trend bucketing (no year-boundary collisions)
- 50-01: MIN_EXPENSES_FOR_CONCENTRATION = 2 to suppress trivial single-expense false positives
- 50-01: Unfamiliar vendor uses 30d recent vs 30-90d historical window (not all-time)
- 50-02: Period math extracted to pure functions in expenseAnalyticsPeriod.ts for unit testability
- 50-02: Month and custom mode only (no weekly) -- expense analytics is monthly granularity
- 50-02: PieChart donut variant (innerRadius=40) for GL category breakdown
- 50-02: FraudFlagsCard renders all 3 fraud types in one card with color-coded sections
- 50-02: Period picker follows FinancialStatement pattern (Badge toggle + month nav arrows)
- [Phase 51]: 51-01: Conditional metadata spread in journal engine insert to avoid inserting undefined field on entries without metadata
- 51-02: Separate dateToWibEpoch with strict YYYY-MM-DD regex from permissive wibDateStrToUtcMs for CSV import security
- 51-02: Parallel ImportRow types in backend/frontend with cross-reference comments (no shared imports across Convex boundary)
- 51-02: Duplicate CSV rows produce warnings not errors -- users may intentionally have same-date same-amount expenses

### Research Findings (v1.7)

Key staff review fixes embedded in roadmap:
- C1: Reversal JE uses original entry date, not Date.now() (Phase 42)
- C2: Single-query aggregation for OpEx in P&L, not N+1 per GL account (Phase 49)
- C3: Should-Have fraud controls (FRAUD-06/07/08) included with analytics (Phase 50)
- I3: Frontend permissions defined before routes reference them (Phase 48)

### Roadmap Evolution

- Phase 51 added: Bulk Upload of Previously Reimbursed Expenses via Bank Transaction Mapping
- Phase 52 added: Expense System Simplification (refactor v1.7 code — 17 findings from 3-agent review)

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
| Phase 49 P01 | 9 | 2 tasks | 4 files |
| Phase 51 P01 | 2min | 1 tasks | 2 files |

## Session Continuity

Last session: 2026-03-15T02:42:40Z
Stopped at: Completed 51-02-PLAN.md
Resume notes: Plan 51-02 complete. TDD-built bulkCreateJournalEntries mutation (fail-fast batch validation, max 50 rows, admin-only) and parseAndValidateCsv helper (Papa Parse, strict date regex, duplicate warnings). 33 new tests (11 backend + 22 frontend), 931 total suite green. Ready for Plan 03 (frontend wizard page).
