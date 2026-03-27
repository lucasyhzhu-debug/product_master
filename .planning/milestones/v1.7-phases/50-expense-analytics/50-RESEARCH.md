# Phase 50: Expense Analytics - Research

**Researched:** 2026-03-14
**Domain:** Expense analytics dashboard with fraud detection
**Confidence:** HIGH

## Summary

Phase 50 builds the Expense Analytics dashboard (`/expense-analytics`) for managers and admins. The infrastructure is mature: the route and permission flag (`canAccessExpenseAnalytics`) already exist from Phase 48, the stub page exists at `src/pages/ExpenseAnalytics.tsx`, Recharts v3.7.0 is installed with working patterns in `SalesChart.tsx`, and the journal/expense data model is fully built from Phases 41-49. The `aggregateJournalLines()` pure helper in `incomeStatement.ts` provides a proven pattern for OpEx aggregation by GL account.

The main engineering work is: (1) backend queries to aggregate OpEx from `journalEntryLines` by period and by GL account/employee, (2) backend queries for fraud detection (split, approver concentration, unfamiliar vendor) computed from the `expenses` table, and (3) frontend dashboard with Recharts bar/pie and line charts plus fraud flag cards.

**Primary recommendation:** Build 2-3 focused Convex queries in a new `convex/expenses/analyticsQueries.ts` file, using `protectedQuery` with `APPROVER_ROLES`. Keep fraud detection as pure helper functions for testability. Frontend should follow the SalesAnalytics pattern: a page component with sub-components for each card/chart section.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Total OpEx card for selected period (sourced from journalEntryLines with opex accounts)
- Spend by GL Category: bar or pie chart using Recharts (already installed)
- Spend by Employee: breakdown showing which employee submitted what amount
- Monthly Trend: 6-month line chart showing OpEx trajectory month-by-month
- Pending Reimbursements: total amount of expenses in "awaiting_payment" status
- Average Approval Time: mean days between submittedAt and approvedAt for approved expenses in period
- Split Detection (FRAUD-06): Same employee + same GL account + multiple expenses within 48hrs summing > Rp 500,000 -> alert badge
- Approver Concentration (FRAUD-07): Same approver approved >80% of one employee's expenses in rolling 30 days -> alert in dashboard
- Unfamiliar Vendor (FRAUD-08): Vendor name not seen in system in last 90 days -> flag for display
- `canAccessExpenseAnalytics` permission flag -- manager, admin only
- Route already exists from Phase 48 (`/expense-analytics`) with stub page
- Default to current month for period selection
- Allow custom period selection (date range picker)
- Monthly trend always shows 6 trailing months regardless of selected period
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

### Deferred Ideas (OUT OF SCOPE)
- Budget vs Actual comparison (requires `budgets` table -- future milestone)
- Per-role spend limits with warnings at 80%/100%
- Monthly budget caps per GL category
- OCR receipt extraction for automated comparison
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| XANL-01 | Manager/Admin can view total OpEx for selected period | `journalEntryLines` by_entryDate index + `accounts` by_type(opex) -- same pattern as income statement Phase 49 |
| XANL-02 | Manager/Admin can view spend breakdown by GL category (bar/pie chart) | `aggregateJournalLines()` helper produces per-account totals; Recharts PieChart/BarChart available |
| XANL-03 | Manager/Admin can view spend breakdown by employee | `expenses` table has `submittedBy` (Id<"users">), query with by_status index then group |
| XANL-04 | Manager/Admin can view monthly spend trend (6-month line chart) | 6 sequential month ranges via `wibMidnightToUtc()`, each queried from journalEntryLines by_entryDate; Recharts LineChart available |
| XANL-05 | Manager/Admin can view pending reimbursement total and average approval time | expenses by_status("awaiting_payment") for pending total; approved expenses with approvedAt - submittedAt for avg time |
| XANL-06 | Manager/Admin can view active fraud flags | Computed from expenses table -- see fraud detection architecture below |
| FRAUD-06 | Split detection: same employee + same GL + multiple expenses within 48hrs summing > Rp 500K | Pure function over recent expenses; no new index needed |
| FRAUD-07 | Approver concentration: same approver approved >80% of one employee's expenses in rolling 30 days | Query approved expenses in 30-day window, group by submittedBy + approvedBy |
| FRAUD-08 | Unfamiliar vendor: vendor name not seen in system in last 90 days | Compare current vendor names against all vendor names in 90-day lookback |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | ^3.7.0 | Bar/Pie/Line charts | Already installed, used in SalesChart.tsx |
| Convex | ^1.31.7 | Backend queries with real-time updates | Project standard |
| React | ^19.2.0 | UI framework | Project standard |
| shadcn/ui | latest | Card, Badge, Skeleton components | Project standard |
| Lucide React | latest | Icons (AlertTriangle, TrendingUp, etc.) | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| convex-helpers | installed | `protectedQuery`, `useSessionQuery` | All protected analytics queries |
| sonner | installed | Toast notifications | Error states |
| date-fns | NOT installed | Date manipulation | DO NOT add -- use existing WIB helpers in `convex/lib/periodRange.ts` and `src/lib/financialHelpers.tsx` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts PieChart | Recharts BarChart (horizontal) | Pie better for category proportion; bar better for many categories. Use both: pie for top-level, bar for details |
| Multiple queries | Single mega-query | Multiple queries allow independent loading states and Convex reactive granularity. Recommended: 3 queries |

