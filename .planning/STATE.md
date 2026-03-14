---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 47-02-PLAN.md (payroll frontend)
last_updated: "2026-03-14T02:16:40.415Z"
last_activity: "2026-03-14 -- Completed 47-02-PLAN.md (payroll frontend: hooks, PayrollManager page, route, header nav)"
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 12
  completed_plans: 12
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 47-02-PLAN.md (payroll frontend)
last_updated: "2026-03-14T02:02:08Z"
last_activity: "2026-03-14 -- Completed 47-02-PLAN.md (payroll frontend: hooks, PayrollManager page, route, header nav)"
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 12
  completed_plans: 12
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-12)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.7 Expense & Accounting -- Phase 47 complete (payroll backend + frontend)

## Current Position

Phase: 47 of 50 (Payroll)
Plan: 2 of 2 (PHASE COMPLETE)
Status: Phase 47 complete (payroll backend + frontend)
Last activity: 2026-03-14 -- Completed 47-02-PLAN.md (payroll frontend: hooks, PayrollManager page, route, header nav)

Progress: [██████████] 100%

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

Last session: 2026-03-14
Stopped at: Completed 47-02-PLAN.md (payroll frontend)
Resume notes: Phase 47 complete (2/2). Payroll frontend: usePayroll hooks (5 hooks + 2 types), PayrollManager page with create form (JE preview confirmation) + filterable history list + void dialog, /payroll route with admin ProtectedRoute, header admin dropdown entry. 822 tests passing, build clean. Phase 47 fully done -- ready for merge to main.
