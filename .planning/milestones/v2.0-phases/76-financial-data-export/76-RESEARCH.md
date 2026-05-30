# Phase 76: Financial Data Export — Research

**Researched:** 2026-05-08
**Domain:** CSV export of GL-level transactions + multi-period P&L summary
**Confidence:** HIGH (all canonical refs read; only minor schema-naming corrections vs CONTEXT.md)

---

## Summary

Phase 76 adds a `/financials/export` page (manager+admin) that emits two CSVs: (1) a raw `journalEntryLines`-driven transaction export covering a user-selected date range, and (2) a multi-period P&L summary that loops the existing `aggregateWeek` aggregator over weekly/monthly/custom-single buckets and concatenates Phase 75's existing 8-column row schema.

Implementation is overwhelmingly plumbing: zero new P&L math, zero new indexes, zero new dependencies, zero new shadcn primitives. The risk surface is narrow — formula injection (already-solved by `escapeCell`), schema-naming drift between CONTEXT.md and reality, and the WIB-correctness of date-range bucketing.

**Primary recommendation:** Single backend file `convex/reports/financialExport.ts` with three exports (`getRawTransactionsExport`, `getMultiPeriodPLExport`, `getExportPreflight`); single frontend page `src/pages/FinancialExportPage.tsx` with one helper `src/lib/financialExportHelpers.ts` that splits the date range into period buckets and concatenates per-period rows from a refactored `buildIncomeStatementRows()` helper extracted out of `generateIncomeStatementCSV`. Reuse `escapeCell` + `downloadCSV` verbatim. Add `canAccessFinancials` permission to keep gating consistent with the rest of the codebase.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Raw transactions CSV — one row per `journalEntryLines` entry. Columns: `entry_date, je_id, je_number, je_type, account_code, account_name, debit_idr, credit_idr, description, source_doc_type, source_doc_id, created_by`. `debit_idr`/`credit_idr` mutually exclusive (one always 0).
- **D-02:** Order = `entry_date ASC, je_number ASC, line insertion order` (debits before credits within an entry).
- **D-03:** Use `journalEntryLines.by_entryDate` index; batch-fetch parents and accounts (no N+1).
- **D-04:** Reversal lines INCLUDED. Both original and reversal appear; reversal identifiable via `je_type` and description cross-reference.
- **D-05:** Multi-period P&L extends existing 8-column row schema; long format (one row per period × section × channel × line_item). `period` column carries the bucket label.
- **D-06:** Granularity selector: `weekly` | `monthly` | `custom` (custom = single bucket spanning the whole range). Default = weekly.
- **D-07:** Reuse `aggregateWeek` per period; new query is a thin loop. NO duplicated P&L math.
- **D-08:** Data Quality footer once at bottom (range-aggregated), not per period.
- **D-09:** Page at `/financials/export`, linked from primary button in `FinancialStatement.tsx` header. Existing single-period "Export CSV" button stays.
- **D-10:** Form layout — Export type checkboxes, Date range (presets + pickers), Granularity (P&L only), Generate button.
- **D-11:** Per-file browser downloads (no ZIP). Filenames: `frollie-transactions-{YYYYMMDD}-{YYYYMMDD}.csv` and `frollie-pl-summary-{YYYYMMDD}-{YYYYMMDD}-{granularity}.csv`. Dates in WIB.
- **D-12:** Pre-flight stats panel: "Range covers N journal entries, M revenue rows, X periods".
- **D-13:** Role gate = manager + admin. Both `<ProtectedRoute>` and `requireRole(ctx, args.token, ["manager","admin"])`.
- **D-14:** Every CSV row through `escapeCell()`. Add a test asserting it for raw transactions.
- **D-15:** IDR amounts as integer rupiah (no decimals, no separators, no symbol).
- **D-16:** No hard cap. Soft warning at >10,000 lines.
- **D-17:** 52 `aggregateWeek` calls/year is acceptable (sub-second per call confirmed in Phase 75).

### Claude's Discretion

- XLSX deferred — CSV-only.
- Pre-flight stats exact numbers/layout.
- Date preset labels (UI-SPEC locks them as `Last week / Last month / Last quarter / Year to date / Custom`).
- Filename date format (UI-SPEC locks `YYYYMMDD`).
- Internal Convex file structure (this research recommends single file).
- Error surfacing (toast pattern + `<ProtectedRoute>` redirect already locked by UI-SPEC).

### Deferred Ideas (OUT OF SCOPE)

- XLSX export
- ZIP bundling (jszip)
- Scheduled / cron exports
- Source-document pivot exports (revenue-by-channel, etc.)
- Accountant-import-format presets (QuickBooks, Xero)
- Signed URL / share links
- Data Health hooks (Phase 77)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIN-03 | User can export raw financial transactions (revenue + journal entries) as CSV for a date range | §1 Raw-transactions query design; §3 Bucketing; D-01..D-04 covered |
| FIN-04 | User can export P&L summary as CSV for weekly/monthly/custom range | §1 Multi-period loop; §5 CSV refactor strategy; D-05..D-08 covered |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Date-range bucketing (week/month/custom) | Frontend | Backend (verifies bounds) | Bucketing is presentation-aware (preset → range); backend trusts the supplied `[periodStart, periodEnd)` pair |
| Raw GL line scan + parent/account enrichment | Backend (Convex query) | — | Index range scan + batch fetch must run server-side; client cannot scan |
| Per-period P&L aggregation | Backend (Convex query loop) | — | Reuses existing `aggregateWeek` which is server-side I/O + pure compute |
| CSV string assembly | Frontend (`csvExport.ts`) | — | Sanitization (`escapeCell`) is already client-side; keep one canonical sanitizer |
| Browser download trigger | Frontend (`downloadCSV`) | — | Client-side blob+anchor pattern (already implemented, reuse verbatim) |
| Role gate | Both | — | Double-layer per established v1.0 pattern (ProtectedRoute + `requireRole` in every query) |
| Pre-flight count | Backend (cheap query) | Frontend (renders) | Count must reflect actual DB state; thin index-bound `.collect().length` |

---

## Standard Stack

### Core (all already installed — NO new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | (current) | Backend queries + index range scan | Project's only backend [VERIFIED: package.json] |
| React 19 + TypeScript | (current) | Page component | Project standard [VERIFIED: package.json] |
| react-router-dom | (current) | Route declaration | Already used for `/financials` [VERIFIED: src/App.tsx] |
| Tailwind CSS 4 + shadcn (manual) | (current) | Styling + form primitives | Project standard [VERIFIED: src/index.css, UI-SPEC] |
| date-fns + custom WIB helpers | (current) | Date formatting | Already used; `dateUtils.ts` is canonical [VERIFIED] |
| sonner | (current) | Toast notifications | Standard for this project [VERIFIED: BankReconciliationPage.tsx] |
| lucide-react | (current) | Icons (Download, AlertTriangle, Loader2) | Already imported across financial pages [VERIFIED] |
| convex-test | ^0.0.41 | Backend integration tests | Project standard [VERIFIED: package.json] |
| Vitest | ^4.0.18 | Unit + integration test runner | Project standard [VERIFIED: package.json] |
| @playwright/test | ^1.58.2 | E2E happy-path | Project standard [VERIFIED: tests/e2e/] |

### Reused In-Repo Helpers (DO NOT REIMPLEMENT)

