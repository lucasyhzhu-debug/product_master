# Phase 49: P&L Integration - Research

**Researched:** 2026-03-14
**Domain:** Income Statement extension (OpEx, EBIT, Other Income/Expense, Net Income) via journal entry aggregation
**Confidence:** HIGH

## Summary

Phase 49 extends the existing Income Statement page below Gross Profit to show Operating Expenses (6xxx accounts), EBIT, Other Income/Expense (7xxx accounts), and Net Income. All data comes from `journalEntryLines` aggregated by period and grouped by account. The required infrastructure is entirely in place: the `journalEntryLines` table has a `by_entryDate` index (added per staff review recommendation), accounts are seeded with 11 OpEx (6xxx) and 3 Other (7xxx) accounts, and the `fetchAndAggregate` function in `convex/reports/incomeStatement.ts` provides a clean insertion point for the new aggregation logic.

The critical architectural decision is the query pattern for PNL-04. The success criteria mandate a "single indexed query on journalEntryLines by entryDate with in-memory grouping" -- NOT the N+1 per-account pattern from the original plan. The `by_entryDate` index exists specifically for this purpose. The correct approach is: one range query on `by_entryDate` to fetch all journal entry lines in the period, then filter/group by accountId in memory using a preloaded accounts map. This adds exactly 2 DB reads (current + previous period) instead of 28 (14 accounts x 2 periods).

The frontend changes are straightforward: add two new collapsible sections (OpEx and Other) using existing `SectionHeaderRow` and `PLRow` components, plus summary rows for EBIT and Net Income following the existing Gross Profit pattern. CSV export extends with the same line items.

**Primary recommendation:** Use `by_entryDate` index for single-query aggregation in `fetchAndAggregate`, join with preloaded accounts map for grouping, and extend WeekData interface with OpEx/EBIT/Other/NetIncome fields.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- OpEx data MUST come from `journalEntryLines` table, aggregated by `accountId` + `entryDate`
- Period filtering MUST use `entryDate` (business date denormalized from `journalEntries.date`), NOT `_creationTime`
- The `by_account_entryDate` index on `journalEntryLines` is the primary query path (NOTE: research recommends `by_entryDate` instead per PNL-04)
- Revenue (4xxx) and COGS (5xxx) continue using existing real-time aggregation -- NOT journal entries
- OpEx aggregation MUST be inlined into `fetchAndAggregate` in `convex/reports/incomeStatement.ts`
- OpEx = debit - credit (expenses increase with debits)
- Filter zero-balance accounts from display
- Sort by account code ascending
- Other Income/Expense: same pattern as OpEx but for accounts with type="other"
- Sign convention: debit - credit uniformly for Other section
- Net Income = EBIT - totalOther
- Reuse existing `PLRow`, `SectionHeaderRow`, `DeltaIndicator` components
- New state: `opexExpanded` and `otherExpanded` collapse toggles (default collapsed)
- Extend `generateIncomeStatementCSV` for new sections
- Both current and previous period must compute OpEx/EBIT/Other/Net Income

### Claude's Discretion
- Whether to create a standalone `convex/journal/queries.ts` module for `getOpExByPeriod`/`getOtherByPeriod` in addition to the inlined version
- Exact CSS styling of new P&L sections
- Whether to add tooltips on OpEx/Other section headers
- Test strategy details