**No new packages needed.** Everything is already installed.

## Architecture Patterns

### Recommended Project Structure
```
convex/
  expenses/
    analyticsQueries.ts     # NEW: 3 protectedQuery endpoints for analytics
    fraudHelpers.ts         # NEW: Pure fraud detection functions (no ctx)
src/
  components/
    expenseAnalytics/       # NEW: Component directory
      OpExSummaryCard.tsx   # Total OpEx + GL category breakdown
      SpendByEmployeeCard.tsx
      MonthlyTrendChart.tsx # 6-month line chart
      PendingMetrics.tsx    # Pending reimbursement + avg approval time
      FraudFlagsCard.tsx    # FRAUD-06/07/08 alerts
  hooks/
    convex/
      useExpenseAnalytics.ts # NEW: Hook wrappers for analytics queries
  pages/
    ExpenseAnalytics.tsx    # EXISTS: Replace stub with full dashboard
```

### Pattern 1: Multiple Specialized Queries (Recommended)
**What:** Split analytics into 3 queries instead of one mega-query.
**When to use:** When different data sections have different update frequencies and data sources.
**Why:** Convex reactive queries re-fire on any dependency change. A single mega-query touching expenses + journalEntryLines + accounts + users would re-fire on every expense change. Split queries allow independent loading and reactivity.

**Query 1 -- `getOpExAnalytics`:** OpEx totals + GL category breakdown + 6-month trend
- Source: `journalEntryLines` (by_entryDate) + `accounts` (by_type opex)
- Reuses `aggregateJournalLines()` pattern from income statement
- Returns: `{ totalOpEx, byCategory: [{code, name, total}], trend: [{month, total}] }`

**Query 2 -- `getExpenseMetrics`:** Employee spend + pending reimbursements + avg approval time
- Source: `expenses` table (by_status index for pending, collect for employee grouping)
- Returns: `{ byEmployee: [{userId, name, total}], pendingTotal, avgApprovalDays }`

**Query 3 -- `getFraudFlags`:** Split detection + approver concentration + unfamiliar vendor
- Source: `expenses` table (recent approved/submitted expenses)
- Returns: `{ splits: [...], concentrations: [...], unfamiliarVendors: [...] }`

### Pattern 2: Pure Fraud Detection Helpers
**What:** Extract fraud detection logic as pure functions (no ctx) in `fraudHelpers.ts`.
**When to use:** All fraud detection computations.
**Why:** Testable without Convex runtime, follows existing `helpers.ts` pattern.

```typescript
// convex/expenses/fraudHelpers.ts

interface ExpenseForFraud {
  _id: string;
  submittedBy: string;
  accountId: string;
  amount: number;
  expenseDate: number;
  approvedBy?: string;
  approvedAt?: number;
  vendorName: string;
  status: string;
}

// FRAUD-06: Split detection
export function detectSplits(
  expenses: ExpenseForFraud[]
): Array<{ employeeId: string; accountId: string; expenses: string[]; total: number }>;

// FRAUD-07: Approver concentration
export function detectApproverConcentration(
  expenses: ExpenseForFraud[]
): Array<{ employeeId: string; approverId: string; percent: number; count: number }>;

// FRAUD-08: Unfamiliar vendor
export function detectUnfamiliarVendors(
  recentVendors: string[],
  historicalVendors: Set<string>
): string[];
```