| Helper | Location | Purpose |
|--------|----------|---------|
| `escapeCell` | `src/lib/csvExport.ts:723` | Formula-injection prefix-quote + RFC-4180 escape [VERIFIED] |
| `downloadCSV` | `src/lib/csvExport.ts:732` | Blob + anchor trigger [VERIFIED] |
| `generateIncomeStatementCSV` | `src/lib/csvExport.ts:145` | Single-period 8-col row builder [VERIFIED] |
| `aggregateWeek` (internal) + `getIncomeStatement` query | `convex/reports/incomeStatement.ts:927` | Per-period P&L aggregator [VERIFIED] |
| `calculateWeekRange` | `convex/lib/periodRange.ts:201` | Week bucket bounds (WIB) [VERIFIED] |
| `calculateMonthRange` | `convex/lib/periodRange.ts:149` | Month bucket bounds (WIB) [VERIFIED] |
| `calculateCustomRange` | `convex/lib/periodRange.ts:172` | Single-bucket equal-length comparison [VERIFIED] |
| `wibMidnightToUtc`, `utcToWibDateStr`, `wibDateStrToUtcMs`, `formatShortWIB` | `src/lib/dateUtils.ts` | WIB conversion helpers [VERIFIED] |
| `getIsoWeekNumber`, `utcToWibMonthStr` | `convex/lib/periodRange.ts` | Period label formatting (`W15`, `2026-04`) [VERIFIED] |
| `requireRole` | `convex/lib/auth.ts:128` | Role enforcement [VERIFIED] |
| `<ProtectedRoute allowedRoles={["manager","admin"]}>` | `src/components/auth/ProtectedRoute.tsx` | Route gate (uses `allowedRoles`, NOT `roles`) [VERIFIED] |

**Schema name corrections vs CONTEXT.md** (CONTEXT.md drifts from current schema — planner/executor MUST use the actual names below):

| CONTEXT.md says | Actual schema | Source |
|-----------------|---------------|--------|
| `journalEntries.entryType` | `journalEntries.sourceType` | `convex/schema.ts:1948` |
| `journalEntries.entryNumber` | `journalEntries.entryNumber` ✓ | `convex/schema.ts:1945` |
| `journalEntries.entryDate` | `journalEntries.date` | `convex/schema.ts:1946` |
| `journalEntries.sourceDocType` | `journalEntries.sourceType` (same field as je_type) | `convex/schema.ts:1948` |
| `journalEntries.sourceDocId` | `journalEntries.sourceId` (optional v.string) | `convex/schema.ts:1962` |
| `journalEntries.reversalOfEntryId` | `journalEntries.reversedByEntryId` (forward link only) | `convex/schema.ts:1964` |
| `journalEntryLines.entryId` | `journalEntryLines.journalEntryId` | `convex/schema.ts:1980` |
| `journalEntryLines.debit` / `credit` | `journalEntryLines.debitAmount` / `creditAmount` | `convex/schema.ts:1983-84` |
| `glAccounts` table | `accounts` table | `convex/schema.ts:1809` |
| `glAccounts.code` / `name` | `accounts.code` / `name` ✓ | `convex/schema.ts:1810-11` |

**`je_type` field semantics:** D-01 says `je_type` "comes from `journalEntries.entryType`". Reality: the field is `sourceType` (literal union: `expense_approval | expense_void | reimbursement | reimbursement_void | payroll | payroll_void | manual | depreciation | depreciation_void | asset_acquisition | bank_statement | bank_statement_reversal`). There is no separate `entryType`. **Recommendation:** map `sourceType` directly to `je_type` in CSV, and rely on the `_void`/`reversal` literal suffixes for D-04's reversal identification. **No `consignmentSettlement` literal exists** — consignment doesn't post to journal entries.

**Reversal detection:** D-04 wants reversal rows tagged. Two reliable signals: (a) `sourceType` ends in `_void` or `_reversal`; (b) parent JE's `isReversed === true` indicates the original was reversed. The `je_number` of the reversal also typically encodes a relationship to the original via the `description`. Recommendation: emit `sourceType` verbatim in `je_type` — accountants already understand the `_void` suffix.

[VERIFIED via `convex/schema.ts` direct read]

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser: /financials/export (FinancialExportPage.tsx)               │
│  ├─ Form state (export types, range, granularity)                   │
│  ├─ Preset chip → wibDateStrToUtcMs → [periodStart, periodEnd)      │
│  ├─ Pre-flight live query (debounced on date change)                │
│  └─ "Generate" click ─┬──────────────────────────────────────────┐  │
└─────────────────────┬─┘                                          │  │
                      │ useConvex().query (NOT useQuery — one-shot)│  │
                      ▼                                            │  │
┌─────────────────────────────────────────────────────────────────────┐
│ convex/reports/financialExport.ts                                   │
│                                                                     │
│  getRawTransactionsExport(periodStart, periodEnd, token)            │
│   ├─ requireRole(["manager","admin"])                               │
│   ├─ journalEntryLines.by_entryDate range scan                      │
│   ├─ batch ctx.db.get() unique entryIds → JE map                    │
│   ├─ batch ctx.db.get() unique accountIds → account map             │
│   ├─ batch ctx.db.get() unique createdBy ids → user-name map        │
│   ├─ Sort: entryDate ASC, entryNumber ASC, _creationTime ASC        │
│   └─ Return rows[] ready for CSV serialization                      │
│                                                                     │
│  getMultiPeriodPLExport(periodStart, periodEnd, granularity, token) │
│   ├─ requireRole(["manager","admin"])                               │
│   ├─ buildPeriodBuckets(start, end, granularity) → [[s1,e1],...]    │
│   ├─ for each [s,e]: fetchAndAggregate(ctx, s, e, prevS, prevE)     │
│   │     (reuses Phase 75's exported helper or refactors it)         │
│   ├─ Range-wide gap analysis (union of unmappedProducts etc.)       │
│   └─ Return periods[] + rangeGap                                    │
│                                                                     │
│  getExportPreflight(periodStart, periodEnd, granularity, token)     │
│   ├─ requireRole(["manager","admin"])                               │
│   ├─ JE-line count via .collect().length on by_entryDate range      │
│   ├─ externalRevenue count via .collect().length on by_period       │
│   └─ buildPeriodBuckets(...).length                                 │
└─────────────────────────────────────────────────────────────────────┘
                      ▲
                      │ rows[][] flat string matrix
                      │
┌─────────────────────▼───────────────────────────────────────────────┐
│ src/lib/financialExportHelpers.ts                                   │
│   buildPeriodBuckets(periodStart, periodEnd, granularity)           │
│   buildIncomeStatementRows(periodLabel, current, previous, deltas)  │
│       ← refactored OUT of generateIncomeStatementCSV                │
│   generateMultiPeriodPLCSV(periods[], rangeGap)                     │
│       ├─ header row                                                 │
│       ├─ for each period: append rows (no per-period footer)        │
│       └─ single range-wide footer (D-08)                            │
│   generateRawTransactionsCSV(rows[]) → CSV string                   │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ CSV string
                      ▼
              downloadCSV(csv, filename)  ← reused verbatim
```

### Component Responsibilities

| File | Responsibility |
|------|----------------|
| `convex/reports/financialExport.ts` (NEW) | Three queries: raw transactions, multi-period P&L, preflight. Each `requireRole`s manager+admin |
| `convex/reports/incomeStatement.ts` (MODIFY) | Export `fetchAndAggregate` so the new file can call it directly without duplicating the 80-line I/O block |
| `src/pages/FinancialExportPage.tsx` (NEW) | Page component with form, preflight panel, generate handler |
| `src/components/financialExport/PreflightPanel.tsx` (NEW) | Per UI-SPEC line 212 — stat row + soft warning |
| `src/lib/financialExportHelpers.ts` (NEW) | `buildPeriodBuckets`, `buildIncomeStatementRows`, `generateRawTransactionsCSV`, `generateMultiPeriodPLCSV` |
| `src/lib/csvExport.ts` (MODIFY) | Refactor `generateIncomeStatementCSV` to delegate row-building to `buildIncomeStatementRows` (no behavior change). Keep public API intact for `FinancialStatement.tsx` |
| `src/pages/FinancialStatement.tsx` (MODIFY) | Add "Export range…" outline button next to existing "Export CSV" |
| `src/App.tsx` (MODIFY) | Add `/financials/export` route inside the existing `<ProtectedRoute>` block |
| `src/lib/types.ts` (MODIFY) | Add `canAccessFinancials: boolean` to `ROLE_PERMISSIONS` (manager+admin = true). See §4 below for rationale |

### Pattern 1: Per-period P&L loop (D-07)

**What:** Reuse `fetchAndAggregate` once per bucket; never re-derive P&L math.
**When to use:** Multi-period P&L export.
**Code reference:** `convex/reports/incomeStatement.ts:575-897` — `fetchAndAggregate` is currently a private function. Plan must export it (or extract to a shared helper file like `convex/reports/incomeStatementCore.ts`) so `financialExport.ts` can call it.

```typescript
// Pseudocode for convex/reports/financialExport.ts
import { fetchAndAggregate } from "./incomeStatement";  // requires re-export

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
    let prevPeriodCurrent: WeekData | null = null;  // for D-05 in-range delta
    for (const [s, e] of buckets) {
      const result = await fetchAndAggregate(ctx, s, e, /*prev*/ s - (e - s), s);
      periods.push({ start: s, end: e, current: result.currentPeriod, /*…*/ });
    }
    return { periods, /* range-wide gap aggregation */ };
  },
});
```

**Important deviation from `getIncomeStatement`:** D-05 says `prev_period_idr` and `delta_pct` compare against the **immediately prior period in the range**, not an equal-length window before each period. So for periods 2..N the "previous" is `periods[i-1].current`; for period 1 they're empty. **Do not reuse `fetchAndAggregate`'s built-in `previousPeriod` for the in-range delta** — fetch each bucket as standalone, then compute the in-range delta in the helper.

Optimization: since `previousPeriod` is unused for delta calc, pass `previousStart === previousEnd === periodStart` to skip the second period's I/O — saves ~50% of the per-bucket query cost. (Or refactor `fetchAndAggregate` to accept an `includePrevious: boolean` flag.) Plan should choose one.

### Pattern 2: Raw-transactions enrichment (D-03)

**What:** Single index range scan + 3 batch fetches; zero N+1.
**When to use:** Raw transactions export query.

```typescript
const lines = await ctx.db
  .query("journalEntryLines")
  .withIndex("by_entryDate", (q) =>
    q.gte("entryDate", periodStart).lt("entryDate", periodEnd))
  .collect();

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