### Deferred Ideas (OUT OF SCOPE)
- Balance Sheet view (1xxx-3xxx accounts)
- Cash Flow Statement (account 1100)
- Monthly budget vs actual comparison
- Standalone journal entry browser/viewer page
- Manual journal entry posting UI
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PNL-01 | Income statement extends below Gross Profit to show Operating Expenses broken down by GL account (6xxx) | 11 seeded OpEx accounts (6100-6990) exist in accounts table. `by_type` index enables fetching all opex accounts. `fetchAndAggregate` provides insertion point after grossProfit computation. WeekData interface needs extension with `opex` array field. |
| PNL-02 | Income statement shows EBIT = Gross Profit - Total OpEx, with EBIT margin % | Pure arithmetic: `ebit = grossProfit - totalOpEx`, `ebitMarginPercent = netRevenue !== 0 ? (ebit / netRevenue) * 100 : null`. Frontend uses existing `PLRow` with `isBold` and `isTopBorder`. Delta follows existing `grossMarginPp` pattern. |
| PNL-03 | Income statement shows Other Income/Expense (7xxx) and Net Income with net margin % | 3 seeded Other accounts (7100-7900). Same aggregation pattern as OpEx. `netIncome = ebit - totalOther`. Sign convention: debit-credit uniformly (positive=expense, negative=income). |
| PNL-04 | OpEx data sourced from journalEntryLines aggregated by accountId + entryDate using single indexed query (not N+1) | `by_entryDate` index on `journalEntryLines` enables single range query per period. In-memory grouping by accountId after fetch. Preloaded accounts map (type="opex" or "other") for O(1) lookups. Staff review C2 explicitly recommended this approach. |
| PNL-05 | Period filtering uses entryDate (business date), not _creationTime | `journalEntryLines.entryDate` is denormalized from `journalEntries.date` (JE-04). The `by_entryDate` index uses this field. All journal creation goes through `createJournalEntryWithLines` which enforces denormalization. |
</phase_requirements>

## Standard Stack

### Core (existing -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend queries, `by_entryDate` index | Already in use for all income statement queries |
| React | ^19.2.0 | Frontend UI | Existing stack |
| TypeScript | ~5.9 | Type safety | Existing stack |

### Supporting (existing -- no new dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Lucide React | existing | ChevronDown/Right icons for collapsible sections | Already imported in `financialHelpers.tsx` |
| Sonner | existing | Toast for CSV export errors | Already used in FinancialStatement.tsx |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `by_entryDate` single query | `by_account_entryDate` per-account N+1 | N+1 = 14 queries vs 1; `by_entryDate` is correct per PNL-04 and staff review C2 |
| Standalone `convex/journal/queries.ts` | Inline only in `fetchAndAggregate` | Standalone module adds reusability but is not needed for Phase 49 scope. Recommend inline-only (no `convex/journal/` directory exists and the queries are P&L-specific) |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Change Structure
```
convex/reports/incomeStatement.ts   # Extend fetchAndAggregate + WeekData
src/pages/FinancialStatement.tsx    # Add OpEx, EBIT, Other, Net Income sections
src/lib/csvExport.ts                # Extend CSV with new P&L sections
```

### Pattern 1: Single-Query Journal Aggregation (PNL-04 compliant)
**What:** Fetch ALL journal entry lines in a date range using `by_entryDate` index, then filter and group by accountId in memory using a preloaded accounts map.
**When to use:** Whenever aggregating journal data across multiple accounts for a period.
**Why:** Avoids N+1 pattern (1 query instead of 14). The `by_entryDate` index was added specifically for this use case per staff review recommendation.

```typescript
// Inside fetchAndAggregate, after existing Phase 1 parallel fetch:

// Fetch opex + other accounts (small tables, ~14 rows total)
const [opexAccounts, otherAccounts] = await Promise.all([
  ctx.db
    .query("accounts")
    .withIndex("by_type", (q) => q.eq("type", "opex"))
    .collect(),
  ctx.db
    .query("accounts")
    .withIndex("by_type", (q) => q.eq("type", "other"))
    .collect(),
]);

// Build accountId -> account lookup for O(1) grouping
const opexAccountIds = new Set(opexAccounts.map((a) => a._id as string));
const otherAccountIds = new Set(otherAccounts.map((a) => a._id as string));
const accountMap = new Map<string, { code: string; name: string }>();
for (const a of [...opexAccounts, ...otherAccounts]) {
  accountMap.set(a._id as string, { code: a.code, name: a.name });
}

// SINGLE indexed query per period (PNL-04: not N+1)
const [currentJournalLines, previousJournalLines] = await Promise.all([
  ctx.db
    .query("journalEntryLines")
    .withIndex("by_entryDate", (q) =>
      q.gte("entryDate", currentStart).lt("entryDate", currentEnd)
    )
    .collect(),
  ctx.db
    .query("journalEntryLines")
    .withIndex("by_entryDate", (q) =>
      q.gte("entryDate", previousStart).lt("entryDate", previousEnd)
    )
    .collect(),
]);
```

