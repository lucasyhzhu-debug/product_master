---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 57-01-PLAN.md
last_updated: "2026-03-17T19:53:42Z"
last_activity: 2026-03-17 - Completed Plan 57-01 (Invoice backend: 3 new tables, 9 functions, 51 tests)
progress:
  total_phases: 23
  completed_phases: 17
  total_plans: 43
  completed_plans: 38
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Phase 59 context gathered
last_updated: "2026-03-16T13:37:14.446Z"
last_activity: 2026-03-16 - Completed Plan 56-02 (ExpenseGuide sections 5-8, visual verification approved)
progress:
  total_phases: 22
  completed_phases: 16
  total_plans: 36
  completed_plans: 37
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 56-02-PLAN.md
last_updated: "2026-03-16T12:54:33.747Z"
last_activity: 2026-03-16 - Completed Plan 56-02 (ExpenseGuide sections 5-8, visual verification approved)
progress:
  total_phases: 21
  completed_phases: 16
  total_plans: 36
  completed_plans: 37
---

---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: Support & Quality of Life
status: in_progress
stopped_at: "Completed 56-02-PLAN.md"
last_updated: "2026-03-16T12:28:05Z"
last_activity: "2026-03-16 - Completed Plan 56-02 (ExpenseGuide sections 5-8, visual verification approved)"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-16)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.7 Expense & Accounting -- Phase 57 (Invoice Backend & Business Settings) Plan 01 COMPLETE

## Current Position

Phase: 57-invoice-backend-business-settings (Plan 1 of 2 complete)
Plan: 57-01 (complete)
Status: Plan 57-01 complete, Plan 57-02 next
Last activity: 2026-03-17 - Completed Plan 57-01 (Invoice backend: 3 new tables, 9 functions, 51 tests)

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)
**Velocity (v1.4):** 20 plans across 9 phases in 5 days
**Velocity (v1.5):** 9 plans across 3 phases in 2 days
**Velocity (v1.6):** 16 plans across 6 phases in 7 days
**Velocity (v1.7):** 32 plans across 15 phases in 7 days

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 56-expense-training-guide | 01 | 5min | 1 | 3 |
| 56-expense-training-guide | 02 | 4min | 2 | 2 |
| 57-invoice-backend-business-settings | 01 | 11min | 4 | 8 |

## Accumulated Context

### Decisions

All v1.0-v1.7 decisions archived in PROJECT.md Key Decisions table.

- [55-01] Used CSS variable tokens via inline styles for dark mode (no dark: Tailwind classes) per design spec
- [55-01] Used error tokens (red) for CalloutBox "important" type since no orange status token exists
- [55-02] Used motion.svg + motion.g for staggered node animation, motion.path for edge stroke-dashoffset draw
- [55-02] Reused amber CSS variable tokens for orange color (no dedicated orange status token)
- [55-02] Extracted useActiveSection to src/hooks/ for reusability across future guide pages
- [55-03] Made NavItem.permission optional (non-breaking) so Help nav item needs no permission prop
- [55-03] Eager imports for HelpCenter and GuideRouter (static JSX, no Convex queries)
- [55-03] ProtectedRoute with no permission/role props = auth-only gate for Help routes
- [56-01] Duplicated guide metadata inline in ExpenseGuide.tsx to avoid circular import with helpGuides.ts
- [Phase 56-02]: Used HTML entity references for special chars in JSX; fraud flags as bordered description cards
- [57-01] Extracted 5 pure helpers from invoice mutations for testability (project convention: pure function tests over convex-test runtime)
- [57-01] Used .first() not .unique() for invoiceCounters lookup (gracefully handles duplicate rows)
- [57-01] INVOICEABLE_STATUSES allowlist pattern for forward-compatible status validation
- [57-01] paymentStatus/paymentMethod snapshotted at draft creation, excluded from updateDraft

### Roadmap Evolution

- Phase 59 added: Direct debit expense flow — company-paid transactions with different journal entries and no reimbursement
- Phase 60 added: Asset Register & Depreciation — Fixed asset tracking with auto-calculated monthly straight-line depreciation and one-click JE generation
- Phase 61 added: Help File Indexing Architecture — Automatic discovery, content indexing, refresh triggers on doc/feature changes, and search interface for help content
- Phase 59.1 inserted after Phase 59: Company payment request flow — prospective vendor payments requiring approval before bank transfer execution (URGENT)
- Phase 62 added: Manual Journal Entry Page — Template-based balance sheet transaction recording with 6 pre-wired templates

### Open Blockers (carried forward)

- GrabFood `orders:read` OAuth2 scope not yet granted -- infrastructure works, 401 handled gracefully
- Crystal and Tamtem GrabFood merchantIDs pending -- only GFSBPOS-254-353 confirmed
- GrabFood grabItemID values per outlet needed for menu toggle activation
- BigSeller COGS = 0 for all Frollie orders -- profit analytics meaningless until configured

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 34 | Fix GL codes missing + cascading Tier 1/Tier 2 dropdowns in expense form | 2026-03-16 | ebc8452 | Verified | [34-fix-gl-codes](./quick/34-fix-gl-codes-missing-in-expense-form-and/) |

## Session Continuity

Last session: 2026-03-17T19:53:42Z
Stopped at: Completed 57-01-PLAN.md
Resume notes: Plan 57-01 complete. 3 new tables (businessSettings, invoiceCounters, invoices) + customer extension deployed. 9 Convex functions created. 51 unit tests passing. Ready for Plan 57-02 (Business Settings UI).