// Build maps, then map lines → flat row shape, sort by (date, entryNumber, _creationTime)
```

**Confidence:** [VERIFIED via `convex/reports/incomeStatement.ts:643-647` — same exact pattern is used today].

### Anti-Patterns to Avoid

- **Computing P&L math in `financialExport.ts`** — D-07 forbids; the entire phase value depends on reuse. If `aggregateWeek` is "almost what we need but not quite," the answer is to refactor `incomeStatement.ts`, not to fork.
- **Per-line `ctx.db.get()` of parent JE / account** — would be N+1 at 10k+ lines. Always Set-dedupe IDs first, batch via `Promise.all`.
- **Using `useQuery` for the export trigger** — `useQuery` reactively re-runs and re-downloads. Use `useConvex().query(api.…, args)` for one-shot fetch on Generate click. Pre-flight CAN use `useQuery` (it's idempotent).
- **Passing `Date.now()` mid-handler** — period bucketing uses input timestamps; do not introduce wall-clock drift inside the loop.
- **String concatenation in CSV builders** — always build `string[][]` and let one final `.map(row => row.map(escapeCell).join(",")).join("\n")` apply sanitization. This is the `staffPerformanceExport.ts` pattern (verified via direct read).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV escaping / formula injection | Custom regex | `escapeCell` from `csvExport.ts:723` | Already CVE-aware (=, +, -, @, tab, CR prefix-quote + RFC-4180) |
| CSV download trigger | Custom blob/anchor wiring | `downloadCSV` from `csvExport.ts:732` | Already revokes object URL, handles cleanup |
| WIB date conversion | New `new Date(... +7h)` math | `wibDateStrToUtcMs`, `utcToWibDateStr`, `wibMidnightToUtc` | DST-safe, single source of truth; reimplementing would diverge from financial pages |
| Week bucket math | New Monday-aligned arithmetic | `calculateWeekRange` (already used in P&L) | Already battle-tested across 80+ phases |
| Month bucket math | New month-arithmetic | `calculateMonthRange` from `convex/lib/periodRange.ts:149` | **Already exists** — research confirms; CONTEXT.md "if not, what's the minimal addition" question is moot |
| Custom range bucket | New helper | `calculateCustomRange` from `convex/lib/periodRange.ts:172` | Already exists; signature `(periodStart, periodEnd) → currentStart/End/prev*` works as single bucket |
| ISO week label | Manual week-of-year math | `getIsoWeekNumber` from `convex/lib/periodRange.ts:233` | Already returns "W15" format |
| Month label | Custom string format | `utcToWibMonthStr` (`2026-04`) | Already exists |
| Per-period P&L compute | Re-derive from raw revenue | `aggregateWeek` (via `fetchAndAggregate`) | Single source of truth; Phase 75 just shipped FCF here |
| COGS resolution | Re-walk BOM | `buildProductCOGSMap` | Phase 70 override built in |
| Role gate | Inline `user.role === "manager"` | `requireRole(ctx, args.token, [...])` | Standard pattern; handles inactive users + diagnostic errors |

**Key insight:** Phase 76 is intentionally a thin layer. Every numeric computation lives in code that already shipped. The only new logic is bucket-splitting, in-range delta computation (one period back, not equal-length lookback), and CSV row-builder refactoring.

---

## Section 1 — Implementation Approach

**Recommendation:** Single backend file `convex/reports/financialExport.ts` (~250-300 LOC estimate). Split avoided because both queries share the same role gate, error handling, and tests; co-location keeps the diff reviewable.

**Frontend:** `src/pages/FinancialExportPage.tsx` (page) + `src/lib/financialExportHelpers.ts` (pure helpers + CSV builders) + `src/components/financialExport/PreflightPanel.tsx` (presentational). The form sub-components mentioned as optional in UI-SPEC (`ExportTypeCheckboxes`, `DateRangeForm`) are explicitly permitted to stay inline if total page LOC stays < 250 — RECOMMEND inline; the form has 3 sections and splitting them adds ceremony with no reuse benefit.

**Multi-period P&L interaction with `aggregateWeek`:** The cleanest path is to **export `fetchAndAggregate` from `incomeStatement.ts`**, then call it once per bucket from `financialExport.ts`. `fetchAndAggregate` is currently a private async helper but has no `query` decorator — it's already plain TypeScript. Either:

1. **Re-export** (1-line diff): add `export` to the function signature in `incomeStatement.ts`. Cleanest.
2. **Move to shared file** (`convex/reports/_incomeStatementCore.ts`) and re-import from both. Use this if the planner is concerned about coupling.

Recommend option 1. Coupling is real but explicit: Phase 76 is by-design a thin layer over Phase 75's aggregator.

**Per-period delta optimization:** Since D-05 specifies in-range deltas (not equal-length lookback), the second `fetchAndAggregate` argument pair (`previousStart`, `previousEnd`) is wasted work. Add an `includePrevious: boolean` parameter (default `true` for back-compat) and pass `false` from the financial-export loop. Saves ~50% of per-bucket DB I/O. This is a strict cost win and a one-line conditional inside `fetchAndAggregate`.

[VERIFIED via direct read of `convex/reports/incomeStatement.ts:575-897`]

---

## Section 2 — Date-Range Bucketing

**`calculateMonthRange` already exists** at `convex/lib/periodRange.ts:149`. Signature:
```typescript
calculateMonthRange(year: number, month: number): { currentStart, currentEnd, previousStart, previousEnd }
```
where `month` is 0-indexed and `currentEnd` is exclusive (1st of next month 00:00 WIB).

**`calculateCustomRange` already exists** at `convex/lib/periodRange.ts:172`. Single-bucket = call once with `(periodStart, periodEnd)`.

**`calculateWeekRange` already exists** at `convex/lib/periodRange.ts:201`. Takes a Monday-00:00-WIB epoch ms.

**New helper required:** `buildPeriodBuckets(periodStart, periodEnd, granularity)` returning `Array<[number, number]>` of `[bucketStart, bucketEnd)` pairs. Lives in `src/lib/financialExportHelpers.ts` (pure function, no Convex deps). Pseudocode:

```typescript
function buildPeriodBuckets(
  periodStart: number,
  periodEnd: number,
  granularity: "weekly" | "monthly" | "custom"
): Array<[number, number]> {
  if (granularity === "custom") return [[periodStart, periodEnd]];

  const buckets: Array<[number, number]> = [];
  if (granularity === "weekly") {
    // Snap periodStart down to the nearest Monday 00:00 WIB
    const snappedStart = snapToMondayWib(periodStart);
    let cursor = snappedStart;
    while (cursor < periodEnd) {
      const next = cursor + 7 * 24 * 60 * 60 * 1000;
      buckets.push([cursor, Math.min(next, periodEnd)]);
      cursor = next;
    }
  } else { // monthly
    // Snap periodStart down to the 1st of its WIB month
    const { year, month } = wibComponents(periodStart);
    let cursorYear = year, cursorMonth = month;
    while (true) {
      const monthStart = wibMidnightToUtc(cursorYear, cursorMonth, 1);
      const monthEnd = wibMidnightToUtc(cursorYear, cursorMonth + 1, 1);
      if (monthStart >= periodEnd) break;
      buckets.push([Math.max(monthStart, periodStart), Math.min(monthEnd, periodEnd)]);
      cursorMonth++;
      if (cursorMonth > 11) { cursorMonth = 0; cursorYear++; }
    }
  }
  return buckets;
}
```

**Edge case — partial leading/trailing buckets:** When the user-selected range doesn't align to bucket boundaries (e.g., starts on a Wednesday with weekly granularity), the first/last bucket is partial. Two options:

1. **Snap-and-truncate** (above pseudocode): partial buckets exist but are clamped to `[max(periodStart, bucketStart), min(periodEnd, bucketEnd))`. Period label honestly shows the truncation (e.g., `2026-W15 (partial)`).
2. **Snap-and-expand**: extend the bounds to full bucket boundaries. Cleaner labels but exports data outside the user's range.

**Recommendation: option 1 (truncate)** — never export data outside the user's chosen range; financial reports must respect the input window literally. UI-SPEC's filename hint already shows the user's chosen `YYYYMMDD-YYYYMMDD`, so the data scope must match.

**Period label format:**
- Weekly: `2026-W15` if bucket = full ISO week, else `2026-W15 (partial)` or `2026-04-13 to 2026-04-15`
- Monthly: `2026-04` if bucket = full WIB month, else `2026-04 (partial)`
- Custom: `2026-04-01 to 2026-04-19` (exclusive end labelled inclusive — common convention; verify in UAT)

[VERIFIED helpers exist via direct read of `convex/lib/periodRange.ts`]

---

## Section 3 — Raw-Transactions Query Mechanics

**Pattern:** Range scan on `journalEntryLines.by_entryDate`, dedupe IDs into Sets, batch-fetch via `Promise.all`, build flat rows, sort, return.

**Detailed flow:**

1. `ctx.db.query("journalEntryLines").withIndex("by_entryDate", q => q.gte("entryDate", periodStart).lt("entryDate", periodEnd)).collect()` → `lines: Doc<"journalEntryLines">[]`
2. Set-dedupe `journalEntryId`, `accountId`, gather later from `journalEntries.createdBy`.
3. `Promise.all(uniqueJeIds.map(id => ctx.db.get(id)))` — single round-trip per ID but parallelized.
4. Same for `accountIds` and `userIds` (after JE fetch, since `createdBy` lives on JE).
5. Build maps `Map<string, Doc<"journalEntries">>`, etc.
6. Map each line to a row object with all 12 columns from D-01.
7. Sort: `(a, b) => a.entryDate - b.entryDate || a.entryNumber.localeCompare(b.entryNumber) || a._creationTime - b._creationTime`. Note: `journalEntryLines._creationTime` is the natural insertion order within an entry — debits-then-credits convention is preserved by the journal engine's insertion order [INFERRED from project's accounting helpers; should be verified during plan-check].
8. Return rows; CSV serialization happens client-side.

**Sorting fallback:** If `_creationTime` doesn't reliably preserve debit-then-credit order, sort secondarily by `creditAmount === 0 ? 0 : 1` — debits (where `creditAmount === 0`) come first. Cheap, deterministic, matches the visual convention.

**Convex pagination at ~10k lines:** Convex `.collect()` has a default 16 MB / 32k document soft limit per query. At ~250 bytes per `journalEntryLine` (small doc with 6 fields), 10k lines ≈ 2.5 MB — well under the limit. At 32k lines (a full year of high-volume JE), still ~8 MB — under the limit but approaching it. **Recommendation:** no pagination for v1; add `_count` ceiling check in the preflight query (e.g., warn at >50k) before relaxing the soft warning threshold.

[VERIFIED Convex limits via working precedent: `convex/reports/incomeStatement.ts:643-647` already uses identical `withIndex("by_entryDate", ...).collect()` pattern at week scale]

---

## Section 4 — Frontend Page Structure

**Route placement in `src/App.tsx`:** Add immediately after the existing `/financials` route (line ~624 in current file). The new route uses the same `<ProtectedRoute>` guard signature; **the existing `/financials` route uses `requiredPermission="canAccessDashboard"`**, which is overly broad. For Phase 76 the natural fix is to:

1. Add new permission `canAccessFinancials: boolean` to `ROLE_PERMISSIONS` in `src/lib/types.ts` (kitchen=false, order_staff=false, manager=true, admin=true).
2. Use `<ProtectedRoute requiredPermission="canAccessFinancials">` for the new `/financials/export` route.
3. **DO NOT touch the existing `/financials` route** to avoid scope creep — leave it on `canAccessDashboard`. (CONTEXT.md says "matches `/financials` access — managers already see the aggregated numbers"; behavior is identical, only the permission key differs.)

**Alternative path:** Use `<ProtectedRoute allowedRoles={["manager","admin"]}>` (the prop already exists per `ProtectedRoute.tsx:9-10`). Cleaner — no new permission entry. CONTEXT.md D-13 phrases the gate as `roles={["manager","admin"]}` so this is closer to the user's stated intent.

**Recommendation: use `allowedRoles={["manager","admin"]}` directly.** It's already supported, requires no new permission, and matches D-13 verbatim. Adding a new permission key would be redundant since the existing permissions never split manager from admin on financial views (other than `canManageReimbursements` which is admin-only by design). Skip the `canAccessFinancials` proposal above.

**Confirmed `<ProtectedRoute>` signature** [VERIFIED: `src/components/auth/ProtectedRoute.tsx:6-11`]:
```typescript
interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: keyof typeof ROLE_PERMISSIONS.admin;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}
```
**CRITICAL:** the prop is `allowedRoles`, NOT `roles`. CONTEXT.md D-13 wrote `roles={["manager","admin"]}` — that prop name does not exist. Plan/executor MUST use `allowedRoles`.

**Page wiring:** Inside the wrapped block, use `useConvex()` for one-shot Generate-time queries, and `useQuery(api.reports.financialExport.getExportPreflight, {...})` for the live preflight panel (debounce date input by ~300ms).

---

## Section 5 — CSV Generation Pattern

**Decision:** Refactor `generateIncomeStatementCSV` to extract a `buildIncomeStatementRows(periodLabel, current, previous, deltas) → string[][]` helper. Both single-period and multi-period callers consume the helper; only the multi-period caller stitches multiple periods together.

**Why this split (not "concatenate per-period CSVs"):**
- A concatenation approach forces emitting the header row N times (once per `generateIncomeStatementCSV` call), then post-processing to dedupe. Brittle.
- A concatenation approach also re-emits the Data Quality footer per period — D-08 explicitly forbids this.
- The row-builder split is a no-behavior-change refactor for the single-period caller (`FinancialStatement.tsx`). Test coverage for `generateIncomeStatementCSV` continues to pass without changes.

**Mechanical steps:**

1. In `src/lib/csvExport.ts`, extract everything between the header push and the footer push (lines ~149-655) into a new `buildIncomeStatementRows(periodLabel, current, previous, deltas)` function returning `string[][]`. Remove the header (the caller adds it once).
2. `generateIncomeStatementCSV` becomes: header + `buildIncomeStatementRows(label, data.current, data.previous, data.deltas)` + footer. Behavior preserved.
3. New `generateMultiPeriodPLCSV(periods, rangeGap)` in `src/lib/financialExportHelpers.ts`:
   - Push header once
   - For each period, push `buildIncomeStatementRows(period.label, period.current, period.previous, period.inRangeDeltas)` (no inner footer)
   - Push the range-aggregated Data Quality footer once
   - Run all rows through `escapeCell` per current pattern

**`prev` payload for the multi-period case:** For the in-range delta (D-05), pass the immediately prior bucket's `current` as the `previous` argument. For the first bucket, pass an empty/zeroed `WeekData` shell — the row-builder must tolerate `prev` being all-zeros (current code already handles this; `String(0)` is a valid cell). To make the empty `prev_period_idr` and `delta_pct` actually empty (not "0"), special-case the first bucket: pass `previous` as zero-shell AND set a `firstInRange: true` flag, then skip emitting `prev_period_idr`/`delta_pct` cells (leave empty strings). Add this flag to `buildIncomeStatementRows` signature.

**Header note for multi-period file:** The first row should be the canonical 8-column header. Add a comment row immediately after stating "# Multi-period export — prev_period_idr compares against the immediately prior period within the file." Per CONTEXT.md `<specifics>` recommendation. This works because the comment row starts with `#` and has only one cell — Excel/Sheets will display it as a non-data row.

