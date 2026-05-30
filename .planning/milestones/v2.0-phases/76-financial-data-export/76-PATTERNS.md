# Phase 76: Financial Data Export — Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 10 (5 NEW, 5 MODIFY)
**Analogs found:** 10 / 10 (all in-repo, all VERIFIED by direct read)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `convex/reports/financialExport.ts` (NEW) | backend query module (Convex) | request-response (read-only) | `convex/reports/incomeStatement.ts` | exact (same dir, same query shape, same auth pattern) |
| `convex/reports/incomeStatement.ts` (MODIFY) | backend query module | request-response | self — refactor in place | exact |
| `src/pages/FinancialExportPage.tsx` (NEW) | page (form-driven, role-gated) | request-response | `src/pages/BankReconciliationPage.tsx` | role-match (form + preflight + sonner toasts + Loader2) |
| `src/lib/financialExportHelpers.ts` (NEW) | pure utility (CSV builders + bucket math) | transform | `src/lib/staffPerformanceExport.ts` | role-match (CSV builder + downloadCSV caller) |
| `src/lib/csvExport.ts` (MODIFY) | pure utility (CSV serialization) | transform | self — refactor in place | exact |
| `src/pages/FinancialStatement.tsx` (MODIFY) | page (P&L viewer) | request-response | self — add header action button | exact |
| `src/App.tsx` (MODIFY) | route declaration | config | self — add `/financials/export` route | exact |
| `convex/reports/__tests__/financialExport.test.ts` (NEW) | test (convex-test integration) | test | `convex/reports/__tests__/incomeStatement-capex.test.ts` | exact (same dir, same convex-test scaffolding) |
| `src/lib/__tests__/financialExportHelpers.test.ts` (NEW) | test (Vitest unit) | test | (no existing helper test for csvExport.ts; pattern lifted from `incomeStatement-capex.test.ts` shape + helper-only assertions) | role-match |
| `src/pages/__tests__/FinancialExportPage.test.tsx` (NEW) | test (RTL component) | test | (no exact analog — closest is generic Vitest config); follow ProtectedRoute + form RTL conventions | partial |
| `tests/e2e/financial-data-export.spec.ts` (NEW) | test (Playwright E2E) | test | `tests/e2e/income-statement-uat.spec.ts` | exact (same `loginAsManager` helper, same nav pattern) |

---

## Schema Name Corrections (load-bearing — RESEARCH §"Schema name corrections")

CONTEXT.md drifts from current schema. **Plans/executor MUST use the actual names below**, not the names in CONTEXT.md D-01:

| CONTEXT.md says | Actual schema | Source |
|-----------------|---------------|--------|
| `journalEntries.entryType` | `journalEntries.sourceType` | `convex/schema.ts:1948` |
| `journalEntries.entryDate` | `journalEntries.date` | `convex/schema.ts:1946` |
| `journalEntries.sourceDocType` | `journalEntries.sourceType` (same field — there is no separate doc-type field) | `convex/schema.ts:1948` |
| `journalEntries.sourceDocId` | `journalEntries.sourceId` (`v.optional(v.string())`) | `convex/schema.ts:1962` |
| `journalEntries.reversalOfEntryId` | `journalEntries.reversedByEntryId` (forward link only) | `convex/schema.ts:1964` |
| `journalEntryLines.entryId` | `journalEntryLines.journalEntryId` | `convex/schema.ts:1980` |
| `journalEntryLines.debit` / `credit` | `journalEntryLines.debitAmount` / `creditAmount` | `convex/schema.ts:1983-1984` |
| `glAccounts` table | `accounts` table | `convex/schema.ts:1809` |

`sourceType` is the literal union: `expense_approval | expense_void | reimbursement | reimbursement_void | payroll | payroll_void | manual | depreciation | depreciation_void | asset_acquisition | bank_statement | bank_statement_reversal`. There is **no `consignmentSettlement` literal** — consignment doesn't post to `journalEntries`. Reversal detection: `sourceType` ends in `_void` / `_reversal`, or parent JE's `isReversed === true`.

---

## Pattern Assignments

### `convex/reports/financialExport.ts` (NEW — backend query, request-response)

**Analog:** `convex/reports/incomeStatement.ts`

**Imports pattern** (clone from `incomeStatement.ts:11-25`):
```typescript
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireRole } from "../lib/auth";
import { fetchAndAggregate } from "./incomeStatement";  // requires re-export — see modify section below
```