### Pattern 3: Period Selection Component
**What:** Reuse month-based period selection from `useFinancials.ts`.
**When to use:** For the period picker on the analytics dashboard.
**Why:** WIB timezone handling and month navigation already implemented in `useFinancials` hook. The expense analytics page needs month + custom mode (no weekly). Extract the relevant parts.

### Pattern 4: Recharts Usage
**What:** Follow `SalesChart.tsx` patterns for chart rendering.
**When to use:** All chart components.
**Example:**
```typescript
// Pie chart for GL category breakdown
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from "recharts";

// Color palette for GL categories
const GL_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];
```

### Anti-Patterns to Avoid
- **Single mega-query:** Don't fetch all analytics data in one query. Convex re-fires on any dependency change, causing unnecessary re-renders.
- **N+1 user lookups:** When joining employee names, batch-fetch all users upfront (like `listPendingForApproval` does), don't fetch inside a loop.
- **Client-side period computation:** Use `wibMidnightToUtc()` from `periodRange.ts` for all WIB-aware date boundaries. Do NOT use `new Date()` with local timezone assumptions.
- **Scan-all for fraud:** Don't `.collect()` all expenses ever created. Use time-bounded queries: 48hr window for splits, 30-day for concentration, 90-day for vendors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpEx aggregation by GL | Custom grouping loop | `aggregateJournalLines()` from `incomeStatement.ts` | Already handles near-zero filtering, sorting, and total computation |
| WIB date boundaries | Custom timezone math | `wibMidnightToUtc()` from `convex/lib/periodRange.ts` | Canonical WIB implementation, tested |
| Session auth on queries | Custom auth middleware | `protectedQuery` from `convex/lib/functions.ts` | Standard pattern, auto-injects `ctx.user` |
| Frontend query hooks | Raw `useQuery` calls | `useSessionQuery` from `convex-helpers/react/sessions` | Auto-injects sessionId for protected queries |
| Chart responsive container | Custom resize observer | `<ResponsiveContainer>` from Recharts | Standard responsive wrapper |
| Loading states | Custom skeleton logic | `<Skeleton>` from shadcn/ui | Already used across project |
| Currency formatting | `toLocaleString()` | `formatCurrency()` from `src/lib/utils.ts` | Project standard, IDR formatting |

**Key insight:** The income statement (Phase 49) already solved OpEx aggregation. The expense analytics dashboard is essentially a different view of the same data plus fraud detection on the `expenses` table.

## Common Pitfalls

### Pitfall 1: WIB vs UTC Confusion for Month Boundaries
**What goes wrong:** Using `new Date(year, month, 1)` gives UTC midnight, not WIB midnight. A journal entry with `entryDate` at WIB March 1 00:00 = UTC Feb 28 17:00 would be excluded.
**Why it happens:** JavaScript `Date` constructors use local timezone or UTC, not WIB.
**How to avoid:** Always use `wibMidnightToUtc(year, month, day)` from `periodRange.ts` for date boundaries. This converts WIB midnight to correct UTC epoch ms.
**Warning signs:** Off-by-one-day errors in monthly aggregation, especially around month boundaries.

### Pitfall 2: Expense Status Filtering for Employee Spend
**What goes wrong:** Including draft or voided expenses in employee spend totals.
**Why it happens:** Not filtering by status when aggregating.
**How to avoid:** Employee spend must only include statuses that represent real spending: `["approved", "awaiting_payment", "reimbursed"]`. Exclude `draft`, `submitted`, `rejected`, `voided`.
**Warning signs:** Total by employee doesn't match total OpEx from journal lines.