[VERIFIED current row builder structure via direct read of `csvExport.ts:145-700`]

---

## Section 6 — Pre-Flight Stats

**Idiomatic pattern in this codebase:** Index-bound `.collect().length`. No COUNT-aggregate primitive exists in Convex; `.collect()` materializes documents into memory but for narrow indexed scans on small ranges this is sub-100ms. No special pattern needed.

**Implementation:**

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

**Cost concern:** materializing 10k+ docs just to count is wasteful. **Optimization:** if the count concern matters, switch to a paginate-with-limit-1 + counter pattern, but this requires more code. **Recommend the simple approach first** — if profiling shows >500ms on realistic ranges, optimize then. The cost ceiling is bounded by D-16's soft warning threshold (10k lines ≈ ~2.5 MB read).

**`isLargeRange` flag** maps to UI-SPEC's amber warning Alert.

[VERIFIED pattern via `convex/reports/incomeStatement.ts` parallel `Promise.all` of indexed `.collect()` calls]

---

## Section 7 — Filename / Timezone Formatting

**`dateUtils.ts` exports cover everything needed:**

- `wibDateStrToUtcMs(dateStr)` — converts the `<input type="date">` value (a YYYY-MM-DD string in browser-local time, treated as WIB midnight) to UTC epoch ms for query args.
- `utcToWibDateStr(utcMs)` — converts an epoch ms to `YYYY-MM-DD` for the filename. Strip the dashes for the `YYYYMMDD` filename format: `utcToWibDateStr(periodStart).replace(/-/g, "")`.
- For the filename's "end" date, use `utcToWibDateStr(periodEnd - 1)` since `periodEnd` is exclusive — emit the inclusive last-day label.