**Auth pattern (D-13)** — clone from `convex/lib/auth.ts:128-148`. Apply at top of every handler:
```typescript
handler: async (ctx, args) => {
  await requireRole(ctx, args.token, ["manager", "admin"]);
  // ... query body
}
```
Args MUST include `token: v.string()` per CLAUDE.md Pitfall #10.

**Core pattern A — Range scan + batch enrichment (D-03)** — clone from `incomeStatement.ts:643-647` (verified pattern, same indexes):
```typescript
const lines = await ctx.db
  .query("journalEntryLines")
  .withIndex("by_entryDate", (q) =>
    q.gte("entryDate", periodStart).lt("entryDate", periodEnd))
  .collect();

// Set-dedupe IDs to avoid N+1
const uniqueJeIds = [...new Set(lines.map((l) => l.journalEntryId as string))];
const uniqueAccountIds = [...new Set(lines.map((l) => l.accountId as string))];

const [jes, accounts] = await Promise.all([
  Promise.all(uniqueJeIds.map((id) => ctx.db.get(id as Id<"journalEntries">))),
  Promise.all(uniqueAccountIds.map((id) => ctx.db.get(id as Id<"accounts">))),
]);

const uniqueUserIds = [...new Set(jes.filter(Boolean).map((j) => j!.createdBy as string))];
const users = await Promise.all(
  uniqueUserIds.map((id) => ctx.db.get(id as Id<"users">))
);
```

**Sort key (D-02)** — `entryDate ASC, entryNumber ASC, _creationTime ASC` with fallback to credit-after-debit:
```typescript
rows.sort((a, b) =>
  a.entryDate - b.entryDate ||
  a.entryNumber.localeCompare(b.entryNumber) ||
  a._creationTime - b._creationTime ||
  (a.creditAmount === 0 ? 0 : 1) - (b.creditAmount === 0 ? 0 : 1)
);
```

**Core pattern B — Multi-period P&L loop (D-07)** — reuse extracted `fetchAndAggregate`; iterate buckets; track in-range previous (NOT equal-length lookback):
```typescript
export const getMultiPeriodPLExport = query({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    granularity: v.union(v.literal("weekly"), v.literal("monthly"), v.literal("custom")),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const buckets = buildPeriodBuckets(args.periodStart, args.periodEnd, args.granularity);
    const periods = [];
    for (const [s, e] of buckets) {
      // Pass includePrevious: false — D-05 wants in-range delta, not equal-length lookback
      const result = await fetchAndAggregate(ctx, s, e, s, s, /* includePrevious */ false);
      periods.push({ start: s, end: e, current: result.currentPeriod, label: formatBucketLabel(s, e, args.granularity) });
    }
    return { periods, rangeGap: aggregateRangeGap(periods) };
  },
});
```

**Pre-flight pattern (D-12, D-16)** — parallel `.collect().length` on indexed ranges:
```typescript
export const getExportPreflight = query({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    granularity: v.union(v.literal("weekly"), v.literal("monthly"), v.literal("custom")),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const [jeLines, revenueRows] = await Promise.all([
      ctx.db.query("journalEntryLines")
        .withIndex("by_entryDate", q => q.gte("entryDate", args.periodStart).lt("entryDate", args.periodEnd))
        .collect(),
      ctx.db.query("externalRevenue")
        .withIndex("by_period", q => q.gte("periodStart", args.periodStart).lt("periodStart", args.periodEnd))
        .collect(),
    ]);
    const buckets = buildPeriodBuckets(args.periodStart, args.periodEnd, args.granularity);
    return {
      journalLineCount: jeLines.length,
      revenueRowCount: revenueRows.length,
      periodCount: buckets.length,
      isLargeRange: jeLines.length > 10_000,
    };
  },
});
```

**Error handling** — `requireRole` throws `Error("Not authenticated" | "Account is deactivated" | "Not authorized")`. Convex wraps this for the client. No `try/catch` needed inside handler. Frontend humanizes via existing pattern (see `BankReconciliationPage.tsx:91-96` `humanizeError`).

**Validation (V5)** — every arg uses Convex `v.*` validators (`v.number()`, `v.union(v.literal(...))`, `v.string()`). No manual validation needed.

---

### `convex/reports/incomeStatement.ts` (MODIFY — backend, in-place refactor)

**Analog:** self.

**Change 1 — Re-export `fetchAndAggregate` (line 575).** Add `export` keyword to the function signature so `financialExport.ts` can import it:
```typescript
// BEFORE (line 575):
async function fetchAndAggregate(
  ctx: QueryCtx,
  currentStart: number,
  ...
)

// AFTER:
export async function fetchAndAggregate(
  ctx: QueryCtx,
  currentStart: number,
  currentEnd: number,
  previousStart: number,
  previousEnd: number,
  includePrevious: boolean = true  // NEW — default true preserves existing behavior
)
```

