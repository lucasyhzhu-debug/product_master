---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: in_progress
stopped_at: Completed 59-03-PLAN.md
last_updated: "2026-03-17T00:46:01Z"
last_activity: 2026-03-17 - Completed Plan 59-03 (Frontend hooks, form & badges for expense payment overhaul)
progress:
  total_phases: 23
  completed_phases: 17
  total_plans: 43
  completed_plans: 40
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-16)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.7 Expense & Accounting -- Phase 59 (Direct Debit Expense Flow) Plan 03 COMPLETE

## Current Position

Phase: 59-direct-debit-expense-flow (Plan 3 of 4 complete)
Plan: 59-04 (next)
Status: Plan 59-03 complete, frontend hooks, form, badges, and filters updated for all payment methods
Last activity: 2026-03-17 - Completed Plan 59-03 (Frontend hooks, form & badges for expense payment overhaul)

Progress: [██████████] 95%

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
| 59-direct-debit-expense-flow | 01 | 8min | 2 | 10 |
| 59-direct-debit-expense-flow | 02 | 5min | 2 | 3 |
| 59-direct-debit-expense-flow | 03 | 4min | 2 | 4 |

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
- [59-01] Extended requiresReceipt with optional paymentMethod param for backward compatibility
- [59-01] Updated mutations.ts and frontend files inline to prevent type errors from schema literal changes (Rule 3)
- [59-02] company_paid guard placed BEFORE status check in approveExpense for helpful error messages
- [59-02] DoA does NOT apply to acknowledge flow -- money already left bank, review not authorization
- [59-02] Self-exclusion applies ONLY to submitted items in approval queue
- [59-03] Receipt required for all company_paid and payment_request expenses regardless of amount
- [59-03] Transaction reference field only shown for company_paid (not payment_request)
- [59-03] MyExpenses expanded to all 10 status tabs so no status is hidden from users

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

Last session: 2026-03-17T00:46:01Z
Stopped at: Completed 59-03-PLAN.md
Resume notes: Plan 59-03 complete. Frontend hooks (useAcknowledgeExpense, useFlagExpense, useMarkAsPaid), ExpenseSubmit form (3-option dropdown, transactionReference, receipt logic), StatusBadge (recorded/paid), MyExpenses (10 tabs) all updated. Ready for Plan 59-04 (approval queue UI).