**Filename helper:**
```typescript
function buildExportFilenames(periodStart: number, periodEnd: number, granularity: string) {
  const startStr = utcToWibDateStr(periodStart).replace(/-/g, "");
  const endStr = utcToWibDateStr(periodEnd - 1).replace(/-/g, "");
  return {
    transactions: `frollie-transactions-${startStr}-${endStr}.csv`,
    pl: `frollie-pl-summary-${startStr}-${endStr}-${granularity}.csv`,
  };
}
```

**Edge case:** `periodEnd - 1` for the inclusive label only works if `periodEnd` is at WIB midnight (exclusive end). The form always enforces this via `wibDateStrToUtcMs` + adding `+24h * 60 * 60 * 1000` for end inclusivity, OR uses two separate date inputs interpreted as `[start, end+1day)`. Plan the form's range-conversion explicitly.

[VERIFIED helpers via direct read of `src/lib/dateUtils.ts`]

---

## Validation Architecture

> Required by Nyquist Dimension 8 — feeds VALIDATION.md.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + convex-test 0.0.41 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm run test -- convex/reports/financialExport.test.ts src/lib/__tests__/financialExportHelpers.test.ts` |
| Full suite command | `npm run test` (runs all unit + integration) |
| E2E command | `npx playwright test tests/e2e/financial-data-export.spec.ts` |
| Build verification | `npm run build` (tsc + vite) — REQUIRED before merge per CLAUDE.md |
| Type check only | `npm run type-check` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIN-03 | Range filtering inclusive start, exclusive end | unit (convex-test) | `npm run test -- convex/reports/__tests__/financialExport.test.ts -t "range bounds"` | ❌ Wave 0 |
| FIN-03 | Role gate rejects kitchen + order_staff tokens | unit (convex-test) | `npm run test -- ... -t "role gate"` | ❌ Wave 0 |
| FIN-03 | Role gate accepts manager + admin tokens | unit (convex-test) | `npm run test -- ... -t "role gate accepts"` | ❌ Wave 0 |
| FIN-03 | Empty range returns valid CSV with header only | unit (convex-test + helper test) | `npm run test -- ... -t "empty range"` | ❌ Wave 0 |
| FIN-03 (D-04) | Reversal lines INCLUDED — original + reversal both appear | unit (convex-test) | `npm run test -- ... -t "reversal lines included"` | ❌ Wave 0 |
| FIN-03 (D-14) | Formula-injection sanitization on description, created_by | unit (helper test) | `npm run test -- src/lib/__tests__/financialExportHelpers.test.ts -t "escapeCell applied"` | ❌ Wave 0 |
| FIN-03 (D-15) | IDR amounts integer-only (no decimals/separators) | unit (helper test) | `npm run test -- ... -t "integer rupiah"` | ❌ Wave 0 |
| FIN-03 (D-01) | debit/credit mutually exclusive per row | unit (convex-test) | `npm run test -- ... -t "debit credit mutex"` | ❌ Wave 0 |
| FIN-03 (D-02) | Order = entryDate ASC, entryNumber ASC, line natural order | unit (convex-test) | `npm run test -- ... -t "ordering"` | ❌ Wave 0 |
| FIN-04 (D-05) | 13 weekly buckets for quarterly range | unit (helper test) | `npm run test -- ... -t "buildPeriodBuckets weekly"` | ❌ Wave 0 |
| FIN-04 (D-05) | First period prev_period_idr / delta_pct empty | unit (helper test) | `npm run test -- ... -t "first period no delta"` | ❌ Wave 0 |
| FIN-04 (D-06) | Granularity=monthly produces N buckets for N-month range | unit (helper test) | `npm run test -- ... -t "buildPeriodBuckets monthly"` | ❌ Wave 0 |
| FIN-04 (D-06) | Granularity=custom produces single bucket | unit (helper test) | `npm run test -- ... -t "buildPeriodBuckets custom"` | ❌ Wave 0 |
| FIN-04 (D-07) | COGS override (Phase 70) honored in P&L summary | unit (convex-test, regression) | `npm run test -- ... -t "COGS override"` | ❌ Wave 0 |
| FIN-04 (D-08) | Range-wide footer once at bottom (not per-period) | unit (helper test) | `npm run test -- ... -t "footer once"` | ❌ Wave 0 |
| FIN-03 (D-12) | Preflight returns journalLineCount, revenueRowCount, periodCount | unit (convex-test) | `npm run test -- ... -t "preflight stats"` | ❌ Wave 0 |
| FIN-03 (D-16) | Preflight `isLargeRange === true` for >10k lines | unit (convex-test) | `npm run test -- ... -t "large range warning"` | ❌ Wave 0 |
| Frontend (UI-SPEC) | Filename generation for various date ranges | unit | `npm run test -- src/lib/__tests__/financialExportHelpers.test.ts -t "buildExportFilenames"` | ❌ Wave 0 |
| Frontend (UI-SPEC) | Date preset → range conversion (Last week / month / quarter / YTD) | unit | `npm run test -- ... -t "preset ranges"` | ❌ Wave 0 |
| Frontend (UI-SPEC) | Granularity selector hidden when P&L unchecked | unit (RTL) | `npm run test -- src/pages/__tests__/FinancialExportPage.test.tsx -t "granularity hidden"` | ❌ Wave 0 |
| Frontend (UI-SPEC) | At-least-one export type validates form submit | unit (RTL) | `npm run test -- ... -t "at least one type"` | ❌ Wave 0 |
| FIN-03/04 happy-path | Navigate → set range → click Generate → assert downloads triggered | E2E (Playwright) | `npx playwright test tests/e2e/financial-data-export.spec.ts -g "happy path"` | ❌ Wave 0 |
| FIN-03 (D-13) | Role gate redirect for kitchen user | E2E (Playwright) | `npx playwright test ... -g "role gate redirect"` | ❌ Wave 0 |
| FIN-03 (D-14) | Manual UAT — open CSV in Excel + Sheets, no formula execution | manual | (UAT checklist) | N/A |
| FIN-03 (D-15) | Manual UAT — IDR renders as integer in Excel | manual | (UAT checklist) | N/A |

### Sampling Rate

- **Per task commit:** `npm run test -- convex/reports/__tests__/financialExport.test.ts src/lib/__tests__/financialExportHelpers.test.ts` (≤ 10s)
- **Per wave merge:** `npm run test` (full Vitest suite ~ 60s) + `npm run type-check` + `npm run build`
- **Phase gate:** Full suite green + Playwright happy-path green + manual UAT signed before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `convex/reports/__tests__/financialExport.test.ts` — covers FIN-03 D-01..D-04, D-12, D-13, D-14, D-16 + FIN-04 D-05 D-07 (regression)
- [ ] `src/lib/__tests__/financialExportHelpers.test.ts` — covers FIN-04 D-05..D-08 helper logic + FIN-03 D-14 D-15 sanitization/integer formatting
- [ ] `src/pages/__tests__/FinancialExportPage.test.tsx` — covers UI-SPEC interaction states (granularity hidden, form validation, filename preview)
- [ ] `tests/e2e/financial-data-export.spec.ts` — happy-path + role-gate redirect (Playwright)
- [ ] `.planning/phases/76-financial-data-export/UAT.md` — manual checks for Excel/Sheets rendering, IDR formatting, no formula execution from `=SUM(...)` test row

No framework install needed — all test infrastructure already present. No new fixtures/conftest required beyond seeded JE rows in convex-test (pattern established by `incomeStatement-capex.test.ts`).

---

## Edge Cases & Landmines

| # | Edge Case | Mitigation |
|---|-----------|------------|
| 1 | Empty date range (start > end) | Frontend validates: Generate button disabled with tooltip "End date must be on or after start date." (UI-SPEC line 131). Backend defensively returns empty rows + valid CSV header. |
| 2 | Date range spanning year boundary | `buildPeriodBuckets` weekly/monthly arithmetic uses `wibMidnightToUtc(year, month + N, 1)` — JS `Date.UTC` correctly rolls month 12 → year+1, month 0. Verified by date-fns convention used elsewhere. Add explicit test for Dec 28 → Jan 4 weekly bucket. |
| 3 | DST — Indonesia does NOT observe DST | All WIB conversions are pure `+7h` offset. Safe. |
| 4 | JE description containing `=`, `+`, `-`, `@`, tab, CR | `escapeCell` prefix-quotes [VERIFIED: `csvExport.ts:707, 724`]. Test seeds a JE with `description="=SUM(A1:A10)"` and asserts the exported cell starts with `'=SUM(...)`. |
| 5 | JE description containing `,` or `"` or `\n` | `escapeCell` RFC-4180 escapes [VERIFIED: same code]. |
| 6 | Very large range (>10k lines) | Soft warning per D-16. No blocking. Convex `.collect()` still well within 16 MB limit at 32k lines (~8 MB). At >50k consider phase 2 work (pagination); not in scope. |
| 7 | User changes role mid-session | `requireRole(ctx, args.token, ["manager","admin"])` re-checks every call. ProtectedRoute re-evaluates on auth state change. Server-side enforcement is the gate that matters. |
| 8 | Multiple rapid Generate clicks | Disable button while generating ("Generating…" loading state per UI-SPEC line 132). Button re-enables in `finally`. Sufficient for single-user admin tool. |
| 9 | Browser pop-up blocker on multi-file download | Two `downloadCSV` calls within the same click handler share the user-gesture context — most browsers permit. To be safe, sequence: first download fires immediately, second with 100ms `setTimeout` (well under any "automatic download" threshold). Document in UAT. Worst case: the second prompts a browser permission popup; user grants once and subsequent exports work. |
| 10 | JE with `createdBy` user since deleted/deactivated | `ctx.db.get(userId)` returns `null`. Map `null` to `"<unknown>"` in CSV. Don't crash. |
| 11 | JE description containing only whitespace or empty string | Pass through verbatim; `escapeCell("")` returns `""`. CSV cell shows empty. |
| 12 | Manual JE with no `sourceId` (D-01 says "source_doc_type:source_doc_id") | `sourceType="manual"`, `sourceId=undefined`. CSV emits `source_doc_type=manual`, `source_doc_id=""`. |
| 13 | Range where `journalEntries.date` and `journalEntryLines.entryDate` disagree | Schema comment line 1978 says `entryDate denormalized from parent.date`. The journal engine MUST keep these in sync; if they drift it's a Phase 49 bug, not a Phase 76 bug. Plan does NOT add a consistency check (out of scope per "no data health"). |
| 14 | First bucket of multi-period export has no prev | Helper sets `firstInRange: true` flag → row-builder emits empty `prev_period_idr`/`delta_pct`. Tested. |
| 15 | Single-period range (e.g., 1-day custom with weekly granularity) | `buildPeriodBuckets("weekly", 1-day-range)` returns one truncated bucket. Period label = `2026-04-19 to 2026-04-19 (partial)`. No prev. Valid output. |
| 16 | User selects only "Raw transactions" — no granularity required | Filename for P&L is not generated. Only one download. Toast says "Downloaded transactions CSV." (UI-SPEC line 134). |
| 17 | User selects only "P&L summary" — granularity is required | Form ensures granularity field is exposed. If user somehow submits with no granularity, frontend defaults to "weekly" per D-06. |
| 18 | `journalEntryLines._creationTime` doesn't preserve debit-then-credit visual order | Sort fallback: `creditAmount === 0 ? 0 : 1`. Cheap, deterministic. |
| 19 | Large form retypes triggering excessive preflight queries | Debounce date input → preflight by 300ms; existing pattern in `BankReconciliationPage.tsx`. |
| 20 | Partial month bucket at range start (e.g., range starts Apr 13 with monthly granularity) | First bucket is `[Apr 13, May 1)`, labelled `2026-04 (partial)`. Phase 75's `aggregateWeek` handles arbitrary `[start, end)` half-open intervals correctly per its existing usage; verified by `getIncomeStatement` query at `incomeStatement.ts:927`. |