**Change 2 — Add `includePrevious` opt-out** so the multi-period loop can skip the second period's I/O (D-17 perf optimization):
```typescript
// Inside fetchAndAggregate, gate the previous-period I/O:
const previousRevenue = includePrevious
  ? await ctx.db.query("externalRevenue")
      .withIndex("by_period", (q) => q.gte("periodStart", previousStart).lt("periodStart", previousEnd))
      .collect()
  : [];
// Same gate on previousConsignments, previousJournalLines.
// previousPeriod aggregation passes empty arrays → returns zeroed WeekData.
```

Existing callers (`getWeeklyIncomeStatement` line 901, `getIncomeStatement` line 927) keep default `true` — zero behavior change.

**Verified by direct read of `incomeStatement.ts:570-897`.**

---

### `src/pages/FinancialExportPage.tsx` (NEW — page, form-driven request-response)

**Analog:** `src/pages/BankReconciliationPage.tsx`

**Imports pattern** (clone from `BankReconciliationPage.tsx:13-39`):
```typescript
import { useState, useMemo } from "react";
import { useQuery, useConvex } from "convex/react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download, AlertTriangle, Loader2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { utcToWibDateStr, wibDateStrToUtcMs } from "@/lib/dateUtils";
import { downloadCSV } from "@/lib/csvExport";
import {
  buildPeriodBuckets,
  buildExportFilenames,
  generateRawTransactionsCSV,
  generateMultiPeriodPLCSV,
} from "@/lib/financialExportHelpers";
```

**Auth/Guard pattern** — token comes from `useAuth()` context, NOT prop:
```typescript
const { user } = useAuth();
// Live preflight using useQuery (idempotent, reactive):
const preflight = useQuery(
  api.reports.financialExport.getExportPreflight,
  user?.token && periodStart && periodEnd
    ? { periodStart, periodEnd, granularity, token: user.token }
    : "skip"
);
```

**Core pattern — One-shot Generate handler (NOT useQuery)** — clone from `BankReconciliationPage.tsx:156-201` `handleConfirmImport`:
```typescript
const convex = useConvex();

async function handleGenerate() {
  if (!user?.token) return;
  setLoading(true);
  try {
    const filenames = buildExportFilenames(periodStart, periodEnd, granularity);
    if (typesSelected.includes("raw")) {
      const rows = await convex.query(api.reports.financialExport.getRawTransactionsExport, {
        periodStart, periodEnd, token: user.token,
      });
      const csv = generateRawTransactionsCSV(rows);
      downloadCSV(csv, filenames.transactions);
    }
    if (typesSelected.includes("pl")) {
      const data = await convex.query(api.reports.financialExport.getMultiPeriodPLExport, {
        periodStart, periodEnd, granularity, token: user.token,
      });
      const csv = generateMultiPeriodPLCSV(data.periods, data.rangeGap);
      // Edge case 9: 100ms gap between sequential downloads
      await new Promise((r) => setTimeout(r, 100));
      downloadCSV(csv, filenames.pl);
    }
    toast.success("Downloaded transactions and P&L summary CSVs.");
  } catch (err) {
    const message = humanizeError(err);
    toast.error(message);
  } finally {
    setLoading(false);
  }
}
```

**Header pattern** — clone from `FinancialStatement.tsx:254-278`:
```tsx
<div className="min-w-[280px]">
  <PageHeader
    title="Financial Data Export"
    description="Download raw transactions and P&L summaries for accountant handoff or external analysis."
  />
  {/* ... form sections in max-w-2xl mx-auto column ... */}
</div>
```

**Date input pattern** — clone from `FinancialStatement.tsx:355-365`:
```tsx
<input
  type="date"
  value={utcToWibDateStr(customStart)}
  onChange={(e) => {
    const ms = wibDateStrToUtcMs(e.target.value);
    if (!isNaN(ms)) setCustomStart(ms);
  }}
  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
/>
```

**Loading state pattern** — clone from `BankReconciliationPage.tsx:235-240`:
```tsx
{loading && (
  <div className="flex items-center gap-2 py-8 text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" />
    Generating…
  </div>
)}
```

**Tabular numerals (preflight stats)** — clone from `FinancialStatement.tsx:89` `MarginRow`:
```tsx
<span className="text-sm tabular-nums">
  Range covers {preflight.journalLineCount} journal entries, {preflight.revenueRowCount} revenue rows, {preflight.periodCount} periods.
</span>
```