### Pattern 2: In-Memory Grouping After Fetch
**What:** After fetching all journal lines, group by accountId and compute debit-credit totals, filtering to only OpEx or Other accounts.
**When to use:** Immediately after the single-query fetch.

```typescript
// Pure function (no ctx) — can be used inside aggregateWeek or as standalone
function aggregateJournalLines(
  lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>,
  targetAccountIds: Set<string>,
  accountMap: Map<string, { code: string; name: string }>
): Array<{ code: string; name: string; total: number }> {
  const totals = new Map<string, number>();

  for (const line of lines) {
    const key = line.accountId as string;
    if (!targetAccountIds.has(key)) continue;
    const current = totals.get(key) ?? 0;
    totals.set(key, current + line.debitAmount - line.creditAmount);
  }

  const result: Array<{ code: string; name: string; total: number }> = [];
  for (const [accountId, total] of totals) {
    if (total === 0) continue; // Filter zero-balance accounts
    const account = accountMap.get(accountId);
    if (!account) continue;
    result.push({ code: account.code, name: account.name, total });
  }

  // Sort by account code ascending
  return result.sort((a, b) => a.code.localeCompare(b.code));
}
```

### Pattern 3: WeekData Interface Extension
**What:** Non-breaking extension of the existing return type.
**When to use:** Adding new P&L sections to the query response.

```typescript
// Add to WeekData interface (all fields added, none removed)
interface WeekData {
  // ... existing fields ...
  opex: Array<{ code: string; name: string; total: number }>;
  totalOpEx: number;
  ebit: number;
  ebitMarginPercent: number | null;
  otherItems: Array<{ code: string; name: string; total: number }>;
  totalOther: number;
  netIncome: number;
  netMarginPercent: number | null;
}
```

### Pattern 4: Frontend Collapsible Section (reuse existing)
**What:** Use `SectionHeaderRow` + `PLRow` for each new P&L section, matching Revenue/Deductions/COGS pattern.
**When to use:** OpEx section and Other Income/Expense section.

```tsx
// New state variables (alongside existing revenueExpanded, deductionsExpanded, cogsExpanded)
const [opexExpanded, setOpexExpanded] = useState(false);
const [otherExpanded, setOtherExpanded] = useState(false);

// OpEx section (after Gross Profit row)
<SectionHeaderRow
  label="Operating Expenses"
  isExpanded={opexExpanded}
  onToggle={() => setOpexExpanded(!opexExpanded)}
/>
{opexExpanded && data.current.opex.map((item) => (
  <PLRow
    key={item.code}
    label={`${item.code} ${item.name}`}
    currentAmount={item.total}
    previousAmount={/* lookup from previous */}
    delta={/* compute delta */}
    isNegative
    invertColor
    indent={1}
    showComparison={showComparison}
  />
))}
// Total OpEx row (always visible)
<PLRow label="Total Operating Expenses" ... isBold />
// EBIT row
<PLRow label="EBIT (Operating Profit)" ... isBold isTopBorder />
// EBIT Margin % row (same pattern as Gross Margin %)
```

