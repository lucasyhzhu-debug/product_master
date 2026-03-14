# Phase 50: Expense Analytics - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md)

<domain>
## Phase Boundary

Build the Expense Analytics dashboard (`/expense-analytics`) for managers and admins. This phase delivers:
- OpEx summary metrics (total, by GL category, by employee)
- Monthly spend trend visualization (6-month line chart)
- Pending reimbursement metrics (total outstanding, average approval time)
- Fraud flag detection and display (split detection, approver concentration, unfamiliar vendor)
- All data sourced from existing `journalEntryLines`, `expenses`, and `reimbursementBatches` tables

**Depends on:** Phase 48 (routes/permissions/stub page), Phase 49 (P&L journal integration)

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout & Cards
- Total OpEx card for selected period (sourced from journalEntryLines with opex accounts)
- Spend by GL Category: bar or pie chart using Recharts (already installed)
- Spend by Employee: breakdown showing which employee submitted what amount
- Monthly Trend: 6-month line chart showing OpEx trajectory month-by-month
- Pending Reimbursements: total amount of expenses in "awaiting_payment" status
- Average Approval Time: mean days between submittedAt and approvedAt for approved expenses in period

### Fraud Flag Detection (FRAUD-06, FRAUD-07, FRAUD-08)
- **Split Detection (FRAUD-06):** Same employee + same GL account + multiple expenses within 48hrs summing > Rp 500,000 → alert badge
- **Approver Concentration (FRAUD-07):** Same approver approved >80% of one employee's expenses in rolling 30 days → alert in dashboard
- **Unfamiliar Vendor (FRAUD-08):** Vendor name not seen in system in last 90 days → flag for display

### Access Control
- `canAccessExpenseAnalytics` permission flag — manager, admin only
- Route already exists from Phase 48 (`/expense-analytics`) with stub page
- Permission flag already defined in Phase 48

### Period Selection
- Default to current month
- Allow custom period selection (date range picker)
- Monthly trend always shows 6 trailing months regardless of selected period

### Data Sources
- OpEx totals/breakdowns: `journalEntryLines` joined with `accounts` (type = "opex"), aggregated by entryDate within period
- Employee spend: `expenses` with status in [approved, awaiting_payment, reimbursed], grouped by submittedBy
- Pending reimbursements: `expenses` with status = "awaiting_payment", sum of amounts
- Approval time: expenses with approvedAt - submittedAt delta
- Fraud flags: computed from `expenses` table data (48hr window, vendor history, approver patterns)

### Claude's Discretion
- Specific chart styling and color palette for Recharts
- Card layout arrangement (grid vs. stacked)
- Whether fraud flags are a separate section or inline with cards
- Backend query structure (single query vs. multiple specialized queries)
- Loading states and empty state messaging

</decisions>

<specifics>
## Specific Ideas

### From Spec Section 6 (Expense Analytics Page)
Dashboard cards specified:
1. Total OpEx (period)
2. Spend by Category (bar/pie chart)
3. Spend by Employee
4. Monthly Trend (6-month line chart)
5. Pending Reimbursements total
6. Average Approval Time (days)
7. Active Fraud Flags (split detection, concentration, unfamiliar vendor)
8. Budget vs Actual (placeholder for future budgets feature)

### From Spec Section 5 (Fraud Controls - Should-Have)
- Split detection: Same employee + same GL + multiple expenses within 48hrs summing > Rp 500K
- Approver concentration: Same approver approved >80% of one employee's expenses in rolling 30 days
- Unfamiliar vendor: Vendor name not seen in system in last 90 days

### Charting Library
Recharts is already installed (confirmed in plan doc tech stack). Use for bar/pie charts and line charts.

### Existing Infrastructure
- `aggregateJournalLines()` helper in `convex/reports/incomeStatement.ts` — can reuse pattern for OpEx aggregation
- `protectedQuery` pattern with role-based access from `convex/lib/functions.ts`
- `PageHeader` component used for page title/description
- `ExpenseAnalytics.tsx` stub page exists at `src/pages/ExpenseAnalytics.tsx`

</specifics>

<deferred>
## Deferred Ideas

- Budget vs Actual comparison (requires `budgets` table — future milestone)
- Per-role spend limits with warnings at 80%/100%
- Monthly budget caps per GL category
- OCR receipt extraction for automated comparison

</deferred>

---

*Phase: 50-expense-analytics*
*Context gathered: 2026-03-14 via PRD Express Path*