**Soft warning Alert pattern (D-16)** — clone from `FinancialStatement.tsx:281-298`:
```tsx
{preflight?.isLargeRange && (
  <Alert role="status">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Large range</AlertTitle>
    <AlertDescription>
      This range covers more than 10,000 lines. Export may take a moment to download.
    </AlertDescription>
  </Alert>
)}
```

**Error humanization** — clone `BankReconciliationPage.tsx:91-96`:
```typescript
function humanizeError(err: unknown): string {
  if (!(err instanceof Error)) return "Could not generate export. Try a smaller date range or refresh and retry.";
  const match = err.message.match(/Uncaught ConvexError:\s*([\s\S]*?)(?:\r?\n\s*Called by client|$)/);
  if (match && match[1]) return match[1].trim();
  return err.message;
}
```

---

### `src/lib/financialExportHelpers.ts` (NEW — pure utility, transform)

**Analog:** `src/lib/staffPerformanceExport.ts`

**Imports pattern** — clone from `staffPerformanceExport.ts:8-9`:
```typescript
import { downloadCSV, escapeCell, buildIncomeStatementRows } from "./csvExport";
import { utcToWibDateStr, wibMidnightToUtc, WIB_OFFSET_MS } from "./dateUtils";
import { getIsoWeekNumber, utcToWibMonthStr } from "@/lib/periodLabels"; // OR re-export from dateUtils — see helpers
```

**Core pattern — CSV builder (D-14, D-15)** — clone from `staffPerformanceExport.ts:26-106`:
```typescript
export function generateRawTransactionsCSV(
  rows: RawTransactionRow[]
): string {
  const out: string[][] = [];

  // Header — D-01 column order (using corrected schema names)
  out.push([
    "entry_date", "je_id", "je_number", "je_type",
    "account_code", "account_name",
    "debit_idr", "credit_idr",
    "description", "source_doc_type", "source_doc_id", "created_by",
  ]);

  // One row per journalEntryLines entry
  for (const r of rows) {
    out.push([
      utcToWibDateStr(r.entryDate),
      String(r.journalEntryId),
      r.entryNumber,
      r.sourceType,                       // D-01: emit verbatim (Pitfall 3 — no mapping)
      r.accountCode,
      r.accountName,
      String(r.debitAmount),              // D-15: integer rupiah
      String(r.creditAmount),
      r.description ?? "",
      r.sourceType,                       // D-01 source_doc_type column = sourceType
      r.sourceId ?? "",                   // D-01 source_doc_id (may be undefined for manual JEs)
      r.createdByName ?? "<unknown>",     // Edge case 10: deleted users
    ]);
  }

  // D-14 + Pitfall 5: every row through escapeCell — NO exceptions, including header
  return out.map((row) => row.map(escapeCell).join(",")).join("\n");
}
```

**Bucket math (D-06)** — pure function, lives here (no Convex deps):
```typescript
export function buildPeriodBuckets(
  periodStart: number,
  periodEnd: number,
  granularity: "weekly" | "monthly" | "custom"
): Array<[number, number]> {
  if (granularity === "custom") return [[periodStart, periodEnd]];
  const buckets: Array<[number, number]> = [];
  if (granularity === "weekly") {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const snappedStart = snapToMondayWib(periodStart);
    let cursor = snappedStart;
    while (cursor < periodEnd) {
      const next = cursor + WEEK_MS;
      buckets.push([Math.max(cursor, periodStart), Math.min(next, periodEnd)]);
      cursor = next;
    }
  } else { // monthly
    const wib = new Date(periodStart + WIB_OFFSET_MS);
    let y = wib.getUTCFullYear(), m = wib.getUTCMonth();
    while (true) {
      const ms = wibMidnightToUtc(y, m, 1);
      const me = wibMidnightToUtc(y, m + 1, 1);
      if (ms >= periodEnd) break;
      buckets.push([Math.max(ms, periodStart), Math.min(me, periodEnd)]);
      m++;
      if (m > 11) { m = 0; y++; }
    }
  }
  return buckets;
}
```

**Filename helper (D-11)**:
```typescript
export function buildExportFilenames(
  periodStart: number,
  periodEnd: number,
  granularity: "weekly" | "monthly" | "custom"
): { transactions: string; pl: string } {
  const startStr = utcToWibDateStr(periodStart).replace(/-/g, "");
  const endStr = utcToWibDateStr(periodEnd - 1).replace(/-/g, ""); // periodEnd is exclusive
  return {
    transactions: `frollie-transactions-${startStr}-${endStr}.csv`,
    pl: `frollie-pl-summary-${startStr}-${endStr}-${granularity}.csv`,
  };
}
```