---

## Dependencies

**No new npm dependencies.** Every helper, primitive, and test runner exists already.

[VERIFIED via `package.json` — `xlsx` is installed for bank reconciliation (read path) but NOT used in this phase per CSV-only scope. Per CLAUDE.md pitfall #15, `xlsx` MUST stay at SheetJS CDN version `0.20.3`.]

---

## Performance Considerations

| Concern | Profile | Mitigation |
|---------|---------|------------|
| 52 `aggregateWeek` calls for 1-year weekly range | ~52 × ~500ms = ~26s worst case | D-17 deems acceptable. Each call is sub-second per Phase 75 verification. If user reports slowness, batch-fetch all revenue+JE+consignment up front, then per-bucket pure aggregation — additive optimization, NOT in this phase. |
| Raw export at 10k+ lines | ~10k docs × ~250 bytes = ~2.5 MB → ~150ms `.collect()` + 1-2k batch get round trips | Acceptable. `Promise.all` parallelism caps the round-trip cost at ~1-2s for typical batches. Soft warning at 10k. |
| CSV blob size at 10k rows | ~10k × ~200 bytes = ~2 MB | Browsers handle 100 MB+ blobs fine. `URL.createObjectURL` + `revokeObjectURL` already in `downloadCSV`. |
| Pre-flight materializing docs to count | ~2.5 MB read for a large range, on every date change | Debounce to 300ms; profile in production. If problematic, the optimization is to add a Convex aggregate primitive — out of scope. |

**Bottom line:** Performance is acceptable at expected scale (Frollie ~50 JEs/day = ~1500/month = ~18k/year). No engineering work required to hit roadmap success criteria.

---

## Common Pitfalls

### Pitfall 1: Schema-naming drift between CONTEXT.md and reality
**What goes wrong:** CONTEXT.md says `entryType`, `entryDate`, `glAccounts`, `debit`, `credit`. Real schema uses `sourceType`, `date`, `accounts`, `debitAmount`, `creditAmount`.
**Why it happens:** CONTEXT.md was written from memory/older draft.
**How to avoid:** Plans + executor reference §"Schema name corrections" table above. Type errors will catch most mismatches; reviewer catches the rest.
**Warning signs:** TypeScript error "property does not exist on type Doc<'journalEntries'>". Fix: use the corrected name.

### Pitfall 2: Reusing `fetchAndAggregate` "previous" period as in-range delta
**What goes wrong:** `fetchAndAggregate` computes `previousPeriod` as an equal-length lookback BEFORE the current bucket. D-05 wants in-range delta (immediately prior bucket within the export).
**Why it happens:** Tempting to call `getIncomeStatement` per bucket and use its `data.deltas`.
**How to avoid:** Call `fetchAndAggregate` per bucket; ignore its `previousPeriod`/`deltas`; compute in-range delta in the helper using `periods[i-1].current` as the "previous" for `periods[i]`.
**Warning signs:** First-period deltas in CSV equal the legacy lookback delta instead of being empty.

### Pitfall 3: Hard-coding `sourceType` literal list in CSV
**What goes wrong:** Schema's `sourceType` union has ~12 literals (line 1948-1961). Listing them in a CSV mapping locks in coupling. New types added in future phases break the export silently.
**How to avoid:** Emit `sourceType` verbatim as `je_type`. No mapping. Accountants read the value as-is.
**Warning signs:** A new JE type added in a later phase doesn't appear in exports OR appears as "unknown".

### Pitfall 4: `<input type="date">` value interpreted in browser-local time
**What goes wrong:** `<input type="date">` returns a YYYY-MM-DD string. `new Date(str)` interprets it as UTC midnight, NOT WIB midnight. Off by 7h → wrong day in WIB.
**How to avoid:** Use `wibDateStrToUtcMs(str)` from `dateUtils.ts:65` — already does the right thing.
**Warning signs:** Jakarta-timezone user picks Apr 19 in the date input; export labels file as Apr 18 or Apr 19 depending on time of day.

### Pitfall 5: `escapeCell` skipped on header rows
**What goes wrong:** Header row contains static, safe strings, so a developer skips `escapeCell` for "performance." Then someone changes a header to contain a `,` or `=` and CSV breaks.
**How to avoid:** Always run every row through `escapeCell`, including header. Cost is negligible.
**Warning signs:** CSV with a column header containing comma renders as 2 columns in Excel.

### Pitfall 6: Multi-file download blocked by browser
**What goes wrong:** Some browsers (Brave, Firefox with strict settings) block the second sequential download as "automated."
**How to avoid:** First download fires synchronously in click handler. Second wrapped in 100ms `setTimeout`. If still blocked, the user sees a permission prompt — UAT documents this.
**Warning signs:** User reports "only one file downloaded."

---

## Code Examples

### Verified pattern: Index range scan + batch-fetch (raw transactions)

Source: `convex/reports/incomeStatement.ts:643-647` (existing project code)

```typescript
ctx.db.query("journalEntryLines")
  .withIndex("by_entryDate", (q) => q.gte("entryDate", currentStart).lt("entryDate", currentEnd))
  .collect();
```

### Verified pattern: `escapeCell` formula injection prevention

Source: `src/lib/csvExport.ts:723-729` (existing project code)

```typescript
export function escapeCell(value: string): string {
  const sanitized = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  if (sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n")) {
    return '"' + sanitized.replace(/"/g, '""') + '"';
  }
  return sanitized;
}
```

### Verified pattern: `requireRole` gate

Source: `convex/lib/auth.ts:128-148` (existing project code)

```typescript
export const myProtectedQuery = query({
  args: { token: v.string(), /* ... */ },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    // ... query body
  },
});
```

### Verified pattern: `<ProtectedRoute>` with role list

Source: `src/components/auth/ProtectedRoute.tsx:6-11` (existing project code)

```tsx
<Route
  path="/financials/export"
  element={
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <FinancialExportPage />
    </ProtectedRoute>
  }
/>
```

### Verified pattern: One-shot Convex query (NOT useQuery)

Source: `BankReconciliationPage.tsx` (existing project code; pattern referenced in UI-SPEC)

```typescript
const convex = useConvex();
const handleGenerate = async () => {
  setLoading(true);
  try {
    const rows = await convex.query(api.reports.financialExport.getRawTransactionsExport, {
      periodStart, periodEnd, token,
    });
    const csv = generateRawTransactionsCSV(rows);
    downloadCSV(csv, filename);
  } finally {
    setLoading(false);
  }
};
```

---

## State of the Art

No state-of-the-art shifts relevant to this phase. CSV is a 50-year-old format; formula-injection defense is a known CVE class with the codebase already mitigated. Convex query patterns are stable.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-line `ctx.db.get()` (N+1) | Set-dedupe + `Promise.all` batch | Phase 49+ | Already standard in this codebase |
| Hand-rolled CSV escape | `escapeCell` shared sanitizer | Phase 75 D-16 | Already standard |

---

## Project Constraints (from CLAUDE.md)

- **Pitfall #4 — Real-time updates:** Convex queries auto-update; the export page's pre-flight `useQuery` will reactively refresh when new JEs are posted. This is desired (not a bug).
- **Pitfall #8 — No dynamic imports in Convex:** All helpers in `financialExport.ts` use static `import { ... } from "..."`. No dynamic `import()`.
- **Pitfall #10 — Token on protected queries:** Every new query MUST take `token: v.string()`, call `requireRole`, and NOT pass `token` to `ctx.db.*`.
- **Pitfall #14 — Phase directory ≤ 50 chars:** `76-financial-data-export` = 26 chars ✓.
- **Pitfall #15 — xlsx via SheetJS CDN:** N/A this phase (CSV-only). If XLSX added later, install per CDN URL — never npm.
- **CHANGELOG.md update REQUIRED after merge.** Plus `docs/API_REFERENCE.md`, `docs/ROADMAP.md` (mark FIN-03 + FIN-04 complete), `docs/FILE_MAP.md` (new route).
- **Branch-per-phase rule:** `feature/76-financial-data-export` already created (`gsd/phase-76-financial-data-export` is the GSD-prefixed branch from current git status). Plan-checker will verify.
- **`npm run build` MUST pass before merge.** TypeScript strict mode catches the schema-naming corrections automatically.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `journalEntryLines._creationTime` reliably preserves debits-before-credits insertion order | §3 Raw query, D-02 ordering | LOW — fallback sort `creditAmount === 0 ? 0 : 1` is deterministic. Verify in convex-test. |
| A2 | At ~10k journal lines, Convex `.collect()` completes in <500ms | §3, §6 | MEDIUM — if pre-flight is slow, debounce + spinner is sufficient UX; not a correctness risk. |
| A3 | Multi-file download (sequential `downloadCSV` calls) works without ZIP in modern browsers | §9 edge case 9, UAT | MEDIUM — requires UAT confirmation. Fallback: 100ms setTimeout between calls. |
| A4 | Frollie's bookkeepers find `sourceType` literal values (`expense_approval`, `bank_statement_reversal`, etc.) readable | §1 stack table, je_type column | LOW — values are descriptive English snake_case. If unreadable, cosmetic post-processing in helper is trivial. |
| A5 | Exporting `fetchAndAggregate` from `incomeStatement.ts` doesn't break the existing `getWeeklyIncomeStatement` / `getIncomeStatement` queries | §1, §5 | LOW — adding `export` keyword is non-breaking. Existing tests verify. |
| A6 | The frontend can call two `downloadCSV` triggers within a single click handler without explicit user gesture loss | §9 edge case 9 | MEDIUM — modern Chrome/Edge/Safari all permit. Brave/Firefox-strict may prompt. UAT confirms. |

---

## Open Questions

None of significance. CONTEXT.md is exhaustive and the technical landscape is well-mapped. Two micro-questions for the planner:

1. **Should `fetchAndAggregate` be exported from `incomeStatement.ts` (option A) or moved to a shared `_incomeStatementCore.ts` (option B)?** Recommend A (1-line change, no churn). Plan-checker may prefer B for cleaner module boundaries.

2. **Period label format for partial buckets — `(partial)` suffix or full date range?** UI-SPEC doesn't speak to it. Recommend `2026-W15 (partial)` for full-bucket consistency; full date range is less scannable. Defer to executor's taste.

---

## Environment Availability

> Skipped — Phase 76 is purely code/config (no external tools, no new services, no runtimes beyond what's already running for Convex + Vite).

---

## Security Domain

> Required — `security_enforcement` not explicitly disabled in `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing PIN + session token system; `requireRole` gate [VERIFIED: `convex/lib/auth.ts`] |
| V3 Session Management | no | No session changes; reuse existing token validation |
| V4 Access Control | yes | Two-layer gate: `<ProtectedRoute allowedRoles>` + `requireRole(ctx, token, [...])`; both REQUIRED per D-13 |
| V5 Input Validation | yes | Convex `v.number()` validators on `periodStart`/`periodEnd`; `v.union(v.literal(...))` on `granularity`; client-side date validation |
| V6 Cryptography | no | No crypto operations in this phase |
| V12 Files / Resources | yes (CSV-specific) | `escapeCell` formula-injection prevention [VERIFIED: `csvExport.ts:723`] — CWE-1236 |
| V13 API & Web Service | yes | Convex queries with explicit role gate; no public endpoints |

### Known Threat Patterns for {CSV export, Convex query, React form}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSV formula injection (CWE-1236) | Tampering | `escapeCell` prefix-quotes `=`, `+`, `-`, `@`, tab, CR [VERIFIED] |
| RFC-4180 escape evasion | Tampering | `escapeCell` quotes cells with `,`, `"`, `\n` [VERIFIED] |
| Privilege escalation via missing role check | Elevation | `requireRole` REQUIRED at every query entry — D-13 mandates double-layer |
| Session hijack to unauthorized role | Spoofing | Session expiry checked in `getSessionUserWithReason` [VERIFIED: `auth.ts:107`] |
| PII exfiltration via export | Information Disclosure | Out of scope: JE data does not contain PII (no customer names, no PINs, no emails). `created_by` resolves to user.name (display name, not email/phone) — confirm by reading `users` schema if any concern. |
| DoS via huge date range | DoS | D-16 soft warning at >10k; no hard cap. Convex's per-query 16 MB limit acts as a hard ceiling at ~64k lines. |
| XSS in description rendering on the export page | Tampering | Page renders preflight stats, NOT JE descriptions. No XSS surface. CSV downloads — Excel/Sheets sandbox handles content. |

**No new ASVS risks introduced.** All controls are reused from established patterns.

---

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` — Direct read of journalEntries (line 1944-1975), journalEntryLines (1979-1989), accounts (1809-1829), expenses (1832-1838) [VERIFIED]
- `convex/reports/incomeStatement.ts` — Direct read of `aggregateWeek` (line 210), `fetchAndAggregate` (line 575), `getWeeklyIncomeStatement` (901), `getIncomeStatement` (927) [VERIFIED]
- `convex/lib/periodRange.ts` — Direct read of `calculateWeekRange` (201), `calculateMonthRange` (149), `calculateCustomRange` (172), date helpers (217-258) [VERIFIED]
- `convex/lib/journalHelpers.ts` — Direct read of `aggregateJournalLines` [VERIFIED]
- `convex/lib/auth.ts` — Direct read of `requireRole` (128) [VERIFIED]
- `src/lib/csvExport.ts` — Direct read of `generateIncomeStatementCSV` (145), `escapeCell` (723), `downloadCSV` (732) [VERIFIED]
- `src/lib/dateUtils.ts` — Direct read of all WIB helpers [VERIFIED]
- `src/lib/staffPerformanceExport.ts` — Direct read for prior-art CSV pattern [VERIFIED]
- `src/components/auth/ProtectedRoute.tsx` — Direct read confirms `allowedRoles` (NOT `roles`) prop [VERIFIED]
- `src/lib/types.ts` — Direct read of `ROLE_PERMISSIONS` [VERIFIED]
- `src/pages/FinancialStatement.tsx` — Direct read of header, action button placement [VERIFIED]
- `src/App.tsx` — Direct read of `/financials` route declaration (line 624-631) [VERIFIED]
- `.planning/phases/76-financial-data-export/76-CONTEXT.md` — Source of all D-01..D-17 [CITED verbatim]
- `.planning/phases/76-financial-data-export/76-UI-SPEC.md` — Source of all UI-SPEC references [CITED]
- `.planning/REQUIREMENTS.md` — FIN-03, FIN-04 [CITED]
- `package.json` — Verified vitest 4.0.18, convex-test 0.0.41, playwright 1.58.2 [VERIFIED]
- `.planning/config.json` — Verified workflow flags and convex seed functions [VERIFIED]

### Secondary (MEDIUM confidence)
- Convex `.collect()` size limits (~16 MB / 32k docs) — based on consistent project usage at week-scale; no official Convex doc cited [INFERRED from working precedent in `convex/reports/incomeStatement.ts`]

### Tertiary (LOW confidence)
- Browser multi-file download behavior across all browsers — Edge case 9. UAT confirms. [ASSUMED based on widely-deployed pattern]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every helper exists in repo, verified by direct read
- Architecture: HIGH — pattern is "thin layer over existing aggregator"; D-07 forbids deviation
- Pitfalls: HIGH — schema-naming corrections from direct schema read; CSV injection already mitigated
- Validation Architecture: HIGH — test infrastructure already in place; mappings are mechanical
- Edge cases: MEDIUM — most known; multi-file download in some browsers is the residual unknown

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 (30 days; project moves fast but no library churn expected on this slice)

---

## RESEARCH COMPLETE

**Phase:** 76 — Financial Data Export
**Confidence:** HIGH

### Key Findings

1. **Zero new dependencies, zero new shadcn components, zero new indexes.** Every primitive needed already ships in repo. Verified by direct file reads.
2. **CONTEXT.md has schema-naming drift** — `entryType`/`entryDate`/`glAccounts`/`debit`/`credit` are wrong. Real names: `sourceType`/`date`/`accounts`/`debitAmount`/`creditAmount`. Plan-checker MUST enforce corrected names. Full mapping table provided.
3. **`<ProtectedRoute>` prop is `allowedRoles`, NOT `roles`** as CONTEXT.md D-13 says. Direct read of component confirms.
4. **`calculateMonthRange` already exists** at `convex/lib/periodRange.ts:149` — CONTEXT.md's open question is moot.
5. **Recommended split:** Single backend file (`convex/reports/financialExport.ts`), single page (`FinancialExportPage.tsx`) + one helper file (`financialExportHelpers.ts`). Refactor `generateIncomeStatementCSV` to extract `buildIncomeStatementRows` for reuse — single-period caller behavior preserved.
6. **`fetchAndAggregate` from `incomeStatement.ts` should be exported** (1-line change) so the multi-period loop reuses Phase 75's full P&L stack with zero duplication. Add an `includePrevious: false` parameter to skip wasted I/O when in-range deltas are computed in the helper.
7. **In-range delta semantics (D-05) require special handling** — first bucket gets empty `prev_period_idr`/`delta_pct`. Don't reuse `fetchAndAggregate`'s built-in `previousPeriod`/`deltas`.

### File Created
`.planning/phases/76-financial-data-export/76-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All helpers verified in-repo via direct read |
| Architecture | HIGH | Thin-layer pattern; D-07 locks reuse |
| Pitfalls | HIGH | Schema-name table eliminates the highest-risk drift |
| Validation Architecture | HIGH | Test infrastructure complete; mappings mechanical |
| Performance | HIGH | Phase 75 already validated `aggregateWeek` sub-second |
| Edge cases | MEDIUM | Multi-file browser download is the residual unknown — UAT covers |

### Open Questions
1. `fetchAndAggregate` re-export vs. move to shared file (recommend re-export).
2. Partial-bucket label format — `(partial)` suffix recommended; defer to executor taste.

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