### Pitfall 3: Journal Lines vs Expenses for OpEx Total
**What goes wrong:** Computing OpEx from expenses table amounts instead of journalEntryLines.
**Why it happens:** Seems simpler to sum `expenses.amount` than aggregate journal lines.
**How to avoid:** Use `journalEntryLines` for financial totals (source of truth, double-entry verified). Use `expenses` table for operational metrics (employee breakdown, approval time, fraud detection). Voided expenses have reversing journal entries that cancel out in journalEntryLines -- if you sum expenses.amount, you'd double-count voided items.
**Warning signs:** OpEx total mismatch between analytics dashboard and income statement.

### Pitfall 4: Fraud Detection Performance
**What goes wrong:** Scanning all historical expenses for fraud detection.
**Why it happens:** Not time-bounding the fraud queries.
**How to avoid:** Each fraud check has a defined window: splits = 48hrs, concentration = 30 days, vendor = 90 days. Compute time bounds upfront and only query expenses within those windows.
**Warning signs:** Slow query times as expense count grows.

### Pitfall 5: 6-Month Trend Must Be Independent of Period Selection
**What goes wrong:** Monthly trend chart changes when user selects a custom period.
**Why it happens:** Using the period selector dates for trend computation.
**How to avoid:** Monthly trend always computes 6 trailing months from "now" (current WIB month backward). The period selector only affects the summary cards, not the trend chart.
**Warning signs:** Trend chart showing different data depending on period selection.

### Pitfall 6: Missing Index for Fraud Queries
**What goes wrong:** Full table scan on expenses for fraud detection.
**Why it happens:** No index on `expenseDate` or `approvedAt`.
**How to avoid:** The `by_status` index can filter to relevant statuses first, then client-side filter by date window. For a small company (5-10 users), this is acceptable. If expense volume grows, add `by_expenseDate` index later.
**Warning signs:** Not a concern at current scale (< 1000 expenses expected).

## Code Examples

### Backend: OpEx Analytics Query
```typescript
// convex/expenses/analyticsQueries.ts
import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";
import { APPROVER_ROLES } from "./constants";
import { wibMidnightToUtc, getWibComponents } from "../lib/periodRange";

export const getOpExAnalytics = protectedQuery({
  roles: [...APPROVER_ROLES],
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch opex accounts
    const opexAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_type", (q) => q.eq("type", "opex"))
      .collect();
    const opexIds = new Set(opexAccounts.map((a) => a._id as string));
    const accountLookup = new Map(
      opexAccounts.map((a) => [a._id as string, { code: a.code, name: a.name }])
    );

    // Fetch journal lines for period
    const lines = await ctx.db
      .query("journalEntryLines")
      .withIndex("by_entryDate", (q) =>
        q.gte("entryDate", args.periodStart).lt("entryDate", args.periodEnd)
      )
      .collect();

    // Aggregate using same logic as income statement
    // (inline or import aggregateJournalLines if exported)
    const totals = new Map<string, number>();
    for (const line of lines) {
      const key = line.accountId as string;
      if (!opexIds.has(key)) continue;
      totals.set(key, (totals.get(key) ?? 0) + line.debitAmount - line.creditAmount);
    }

    let totalOpEx = 0;
    for (const amount of totals.values()) totalOpEx += amount;

    const byCategory = [];
    for (const [accountId, amount] of totals) {
      if (Math.abs(amount) < 0.01) continue;
      const acct = accountLookup.get(accountId);
      if (acct) byCategory.push({ code: acct.code, name: acct.name, total: amount });
    }
    byCategory.sort((a, b) => b.total - a.total);

    // 6-month trend (always trailing from current month)
    const now = Date.now();
    const { year, month } = getWibComponents(now);
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const m = month - i;
      const mStart = wibMidnightToUtc(year, m, 1);
      const mEnd = wibMidnightToUtc(year, m + 1, 1);
      // Fetch lines for this month
      const monthLines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_entryDate", (q) =>
          q.gte("entryDate", mStart).lt("entryDate", mEnd)
        )
        .collect();
      let monthTotal = 0;
      for (const line of monthLines) {
        if (opexIds.has(line.accountId as string)) {
          monthTotal += line.debitAmount - line.creditAmount;
        }
      }
      // Label: "Jan", "Feb", etc.
      const labelDate = new Date(mStart + 7 * 60 * 60 * 1000); // WIB
      const label = labelDate.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      trend.push({ month: label, total: monthTotal });
    }

    return { totalOpEx, byCategory, trend };
  },
});
```