### Anti-Patterns to Avoid
- **N+1 per-account queries:** Do NOT use `Promise.all(accounts.map(a => ctx.db.query("journalEntryLines").withIndex("by_account_entryDate", ...)))`. This violates PNL-04. Use `by_entryDate` single query instead.
- **Calling `aggregateWeek` for OpEx:** `aggregateWeek` is a pure function (no ctx). OpEx aggregation requires ctx for DB access, so it MUST happen in `fetchAndAggregate`, not `aggregateWeek`.
- **Using `_creationTime` for period filtering:** Violates PNL-05. Always use `entryDate` (business date).
- **Creating standalone `convex/journal/queries.ts`:** There is no `convex/journal/` directory. The queries are P&L-specific and belong inlined in `fetchAndAggregate`. A standalone module would create an unused abstraction layer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible P&L sections | Custom expand/collapse UI | `SectionHeaderRow` from `@/lib/financialHelpers` | Already handles chevron icons, styling, tooltip support |
| P&L line item rows | Custom table rows | `PLRow` from `@/components/financials/PLRow` | Handles indent, bold, negative display, comparison columns, delta indicators |
| Delta computation | Manual percentage math | `computeDelta` from `@/lib/financialHelpers` | Already handles zero-denominator, null percent |
| Currency formatting | Manual IDR formatting | `formatCurrency` from `@/lib/utils` | Consistent Rp formatting across app |
| Negative amount display | Manual parentheses | `formatNegative` from `@/lib/financialHelpers` | Accounting convention: (Rp X,XXX) |

## Common Pitfalls

### Pitfall 1: N+1 Query Pattern for Journal Lines
**What goes wrong:** Using `by_account_entryDate` index with Promise.all per account results in 14+ sequential DB reads per period, 28+ total for current+previous.
**Why it happens:** The CONTEXT.md proposes this pattern, but it contradicts PNL-04 success criteria.
**How to avoid:** Use `by_entryDate` index for a single range query, then filter/group by accountId in memory.
**Warning signs:** Code that loops over accounts and issues a DB query per account.

### Pitfall 2: Sign Convention Confusion for Other Income/Expense
**What goes wrong:** Misinterpreting negative totals as errors when they represent income.
**Why it happens:** The 7xxx section has mixed conventions: Interest Income (7100) is CREDIT-normal (debit-credit = negative = income), while Interest Expense (7200) is DEBIT-normal (debit-credit = positive = expense).
**How to avoid:** Apply debit-credit uniformly. Document that negative totals in the Other section represent income (good), positive totals represent expense (bad). Net Income = EBIT - totalOther (where totalOther is the algebraic sum).
**Warning signs:** Filtering out negative balances from the Other section, or displaying absolute values.

### Pitfall 3: Including Reversed Journal Entry Lines
**What goes wrong:** Reversed entries still have lines in `journalEntryLines`. If the original entry and its reversal both fall in the same period, they correctly cancel out. If they fall in different periods, each period is correct on its own.
**Why it happens:** Journal entries are immutable (JE-02). Reversals are separate entries, not deletions.
**How to avoid:** Do NOT filter by `isReversed` on `journalEntries`. The double-entry system is self-correcting: reversed entries have equal and opposite lines that net to zero when both are in the same period. This is correct accounting behavior.
**Warning signs:** Joining `journalEntryLines` back to `journalEntries` to check `isReversed` flag.

### Pitfall 4: Accounts Map Missing Custom Accounts
**What goes wrong:** Only using seeded system accounts, missing user-created custom 6xxx or 7xxx accounts.
**Why it happens:** Hardcoding account codes instead of querying the `accounts` table dynamically.
**How to avoid:** Always query `accounts` by type ("opex" or "other") to get the full list including custom accounts.
**Warning signs:** Account codes hardcoded in the aggregation logic.

### Pitfall 5: Margin Percentage Calculation Base
**What goes wrong:** Using grossProfit as denominator for EBIT margin or Net margin.
**Why it happens:** Confusion about what "margin" means at each P&L level.
**How to avoid:** Both EBIT margin and Net margin use netRevenue as denominator (standard P&L convention): `ebitMarginPercent = ebit / netRevenue * 100`, `netMarginPercent = netIncome / netRevenue * 100`.
**Warning signs:** Using grossProfit or totalGross as denominator for sub-gross-profit margins.