**Multi-period P&L CSV (D-08)** — single header, per-period rows via `buildIncomeStatementRows` (extracted from `csvExport.ts`), single range-aggregated footer:
```typescript
export function generateMultiPeriodPLCSV(
  periods: Array<{ label: string; current: WeekData; previous: WeekData | null; deltas: Deltas | null }>,
  rangeGap: GapAnalysis
): string {
  const out: string[][] = [];
  // Header (8 columns from existing generateIncomeStatementCSV)
  out.push([
    "period", "section", "channel", "line_item",
    "amount_idr", "confidence", "prev_period_idr", "delta_pct",
  ]);
  // Annotation row (per CONTEXT.md <specifics>)
  out.push(["# Multi-period export — prev_period_idr compares against the immediately prior period within the file."]);
  // Per-period rows (no inner footer)
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const prev = i > 0 ? periods[i - 1].current : null;
    const isFirstInRange = i === 0;
    out.push(...buildIncomeStatementRows(p.label, p.current, prev, p.deltas, isFirstInRange));
  }
  // Single range-aggregated footer (D-08)
  out.push([], ["# Data Quality Notes (range-aggregated)"]);
  out.push([`# Mapped products: ${rangeGap.totalMappedProducts}/${rangeGap.totalProducts}`]);
  // ... unmapped products / missing channels / zero-cost components / missing reversals
  return out.map((row) => row.map(escapeCell).join(",")).join("\n");
}
```

**Validation** — no input validation needed (pure functions consume already-validated backend output). Helper unit tests assert: `escapeCell` applied (`=SUM` → `'=SUM`), integer-only IDR (no decimals), bucket counts, first-period empty deltas.

---

### `src/lib/csvExport.ts` (MODIFY — utility, in-place refactor)

**Analog:** self.

**Change — Extract `buildIncomeStatementRows` from `generateIncomeStatementCSV` (lines ~149-655)** so the multi-period helper can reuse without re-emitting header/footer:

```typescript
// NEW exported helper — accepts firstInRange flag for empty prev/delta cells
export function buildIncomeStatementRows(
  periodStr: string,
  current: WeekData,
  previous: WeekData | null,
  deltas: IncomeStatementData["deltas"] | null,
  firstInRange: boolean = false
): string[][] {
  const rows: string[][] = [];
  // ... existing body from lines 165-654 (Revenue / Deductions / COGS / Gross / OpEx / EBIT / EBITDA / Net Income / CapEx+FCF blocks)
  // Wherever the existing code emits prev_period_idr / delta_pct cells, gate on !firstInRange:
  //   String(previous?.totalGross ?? 0)  →  firstInRange ? "" : String(previous!.totalGross)
  return rows;
}

// generateIncomeStatementCSV becomes a thin caller (header + rows + footer)
export function generateIncomeStatementCSV(data, weekLabel) {
  const rows: string[][] = [];
  rows.push([/* 8-column header — unchanged */]);
  rows.push(...buildIncomeStatementRows(weekLabel, data.current, data.previous, data.deltas, false));
  // ... existing footer (lines 655-697) unchanged
  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}
```

`escapeCell` (line 723) and `downloadCSV` (line 732) are unchanged — already CVE-aware.

---

### `src/pages/FinancialStatement.tsx` (MODIFY — add header action)

**Analog:** self.

**Change — Add "Export range…" button alongside existing "Export CSV" (lines 254-278).** Both `variant="outline" size="sm"` per UI-SPEC line 102:

```tsx
import { Link } from "react-router-dom";
// ... existing imports

<PageHeader
  title="Income Statement"
  description={pageDescription}
  action={
    <div className="flex items-center gap-2">
      {/* EXISTING button — unchanged */}
      <Button variant="outline" size="sm" onClick={...} disabled={...}>
        <Download className="h-4 w-4 mr-2" />
        Export CSV
      </Button>
      {/* NEW button */}
      <Button variant="outline" size="sm" asChild>
        <Link to="/financials/export">
          <Download className="h-4 w-4 mr-2" />
          Export range…
        </Link>
      </Button>
    </div>
  }
/>
```

---

### `src/App.tsx` (MODIFY — add route)

**Analog:** self.

**Change — Add `/financials/export` route immediately after the existing `/financials` route (line 624-631).** Use `allowedRoles` (NOT `roles` — RESEARCH §4 confirms prop name):

```tsx
// At top of file with other lazy imports (~line 78):
const FinancialExportPage = lazyWithPreload(() =>
  import('./pages/FinancialExportPage').then(m => ({ default: m.FinancialExportPage }))
);

// In the routes block, immediately after the /financials Route at line 624:
<Route
  path="financials/export"
  element={
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <FinancialExportPage />
    </ProtectedRoute>
  }
/>
```