**Note:** The 6-month trend queries 6 sequential months. This is 6 indexed range scans -- acceptable for Convex. If performance becomes a concern, batch into a single wider query and group client-side.

### Backend: Fraud Detection Pure Helpers
```typescript
// convex/expenses/fraudHelpers.ts
const MS_48_HOURS = 48 * 60 * 60 * 1000;
const SPLIT_THRESHOLD = 500_000; // Rp 500K

interface ExpenseForFraud {
  _id: string;
  submittedBy: string;
  accountId: string;
  amount: number;
  expenseDate: number;
  approvedBy?: string;
  approvedAt?: number;
  vendorName: string;
  status: string;
}

export interface SplitFlag {
  employeeId: string;
  accountId: string;
  expenseIds: string[];
  totalAmount: number;
}

export function detectSplits(expenses: ExpenseForFraud[]): SplitFlag[] {
  // Group by (submittedBy, accountId)
  const groups = new Map<string, ExpenseForFraud[]>();
  for (const e of expenses) {
    const key = `${e.submittedBy}::${e.accountId}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const flags: SplitFlag[] = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Sort by date, find clusters within 48hr windows
    group.sort((a, b) => a.expenseDate - b.expenseDate);
    // Sliding window approach
    for (let i = 0; i < group.length; i++) {
      const cluster = [group[i]];
      let total = group[i].amount;
      for (let j = i + 1; j < group.length; j++) {
        if (group[j].expenseDate - group[i].expenseDate <= MS_48_HOURS) {
          cluster.push(group[j]);
          total += group[j].amount;
        } else break;
      }
      if (cluster.length >= 2 && total > SPLIT_THRESHOLD) {
        flags.push({
          employeeId: group[i].submittedBy,
          accountId: group[i].accountId,
          expenseIds: cluster.map((e) => e._id),
          totalAmount: total,
        });
      }
    }
  }
  return flags;
}
```

### Frontend: Pie Chart for GL Category
```typescript
// Recharts PieChart pattern (verified: PieChart, Pie, Cell exported from recharts 3.7.0)
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const GL_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