### Pitfall 6: CSV Export Type Interface Drift
**What goes wrong:** The `WeekData` interface in `csvExport.ts` is manually duplicated from the backend. Adding new fields to the backend WeekData without updating the CSV interface causes silent omissions.
**Why it happens:** CSV module intentionally duplicates types to avoid importing server code.
**How to avoid:** When extending `WeekData` in `incomeStatement.ts`, also extend the duplicate `WeekData` in `csvExport.ts` with the same fields.
**Warning signs:** New P&L sections appearing on screen but missing from CSV export.

### Pitfall 7: Delta Computation for Percentage-Point Deltas
**What goes wrong:** Using regular `computeDelta` for margin percentages, which produces "percent change of a percentage."
**Why it happens:** Margins are already percentages, so the delta should be percentage points (pp), not percent change.
**How to avoid:** For margin deltas, compute simple subtraction (`currentMargin - previousMargin`) and display as "pp" using `DeltaIndicator` with `unit="pp"`. Follow existing `grossMarginPp` pattern exactly.
**Warning signs:** EBIT margin delta showing "200%" instead of "5.2pp".

## Code Examples

### Complete fetchAndAggregate Extension Pattern

```typescript
// Source: Analysis of existing incomeStatement.ts + staff review C2 recommendation

// INSIDE fetchAndAggregate, ADD after existing Phase 1 parallel fetch:
// (add to the existing Promise.all or as separate parallel batch)

const [opexAccounts, otherAccounts] = await Promise.all([
  ctx.db.query("accounts").withIndex("by_type", (q) => q.eq("type", "opex")).collect(),
  ctx.db.query("accounts").withIndex("by_type", (q) => q.eq("type", "other")).collect(),
]);

// Build lookup structures
const opexIds = new Set(opexAccounts.map((a) => a._id as string));
const otherIds = new Set(otherAccounts.map((a) => a._id as string));
const accountLookup = new Map<string, { code: string; name: string }>();
for (const a of [...opexAccounts, ...otherAccounts]) {
  accountLookup.set(a._id as string, { code: a.code, name: a.name });
}

// Single indexed query per period (PNL-04)
const [currentJLines, previousJLines] = await Promise.all([
  ctx.db.query("journalEntryLines")
    .withIndex("by_entryDate", (q) => q.gte("entryDate", currentStart).lt("entryDate", currentEnd))
    .collect(),
  ctx.db.query("journalEntryLines")
    .withIndex("by_entryDate", (q) => q.gte("entryDate", previousStart).lt("entryDate", previousEnd))
    .collect(),
]);
```

### Complete aggregateJournalLines Helper

```typescript
// Source: Derived from existing aggregateWeek pattern + staff review recommendation

function aggregateJournalLines(
  lines: Array<{ accountId: any; debitAmount: number; creditAmount: number }>,
  targetIds: Set<string>,
  lookup: Map<string, { code: string; name: string }>
): { items: Array<{ code: string; name: string; total: number }>; total: number } {
  const totals = new Map<string, number>();

  for (const line of lines) {
    const key = line.accountId as string;
    if (!targetIds.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + line.debitAmount - line.creditAmount);
  }

  const items: Array<{ code: string; name: string; total: number }> = [];
  let total = 0;

  for (const [accountId, amount] of totals) {
    if (amount === 0) continue;
    const account = lookup.get(accountId);
    if (!account) continue;
    items.push({ code: account.code, name: account.name, total: amount });
    total += amount;
  }

  items.sort((a, b) => a.code.localeCompare(b.code));
  return { items, total };
}
```

### Frontend OpEx Section (matching existing pattern)