**CRITICAL:** `<ProtectedRoute>` prop is `allowedRoles`, NOT `roles`. Verified at `src/components/auth/ProtectedRoute.tsx:9`. CONTEXT.md D-13 wrote `roles={...}` but that prop doesn't exist.

---

### `convex/reports/__tests__/financialExport.test.ts` (NEW — convex-test integration)

**Analog:** `convex/reports/__tests__/incomeStatement-capex.test.ts`

**Imports/scaffolding pattern** — clone from `incomeStatement-capex.test.ts:21-48`:
```typescript
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

const PERIOD_START = Date.UTC(2026, 2, 22, 17, 0, 0); // 2026-03-23 00:00 WIB
const PERIOD_END = Date.UTC(2026, 2, 29, 17, 0, 0);
const IN_PERIOD = Date.UTC(2026, 2, 25, 17, 0, 0);

async function seedUser(t: TestT, role: "admin" | "manager" | "kitchen" | "order_staff" = "admin"): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Test User", pinHash: "salt:hash", role, isActive: true,
      failedAttempts: 0, createdAt: Date.now(),
    }),
  );
}
```

**JE seeding pattern** — clone from `incomeStatement-capex.test.ts:112-141`:
```typescript
async function seedJournalDebit(
  t: TestT,
  userId: Id<"users">,
  accountId: Id<"accounts">,
  amount: number,
  entryDate: number,
  sourceType: "depreciation" | "manual" | "expense_void" = "manual",
  description?: string,
): Promise<Id<"journalEntries">> {
  return await t.run(async (ctx) => {
    const jeId = await ctx.db.insert("journalEntries", {
      entryNumber: `JE-TEST-${Math.random().toString(36).slice(2, 9)}`,
      date: entryDate,
      description: description ?? "Test JE",
      sourceType,
      isReversed: false,
      createdBy: userId,
      createdAt: Date.now(),
    });
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: jeId,
      accountId,
      entryDate,
      debitAmount: amount,
      creditAmount: 0,
    });
    return jeId;
  });
}
```

**Session token seeding (for `requireRole` tests)** — needed because `incomeStatement-capex.test.ts` doesn't use tokens. Add a `seedSession(t, userId)` helper that inserts a `sessions` doc and returns its token. Pattern: insert `{ userId, token, expiresAt: Date.now() + 86400000 }`.

**Test cases to cover (from RESEARCH §"Phase Requirements → Test Map"):**
- `range bounds` — D-03 inclusive start, exclusive end
- `role gate rejects` — kitchen + order_staff tokens throw "Not authorized"
- `role gate accepts` — manager + admin tokens succeed
- `empty range` — returns valid empty rows array
- `reversal lines included` — D-04: original + `expense_void` JE both appear
- `debit credit mutex` — D-01: every row has exactly one of (debit_idr, credit_idr) > 0
- `ordering` — D-02: entryDate ASC, entryNumber ASC, _creationTime ASC
- `preflight stats` — D-12: returns journalLineCount, revenueRowCount, periodCount
- `large range warning` — D-16: `isLargeRange === true` for >10k seeded lines (or use threshold-as-arg trick)
- `COGS override` — Phase 70 regression: extracted `fetchAndAggregate` still honors `menuProducts.cogsOverrideIdr`

---

### `src/lib/__tests__/financialExportHelpers.test.ts` (NEW — Vitest unit tests)

**Analog:** No existing helper-test file in repo for csvExport. Pattern lifted from `incomeStatement-capex.test.ts` shape (describe/it/expect) + helper-only assertions (no convex-test, pure function input/output).

**Imports pattern**:
```typescript
import { describe, it, expect } from "vitest";
import {
  buildPeriodBuckets,
  buildExportFilenames,
  generateRawTransactionsCSV,
  generateMultiPeriodPLCSV,
} from "../financialExportHelpers";
```

**Test cases (from RESEARCH §"Phase Requirements → Test Map"):**
- `buildPeriodBuckets weekly` — quarterly range produces 13 buckets
- `buildPeriodBuckets monthly` — N-month range produces N buckets
- `buildPeriodBuckets custom` — single bucket
- `first period no delta` — D-05: first bucket prev/delta cells empty
- `footer once` — D-08: range-wide footer at bottom only, not per period
- `escapeCell applied` — D-14: row with `description="=SUM(A1:A10)"` exports as `'=SUM(...)`
- `integer rupiah` — D-15: `String(12500000)` not `"12500000.00"`, no separators
- `buildExportFilenames` — `frollie-transactions-20260301-20260331.csv` for March 2026 (note: periodEnd-1 for inclusive label)
- `preset ranges` — Last week / Last month / Last quarter / YTD produce correct WIB ranges