function CategoryPieChart({ data }: { data: Array<{ name: string; total: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
          {data.map((_, index) => (
            <Cell key={index} fill={GL_COLORS[index % GL_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### Frontend: Session Query Hook Pattern
```typescript
// src/hooks/convex/useExpenseAnalytics.ts
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";

export function useOpExAnalytics(periodStart: number, periodEnd: number) {
  return useSessionQuery(api.expenses.analyticsQueries.getOpExAnalytics, {
    periodStart,
    periodEnd,
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `useQuery` + manual token | `useSessionQuery` from convex-helpers | Phase 44 | All protected queries MUST use `useSessionQuery` |
| Single query for all analytics | Multiple specialized queries | Phase 49 pattern | Better reactivity, independent loading |
| `ctx.db.query().filter()` | `.withIndex()` range bounds | Phase 35 audit | Index-first querying is mandatory |
| `productionType` on expenses | `accountId` (GL account) | Phase 41-44 | Expense GL categorization uses `accounts` table |

**Deprecated/outdated:**
- Do NOT use raw `useQuery` for protected endpoints. Use `useSessionQuery`.
- Do NOT use `token: v.string()` arg pattern. Use `protectedQuery` wrapper.
- Do NOT compute WIB dates with manual UTC offset math. Use `wibMidnightToUtc()`.

## Open Questions

1. **Should `aggregateJournalLines()` be extracted from `incomeStatement.ts`?**
   - What we know: The function is currently module-private (not exported) in `incomeStatement.ts`.
   - What's unclear: Whether to duplicate the logic in `analyticsQueries.ts` or export it.
   - Recommendation: **Export it from a shared location** (e.g., move to `convex/lib/journalAggregation.ts`). The logic is identical -- deduplication is worth the extraction. Alternatively, inline a simplified version since the analytics query only needs opex accounts, not the full near-zero filtering.

2. **6-month trend: 6 sequential queries or single wide query?**
   - What we know: 6 indexed range scans is ~6x the read cost of one wide scan.
   - What's unclear: Whether Convex rate limits per-query or per-function.
   - Recommendation: **Use a single wide query** spanning the full 6-month window, then bucket client-side by month using `getWibComponents()`. This is more efficient and follows the Phase 49 single-query pattern (PNL-04).

3. **Fraud detection: query scope for vendor history (FRAUD-08)?**
   - What we know: Need to compare current vendors against "vendors seen in last 90 days."
   - What's unclear: Whether "in system" means all-time or 90-day window.
   - Recommendation: Per spec, "not seen in last 90 days" means the vendor name does not appear in any expense created in the past 90 days. Query expenses from 90 days ago to now, extract unique vendor names, flag any vendor in the current period not in that set.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XANL-01 | Total OpEx for period | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "total opex" -x` | No -- Wave 0 |
| XANL-02 | Spend by GL category | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "by category" -x` | No -- Wave 0 |
| XANL-04 | Monthly trend (6-month) | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "trend" -x` | No -- Wave 0 |
| XANL-05 | Pending + avg approval time | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "metrics" -x` | No -- Wave 0 |
| FRAUD-06 | Split detection | unit | `npx vitest run convex/expenses/__tests__/fraudHelpers.test.ts -t "split" -x` | No -- Wave 0 |
| FRAUD-07 | Approver concentration | unit | `npx vitest run convex/expenses/__tests__/fraudHelpers.test.ts -t "concentration" -x` | No -- Wave 0 |
| FRAUD-08 | Unfamiliar vendor | unit | `npx vitest run convex/expenses/__tests__/fraudHelpers.test.ts -t "unfamiliar" -x` | No -- Wave 0 |
| XANL-03 | Spend by employee | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "by employee" -x` | No -- Wave 0 |
| XANL-06 | Fraud flags display | manual-only | Visual check that fraud flags render in dashboard | N/A |

### Sampling Rate
- **Per task commit:** `npm run test -- --run`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green + build clean before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `convex/expenses/__tests__/fraudHelpers.test.ts` -- covers FRAUD-06, FRAUD-07, FRAUD-08 (pure functions, no ctx)
- [ ] `tests/convex/expenseAnalytics.test.ts` -- covers XANL-01 through XANL-05 (convex-test integration)
- [ ] No framework install needed -- Vitest + convex-test already configured

## Sources

### Primary (HIGH confidence)
- `convex/reports/incomeStatement.ts` -- `aggregateJournalLines()` function, journal line aggregation pattern
- `convex/schema.ts` lines 1635-1680 -- expenses table schema with all indexes
- `convex/schema.ts` lines 1753-1763 -- journalEntryLines table with by_entryDate index
- `convex/lib/periodRange.ts` -- `wibMidnightToUtc()`, `getWibComponents()`, month range helpers
- `convex/lib/functions.ts` -- `protectedQuery` wrapper with role-based access
- `convex/expenses/queries.ts` -- existing expense query patterns (listPendingForApproval joins users)
- `convex/expenses/helpers.ts` -- pure fraud helper pattern (existing FRAUD-01 through FRAUD-05)
- `src/components/salesAnalytics/SalesChart.tsx` -- Recharts BarChart + AreaChart usage pattern
- `src/hooks/convex/useExpenses.ts` -- `useSessionQuery` pattern for protected queries
- `src/lib/types.ts` -- `ROLE_PERMISSIONS` with `canAccessExpenseAnalytics` for manager + admin
- `src/pages/ExpenseAnalytics.tsx` -- existing stub page (15 lines)
- `package.json` -- Recharts ^3.7.0 confirmed installed
- Verified via Node.js: `recharts` exports LineChart, PieChart, Cell, Line, Pie

### Secondary (MEDIUM confidence)
- `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md` Section 5-6 -- fraud controls and analytics spec
- `50-CONTEXT.md` -- user decisions and deferred items

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in project
- Architecture: HIGH -- patterns directly reuse existing income statement and sales analytics approaches
- Pitfalls: HIGH -- identified from real project history (WIB timezone issues, journal vs expense mismatch)
- Fraud detection: HIGH -- spec requirements are precise with exact thresholds

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable domain, no external API dependencies)
