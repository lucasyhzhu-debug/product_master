---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: completed
stopped_at: Completed 61-02-PLAN.md
last_updated: "2026-03-17T17:57:25.838Z"
last_activity: 2026-03-17 - Phase 61 plan 02 complete (phase complete)
progress:
  total_phases: 24
  completed_phases: 22
  total_plans: 52
  completed_plans: 50
---

---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Expense & Accounting
status: Phase 61 complete -- help file indexing architecture with docs-manifest, validation, section files, and 2 GSD skills
stopped_at: Completed 61-02-PLAN.md
last_updated: "2026-03-17T17:26:09.000Z"
last_activity: 2026-03-17 - Phase 61 plan 02 complete (phase complete)
progress:
  total_phases: 24
  completed_phases: 22
  total_plans: 50
  completed_plans: 50
  percent: 100
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-03-16)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.7 Expense & Accounting — Phase 61 complete (2/2 plans), all phases complete

## Current Position

Phase: 61-help-file-indexing-architecture (2/2 plans)
Plan: 02 complete (phase complete)
Status: Phase 61 complete -- help file indexing architecture with docs-manifest, validation, section files, and 2 GSD skills
Last activity: 2026-03-17 - Phase 61 plan 02 complete (phase complete)

Progress: [██████████] 100%

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
| 57-invoice-backend-business-settings | 02 | 5min | 3 | 11 |
| 59-direct-debit-expense-flow | 01 | 8min | 2 | 10 |
| 59-direct-debit-expense-flow | 02 | 5min | 2 | 3 |
| 59-direct-debit-expense-flow | 03 | 4min | 2 | 4 |
| 59-direct-debit-expense-flow | 04 | 6min | 2 | 4 |
| 58-invoice-form-print-view-order-integration | 01 | 8min | 2 | 6 |
| 58-invoice-form-print-view-order-integration | 02 | 6min | 2 | 5 |
| 63-interactive-visual-expense-tutorials | 01 | 8min | 2 | 6 |
| 63-interactive-visual-expense-tutorials | 02 | 16min | 2 | 14 |
| 61-help-file-indexing-architecture | 01 | 11min | 2 | 10 |
| 61-help-file-indexing-architecture | 02 | 4min | 2 | 2 |

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
- [57-02] Empty successMessage on createDraft/updateDraft hooks (auto-save feedback deferred to Phase 58 UI)
- [57-02] Live invoice header preview reads from local form state (no API call per keystroke)
- [57-02] Logo upload validates 1MB max client-side before POST to Convex upload URL
- [59-01] Extended requiresReceipt with optional paymentMethod param for backward compatibility
- [59-01] Updated mutations.ts and frontend files inline to prevent type errors from schema literal changes (Rule 3)
- [59-02] company_paid guard placed BEFORE status check in approveExpense for helpful error messages
- [59-02] DoA does NOT apply to acknowledge flow -- money already left bank, review not authorization
- [59-02] Self-exclusion applies ONLY to submitted items in approval queue
- [59-03] Receipt required for all company_paid and payment_request expenses regardless of amount
- [59-03] Transaction reference field only shown for company_paid (not payment_request)
- [59-03] MyExpenses expanded to all 10 status tabs so no status is hidden from users
- [59-04] DoA comment threshold reused for acknowledge dialog visibility only, not authorization
- [59-04] Mark as Paid uses Input (not Textarea) for transaction reference -- short reference number
- [59-04] No redundant .catch() on markAsPaid -- createMutationHook handles errors via toast
- [58-01] InvoicePrintData uses Pick<Doc<"invoices">> & { sellerLogoUrl } since query enriches storage ID to URL
- [58-01] Invoice field tokens defined as CSS custom properties in :root (light-mode only, print-oriented)
- [58-01] Brand bar uses h-1 (4px) with print-color-adjust: exact for print fidelity
- [58-02] Used useDocumentTitle hook (existing project convention) instead of raw useEffect for browser tab title
- [58-02] Extracted useAutoSave as testable hook with scheduleChange/markInitialized API, tested via renderHook
- [58-02] toInvoicePrintData adapter function converts Invoice to InvoicePrintData (Pick<Doc> type) to bridge query layer and print view
- [58-02] Save status "Saving..." fires inside setTimeout callback, not on keypress -- confirmed by test 5
- [63-01] Mock framer-motion in JSDOM tests to avoid AnimatePresence exit animation blocking
- [63-01] Mobile step pills rendered before desktop sidebar for JSDOM test accessibility
- [63-01] Breadcrumb derived from workflow.getBreadcrumb(step) keeping player fully generic
- [63-02] Workflow data owns breadcrumb logic via getBreadcrumb (expense knowledge stays in ExpenseGuide, not player)
- [63-02] Old deep link anchors preserved as sr-only hidden divs for backward compatibility
- [63-02] readTimeMinutes reduced 15->10 to reflect faster interactive format
- [63-02] Walkthrough section has no role field (visible to all users)
- [Phase 61]: Adapted plan from 8 to 6 section files -- Phase 63 merged submitting/approving/reimbursement into walkthrough
- [Phase 61-02]: Both GSD skills use single quotes for commit messages containing # (guide#section format)

### Roadmap Evolution

- Phase 59 added: Direct debit expense flow — company-paid transactions with different journal entries and no reimbursement
- Phase 60 added: Asset Register & Depreciation — Fixed asset tracking with auto-calculated monthly straight-line depreciation and one-click JE generation
- Phase 61 added: Help File Indexing Architecture — Automatic discovery, content indexing, refresh triggers on doc/feature changes, and search interface for help content
- Phase 59.1 inserted after Phase 59: Company payment request flow — prospective vendor payments requiring approval before bank transfer execution (URGENT)
- Phase 62 added: Manual Journal Entry Page — Template-based balance sheet transaction recording with 6 pre-wired templates
- Phase 63 added: Interactive Visual Expense Tutorials — click-through walkthroughs with mock UI panels replacing text-only guides

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

Last session: 2026-03-17T17:26:09.000Z
Stopped at: Completed 61-02-PLAN.md
Resume notes: Phase 61 (Help File Indexing Architecture) is fully complete (2/2 plans). All v1.7 phases done. Next step: merge branch to main or complete milestone.