---

### `src/pages/__tests__/FinancialExportPage.test.tsx` (NEW — RTL component test)

**Analog:** None exact in repo. Use generic Vitest + @testing-library/react pattern.

**Test cases (from RESEARCH §"Phase Requirements → Test Map"):**
- `granularity hidden` — when "P&L summary" checkbox unchecked, granularity radio group is not in DOM
- `at least one type` — Generate button disabled when both checkboxes unchecked, tooltip says "Select at least one export type."
- `invalid range` — Generate disabled when end < start, tooltip says "End date must be on or after start date."
- `filename preview` — preview text shows correct filenames given selected types + range
- `loading state` — clicking Generate disables button and shows "Generating…" with `Loader2`

Mock `useQuery` and `useConvex` from `convex/react`; mock `useAuth` to return a manager token.

---

### `tests/e2e/financial-data-export.spec.ts` (NEW — Playwright E2E)

**Analog:** `tests/e2e/income-statement-uat.spec.ts`

**Setup pattern** — clone from `income-statement-uat.spec.ts:1-39`:
```typescript
import { test, expect } from "@playwright/test";
import { loginAsManager, waitForDataLoad, screenshot } from "./helpers";

test.describe("Phase 76 UAT: Financial Data Export", () => {
  test("happy path: navigate → set range → click Generate → assert download", async ({ page }) => {
    await loginAsManager(page);
    // Navigate via the new "Export range…" button on /financials
    await page.goto("/financials");
    await waitForDataLoad(page);
    await page.getByRole("link", { name: /export range/i }).click();
    await page.waitForURL("**/financials/export");

    // Select export types (both default-checked)
    // Set range via Last week preset
    await page.getByRole("button", { name: /last week/i }).click();

    // Wait for preflight to populate
    await expect(page.locator('text=/Range covers \\d+ journal entries/')).toBeVisible({ timeout: 10_000 });

    // Click Generate; assert file download
    const [download1, download2] = await Promise.all([
      page.waitForEvent("download"),
      page.waitForEvent("download"),
      page.getByRole("button", { name: /generate exports/i }).click(),
    ]);
    expect(download1.suggestedFilename()).toMatch(/^frollie-transactions-\d{8}-\d{8}\.csv$/);
    expect(download2.suggestedFilename()).toMatch(/^frollie-pl-summary-\d{8}-\d{8}-(weekly|monthly|custom)\.csv$/);
    await screenshot(page, "uat-76-01-happy-path");
  });

  test("role gate: kitchen role redirects away from /financials/export", async ({ page }) => {
    // Pattern from income-statement-uat.spec.ts UAT-13
    // Either skip with note (no kitchen test user) or implement loginAsKitchen helper
  });
});
```

---

## Shared Patterns

### Authentication / Authorization (D-13 — DOUBLE-LAYER)

**Source A (backend):** `convex/lib/auth.ts:128-148`
**Source B (frontend):** `src/components/auth/ProtectedRoute.tsx:6-11`

**Apply to:** `convex/reports/financialExport.ts` (every query) AND `src/App.tsx` (route declaration).

```typescript
// Backend (every query handler):
await requireRole(ctx, args.token, ["manager", "admin"]);

// Frontend (route element):
<ProtectedRoute allowedRoles={["manager", "admin"]}>
  <FinancialExportPage />
</ProtectedRoute>
```