```tsx
// Source: Existing FinancialStatement.tsx Revenue/Deductions/COGS pattern

{/* After Gross Profit + Gross Margin rows */}

{/* -- OPERATING EXPENSES SECTION -- */}
<SectionHeaderRow
  label="Operating Expenses"
  isExpanded={opexExpanded}
  onToggle={() => setOpexExpanded(!opexExpanded)}
/>

{opexExpanded && data.current.opex.map((item) => {
  const prevItem = data.previous.opex.find((p) => p.code === item.code);
  return (
    <PLRow
      key={item.code}
      label={`${item.code} ${item.name}`}
      currentAmount={item.total}
      previousAmount={prevItem?.total ?? 0}
      delta={computeDelta(item.total, prevItem?.total ?? 0)}
      isNegative
      invertColor
      indent={1}
      showComparison={showComparison}
    />
  );
})}

{/* Total Operating Expenses (always visible) */}
<PLRow
  label="Total Operating Expenses"
  currentAmount={data.current.totalOpEx}
  previousAmount={data.previous.totalOpEx}
  delta={opexDeltas?.totalOpEx ?? null}
  isNegative
  invertColor
  isBold
  showComparison={showComparison}
/>

{/* EBIT */}
<PLRow
  label="EBIT (Operating Profit)"
  currentAmount={data.current.ebit}
  previousAmount={data.previous.ebit}
  delta={data.deltas.ebit}
  isBold
  showComparison={showComparison}
  isTopBorder
/>

{/* EBIT Margin % (same pattern as Gross Margin %) */}
<tr className="bg-muted/20">
  <td className="py-2 pl-6 text-sm font-medium text-muted-foreground">EBIT Margin %</td>
  <td className="py-2 text-sm text-right tabular-nums font-medium">
    {data.current.ebitMarginPercent != null
      ? `${data.current.ebitMarginPercent.toFixed(1)}%`
      : "N/A"}
  </td>
  {/* ... previous + delta columns following grossMargin pattern ... */}
</tr>
```

### Deltas Extension in fetchAndAggregate

