# Phase 49: P&L Integration - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md + docs/superpowers/plans/2026-03-12-expense-accounting-system.md)

<domain>
## Phase Boundary

Extend the existing Income Statement page (`/financials`) below Gross Profit to show:
- Operating Expenses breakdown by GL account (6xxx accounts)
- EBIT (Operating Profit) with EBIT margin %
- Other Income/Expense section (7xxx accounts)
- Net Income with net margin %

This phase does NOT build expense submission, approval workflows, reimbursement batching, or expense analytics — those are already built (Phases 42-48) or in separate phases. This phase solely adds OpEx/EBIT/Net Income sections to the income statement by querying journal entry lines.

</domain>

<decisions>
## Implementation Decisions

### Data Source
- OpEx data MUST come from `journalEntryLines` table, aggregated by `accountId` + `entryDate`
- Period filtering MUST use `entryDate` (business date denormalized from `journalEntries.date`), NOT `_creationTime`
- The `by_account_entryDate` index on `journalEntryLines` is the primary query path
- Revenue (4xxx) and COGS (5xxx) continue using existing real-time aggregation — NOT journal entries

### Query Architecture
- OpEx aggregation MUST be inlined into `fetchAndAggregate` in `convex/reports/incomeStatement.ts` — Convex queries cannot call other registered queries
- Use the same pattern: fetch all OpEx accounts (type="opex"), then Promise.all to query `journalEntryLines` per account using `by_account_entryDate` index
- OpEx = debit - credit (expenses increase with debits, which is normal for expense accounts)
- Filter zero-balance accounts from display
- Sort by account code ascending

### Other Income/Expense (7xxx)
- Same query pattern as OpEx but for accounts with type="other"
- Sign convention: debit - credit uniformly
  - 7100 Interest Income: CREDIT normal → negative total = income (good)
  - 7200 Interest Expense: DEBIT normal → positive total = expense (bad)
  - 7900 Other Non-Operating: DEBIT normal → positive total = expense
- Net Income = EBIT - totalOther (where totalOther is sum of debit-credit)

### P&L Layout (below Gross Profit)
- Operating Expenses as collapsible section (like existing Revenue/Deductions/COGS sections)
- Each 6xxx account with non-zero balance shown as indented row with account code + name
- Total Operating Expenses row (bold)
- EBIT (Operating Profit) as bold summary row with top border
- EBIT Margin % row (like existing Gross Margin % row)
- Other Income/Expense as collapsible section (7xxx accounts)
- NET INCOME as bold summary row with top border
- Net Margin % row

### Comparison & Deltas
- Both current and previous period must compute OpEx/EBIT/Other/Net Income
- Delta indicators for Total OpEx, EBIT, Net Income (following existing delta pattern)
- EBIT margin and Net margin show percentage-point deltas (like existing Gross Margin)

### Frontend Components
- Reuse existing `PLRow`, `SectionHeaderRow`, `DeltaIndicator` from `@/lib/financialHelpers` and `@/components/financials/`
- New state: `opexExpanded` and `otherExpanded` collapse toggles (default collapsed)
- No new pages — this extends the existing FinancialStatement.tsx

### CSV Export
- Extend `generateIncomeStatementCSV` in `src/lib/csvExport.ts` to include OpEx, EBIT, Other, Net Income sections

### Claude's Discretion
- Whether to create a standalone `convex/journal/queries.ts` module for `getOpExByPeriod`/`getOtherByPeriod` (for direct UI use) in addition to the inlined version in `fetchAndAggregate`
- Exact CSS styling of new P&L sections (should match existing sections)
- Whether to add tooltips on OpEx/Other section headers
- Test strategy details (unit tests for aggregation, integration tests for full P&L)

</decisions>

<specifics>
## Specific Ideas

### Return Type Extension (from plan Chunk 7, Task 18)
```typescript
// Add to WeekData interface in incomeStatement.ts
opex: Array<{ code: string; name: string; total: number }>;
totalOpEx: number;
ebit: number;
ebitMarginPercent: number | null;
otherItems: Array<{ code: string; name: string; total: number }>;
totalOther: number;
netIncome: number;
netMarginPercent: number | null;
```

### OpEx Query Pattern (from plan)
```typescript
// Inside fetchAndAggregate, after grossProfit computation:
const opexAccounts = await ctx.db
  .query("accounts")
  .withIndex("by_type", (q) => q.eq("type", "opex"))
  .collect();

const opexTotals = await Promise.all(
  opexAccounts.map(async (account) => {
    const lines = await ctx.db
      .query("journalEntryLines")
      .withIndex("by_account_entryDate", (q) =>
        q.eq("accountId", account._id)
          .gte("entryDate", periodStart)
          .lt("entryDate", periodEnd)
      )
      .collect();
    const total = lines.reduce((sum, l) => sum + l.debitAmount - l.creditAmount, 0);
    return { code: account.code, name: account.name, total };
  })
);
```

### P&L Visual Layout (from spec Section 6)
```
= GROSS PROFIT                            (existing)
─────────────────────────────────────────────────────
- Operating Expenses
    6100 Salaries & Wages                 Rp X,XXX,XXX
    6200 Rent & Utilities                 Rp X,XXX,XXX
    ...each 6xxx with non-zero balance...
  TOTAL OPERATING EXPENSES                Rp X,XXX,XXX
= EBIT (Operating Profit)                Rp X,XXX,XXX
  EBIT MARGIN                            XX.X%
- Other Income/Expense (7xxx)
    ...each 7xxx with non-zero balance...
= NET INCOME                              Rp X,XXX,XXX
  NET MARGIN                              XX.X%
```

### Confidence Level
- OpEx confidence is `exact` — all entries come from approved expense claims or admin payroll entries
- No estimation or inference involved

</specifics>

<deferred>
## Deferred Ideas

- Balance Sheet view (query journalEntryLines by account type 1xxx-3xxx) — future milestone
- Cash Flow Statement (query entries touching account 1100) — future milestone
- Monthly budget vs actual comparison — requires new `budgets` table
- Standalone journal entry browser/viewer page
- Manual journal entry posting UI

</deferred>

---

*Phase: 49-pnl-integration*
*Context gathered: 2026-03-14 via PRD Express Path*