**CRITICAL:** ProtectedRoute prop is `allowedRoles`, NOT `roles`. Token validator on every protected query: `token: v.string()` (CLAUDE.md Pitfall #10).

### CSV Sanitization (D-14 — formula injection + RFC-4180)

**Source:** `src/lib/csvExport.ts:723-729`

**Apply to:** `generateRawTransactionsCSV`, `generateMultiPeriodPLCSV`, and the existing `generateIncomeStatementCSV` (already applied). Every row including header runs through `escapeCell`.

```typescript
export function escapeCell(value: string): string {
  const sanitized = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  if (sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n")) {
    return '"' + sanitized.replace(/"/g, '""') + '"';
  }
  return sanitized;
}
```

Final serialization: `rows.map((row) => row.map(escapeCell).join(",")).join("\n")` — same shape used in `staffPerformanceExport.ts:106` and `csvExport.ts:700-716`.

### Browser Download Trigger

**Source:** `src/lib/csvExport.ts:732-742`

**Apply to:** Generate handler in `FinancialExportPage.tsx`. Sequential calls separated by 100ms `setTimeout` per RESEARCH edge case 9.

```typescript
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 150);
}
```

### WIB Timezone Conversion

**Source:** `src/lib/dateUtils.ts:60-67` + `convex/lib/periodRange.ts:217-249`

**Apply to:** Frontend date inputs, filename generation, period bucket math, period labels.

```typescript
// Frontend (src/lib/dateUtils.ts):
utcToWibDateStr(utcMs)         // YYYY-MM-DD
wibDateStrToUtcMs(dateStr)     // YYYY-MM-DD → epoch ms at WIB midnight
wibMidnightToUtc(year, m, d)   // Date.UTC(year, m, d, -7, 0, 0, 0)
WIB_OFFSET_MS = 7 * 60 * 60 * 1000

// Backend (convex/lib/periodRange.ts):
calculateWeekRange(weekStartMs)
calculateMonthRange(year, month)
calculateCustomRange(periodStart, periodEnd)
getIsoWeekNumber(utcMs)        // "W15"
utcToWibMonthStr(utcMs)        // "2026-04"
```

### Toast / Error Surfacing

**Source:** `src/pages/BankReconciliationPage.tsx:191-199` + `:91-96` (`humanizeError`)

**Apply to:** `FinancialExportPage.tsx` Generate handler (success + error toasts; humanize ConvexError).

### Loading State (Loader2)

**Source:** `src/pages/BankReconciliationPage.tsx:235-240`

**Apply to:** `FinancialExportPage.tsx` Generate button + preflight panel.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/pages/__tests__/FinancialExportPage.test.tsx` | RTL component test | test | No existing RTL test in `src/pages/__tests__/`. Use generic Vitest + @testing-library/react conventions; mock `useQuery` / `useConvex` / `useAuth`. Planner should establish this as the seed pattern for future page-level tests. |

All other files have exact or role-match analogs in the codebase.

---

## Metadata

**Analog search scope:**
- `convex/reports/` (incomeStatement.ts + 5 test files in `__tests__/`)
- `convex/lib/` (auth.ts, periodRange.ts, journalHelpers.ts)
- `src/lib/` (csvExport.ts, staffPerformanceExport.ts, dateUtils.ts)
- `src/pages/` (BankReconciliationPage.tsx, FinancialStatement.tsx)
- `src/components/auth/` (ProtectedRoute.tsx)
- `src/components/layout/` (PageHeader.tsx)
- `src/App.tsx` (route declarations)
- `tests/e2e/` (income-statement-uat.spec.ts and 28 sibling specs)

**Files scanned:** ~25 (direct reads) + 30+ (Glob/Grep).

**Pattern extraction date:** 2026-05-08

**Verification level:** All analog excerpts and line numbers VERIFIED by direct file read. Schema name corrections cross-checked against `convex/schema.ts:1809-1989`.

---

## PATTERN MAPPING COMPLETE

**Phase:** 76 — Financial Data Export
**Files classified:** 11 (5 NEW source/page, 5 MODIFY, 1 NEW page-test that is a partial-match)
**Analogs found:** 10 / 11 exact-or-role-match (1 partial — RTL page test).

### Coverage
- Files with exact analog: 7
- Files with role-match analog: 3
- Files with partial-only analog: 1 (`FinancialExportPage.test.tsx`)
- Files with NO analog: 0

### Key Patterns Identified
- All Convex queries use `requireRole(ctx, args.token, [...])` at the top of the handler with `token: v.string()` in args.
- Range scans use `withIndex("by_<field>", q => q.gte(...).lt(...)).collect()`; N+1 avoided by Set-deduping IDs and batching with `Promise.all(ids.map(id => ctx.db.get(id)))`.
- All CSV builders return `string[][]` and apply `escapeCell` once at the end via `rows.map(r => r.map(escapeCell).join(",")).join("\n")` — header included, no exceptions.
- Multi-step page flows (form → preflight → generate) use `useQuery(... "skip")` for reactive preflight and `useConvex().query(...)` for one-shot Generate-time fetches.
- Frontend date handling: `<input type="date">` value goes through `wibDateStrToUtcMs` for backend args; `utcToWibDateStr` for filenames (with `-` stripped for `YYYYMMDD` format).
- ProtectedRoute prop is `allowedRoles` (NOT `roles`).

### File Created
`D:/Claude/Product Manager/product_master/.planning/phases/76-financial-data-export/76-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference exact analog file paths, line numbers, and code excerpts in the per-plan PLAN.md action sections.