```typescript
// Source: Existing deltas computation pattern in incomeStatement.ts

// Add to the deltas object:
const deltas = {
  // ... existing deltas ...
  totalOpEx: computeDelta(currentPeriod.totalOpEx, previousPeriod.totalOpEx),
  ebit: computeDelta(currentPeriod.ebit, previousPeriod.ebit),
  ebitMarginPp:
    currentPeriod.ebitMarginPercent !== null && previousPeriod.ebitMarginPercent !== null
      ? currentPeriod.ebitMarginPercent - previousPeriod.ebitMarginPercent
      : null,
  totalOther: computeDelta(currentPeriod.totalOther, previousPeriod.totalOther),
  netIncome: computeDelta(currentPeriod.netIncome, previousPeriod.netIncome),
  netMarginPp:
    currentPeriod.netMarginPercent !== null && previousPeriod.netMarginPercent !== null
      ? currentPeriod.netMarginPercent - previousPeriod.netMarginPercent
      : null,
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N+1 per-account queries (`by_account_entryDate`) | Single query (`by_entryDate`) + in-memory grouping | Staff review 2026-03-12 (C2 recommendation) | 14 queries -> 1 query per period |
| Standalone `getOpExByPeriod` query | Inlined in `fetchAndAggregate` | CONTEXT.md decision | Convex queries cannot call other queries; inline is required |

**Already in place (no changes needed):**
- `by_entryDate` index on `journalEntryLines` (added in Phase 41)
- 11 OpEx accounts (6100-6990) seeded via `accounts:seedDefaults`
- 3 Other accounts (7100-7900) seeded via `accounts:seedDefaults`
- `PLRow`, `SectionHeaderRow`, `DeltaIndicator` components
- `computeDelta` helper function
- `generateIncomeStatementCSV` function (needs extension, not replacement)

## Open Questions

1. **Should OpEx/Other accounts query be added to Phase 1 parallel batch?**
   - What we know: The existing `fetchAndAggregate` Phase 1 does 6 parallel queries. Adding accounts + journal lines queries here would reduce total round-trips.
   - What's unclear: Whether Convex handles 10+ parallel queries in a single Promise.all efficiently.
   - Recommendation: Add accounts queries to Phase 1 batch, but keep journal lines as a separate Phase 2 step (they could also be parallel with Phase 1 since they don't depend on accounts -- the filtering happens in-memory after both complete). Actually, they CAN be parallel: journal lines query doesn't need account IDs (uses `by_entryDate`), and filtering by opex/other account sets happens in memory afterward. So add everything to Phase 1.

2. **Previous-period OpEx line items that don't exist in current period**
   - What we know: The current pattern matches by `item.code` to find previous period equivalents. But a previous period might have entries for an account that the current period doesn't.
   - What's unclear: Whether to show previous-only items in the breakdown when expanded.
   - Recommendation: Only show accounts that appear in either current OR previous period (union). This matches how channel rows handle it. Build a merged set of account codes from both periods for the frontend display.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/convex/incomeStatement.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PNL-01 | OpEx accounts appear in income statement below Gross Profit | integration | `npx vitest run tests/convex/incomeStatement.test.ts -t "opex"` | Wave 0 |
| PNL-02 | EBIT = Gross Profit - Total OpEx, with EBIT margin % | unit + integration | `npx vitest run tests/convex/incomeStatement.test.ts -t "ebit"` | Wave 0 |
| PNL-03 | Other Income/Expense (7xxx) and Net Income with net margin % | integration | `npx vitest run tests/convex/incomeStatement.test.ts -t "other\|net income"` | Wave 0 |
| PNL-04 | Single indexed query pattern (by_entryDate), not N+1 | code review | Manual verification of query pattern in `fetchAndAggregate` | N/A (structural) |
| PNL-05 | Period filtering uses entryDate, not _creationTime | integration | Covered by PNL-01 tests (journal lines use entryDate from by_entryDate index) | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/convex/incomeStatement.test.ts`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add test cases to `tests/convex/incomeStatement.test.ts` for:
  - OpEx aggregation with seeded journal entry lines
  - EBIT computation (grossProfit - totalOpEx)
  - Other Income/Expense with mixed debit/credit normals
  - Net Income computation
  - Zero-balance account filtering
  - Reversed entry cancellation within same period
  - Empty period (no journal lines) returns zero OpEx/EBIT/Other/NetIncome
- [ ] Test helper: `seedJournalEntry` + `seedJournalEntryLine` functions for test data

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` lines 1613-1763 -- Verified accounts and journalEntryLines table definitions, indexes
- `convex/reports/incomeStatement.ts` -- Full read of existing fetchAndAggregate + aggregateWeek architecture
- `convex/accounts/mutations.ts` -- Verified 11 OpEx (6100-6990) and 3 Other (7100-7900) seed accounts
- `convex/lib/journalEngine.ts` -- Verified createJournalEntryWithLines enforces entryDate denormalization (JE-04)
- `src/pages/FinancialStatement.tsx` -- Full read of existing P&L UI structure
- `src/lib/financialHelpers.tsx` -- Verified SectionHeaderRow, PLRow, DeltaIndicator, computeDelta APIs
- `src/lib/csvExport.ts` -- Full read of existing CSV generation structure
- `docs/reviews/staffreview-expense-accounting-plan-2026-03-12.md` -- Staff review C2 recommendation for single-query pattern

### Secondary (MEDIUM confidence)
- `docs/reviews/staffreview-main-2026-03-13.md` -- I4 confirmation that `by_entryDate` index was recommended and added

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, everything exists in codebase
- Architecture: HIGH - Pattern verified against existing code, staff review recommendations, and schema indexes
- Pitfalls: HIGH - Derived from staff review C2, codebase analysis, and existing patterns
- Query pattern (PNL-04): HIGH - `by_entryDate` index confirmed in schema, staff review C2 explicitly recommended this approach

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable domain, no external dependencies)
