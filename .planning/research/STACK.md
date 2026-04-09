# Technology Stack

**Project:** Frollie Recipe Master v2.0 — Financial Management & Data Quality
**Researched:** 2026-04-07
**Confidence:** HIGH (verified against existing codebase + npm registry)

## Existing Stack (DO NOT CHANGE)

These are already installed and proven across 10 milestones. No version changes needed.

| Technology | Version | Purpose |
|------------|---------|---------|
| Convex | ^1.31.7 | Serverless backend + real-time DB |
| React | ^19.2.0 | UI framework |
| TypeScript | ~5.9.3 | Type safety |
| Vite | ^7.2.4 | Build tooling |
| Tailwind CSS | ^4.1.18 | Styling |
| shadcn/ui + Radix | various | Component library |
| Recharts | ^3.7.0 | Charts (P&L visualizations) |
| PapaParse | ^5.5.3 | CSV parsing (already used for expense import) |
| date-fns | ^4.1.0 | Date manipulation + Indonesian locale |
| Lucide React | ^0.564.0 | Icons |
| Sonner | ^2.0.7 | Toast notifications |
| Framer Motion | ^11.15.0 | Animations |
| Vitest | ^4.0.18 | Testing |

## New Libraries Needed

**Answer: ZERO new npm dependencies required.**

Every v2.0 feature can be built with the existing stack. Here is the rationale per feature:

### 1. Full P&L with Per-Channel Breakdown & FCF

**Stack needed:** Nothing new.

The existing `convex/reports/incomeStatement.ts` already computes Revenue -> Net Revenue -> COGS -> Gross Profit -> OpEx -> EBIT -> EBITDA -> Net Income with per-channel breakdown. The v2.0 extensions are:

- **FCF calculation:** `FCF = Net Income + Depreciation/Amortization - CapEx`. Depreciation already exists in the P&L query (`depreciationAmount`, `amortizationAmount`). CapEx can be derived from `fixedAssets` table (acquisitions in period). This is pure arithmetic on existing data — no library needed.
- **Per-channel breakdown:** Already done. The `channels: ChannelData[]` structure already provides per-source gross/net/COGS/commission.

### 2. Bank Statement Reconciliation (CSV Upload, Auto-Matching)

**Stack needed:** PapaParse (already installed), custom matching logic.

| Concern | Solution | Why Not a Library |
|---------|----------|-------------------|
| CSV parsing | PapaParse ^5.5.3 (installed) | Already used in `csvImportValidation.ts` for expense import |
| BCA/Mandiri format detection | Custom header-sniffing logic | Indonesian bank CSV formats vary (Tanggal/Keterangan/Debit/Kredit/Saldo vs Date/Description/Debit/Credit/Balance). ~30 lines of header mapping per bank, not worth a dependency |
| Auto-matching algorithm | Custom scored matcher | See algorithm design below |
| Fuzzy string matching | Built-in `String.prototype.includes` + normalization | Bank descriptions are short; Levenshtein/Dice coefficients are overkill. Normalize (lowercase, strip whitespace, remove special chars) then substring match is sufficient for Indonesian bank descriptions |

**Reconciliation matching algorithm (build in-house, ~150 LOC):**

```
Score = amount_score(0.5) + date_score(0.3) + description_score(0.2)

amount_score:
  - Exact match (to IDR integer): 1.0
  - Within 1% (bank fees): 0.7
  - Otherwise: 0.0

date_score:
  - Same day: 1.0
  - +/- 1 day: 0.8
  - +/- 2-3 days: 0.5
  - Otherwise: 0.0

description_score:
  - Contains order number (e.g., "0129-001"): 1.0
  - Contains customer name or vendor: 0.6
  - Otherwise: 0.0
```

Match candidates from: `journalEntryLines` (all journal entries), `externalRevenue` (platform payouts), `expenses` (expense records), `reimbursementBatches` (reimbursement transfers), `orders` (direct sale payments). Threshold >= 0.7 for auto-match suggestion.

**Why NOT use `string-similarity` or `fuse.js`:**
- Bank reconciliation in IDR operates on structured data (amounts, dates, short descriptions), not free-text search
- The matching is amount-primary, description-secondary — a weighted scorer is trivial to build
- Adding dependencies for 20 lines of string comparison is unnecessary
- Avoids another package to audit for security

### 3. Staff Attendance (Clock-In/Out) with Per-Staff Production Tracking

**Stack needed:** Nothing new.

Attendance is a simple Convex table pattern:

```typescript
// New table: staffAttendance
{
  userId: v.id("users"),
  clockIn: v.number(),      // UTC epoch ms
  clockOut: v.optional(v.number()),  // null = still clocked in
  shiftDate: v.number(),    // WIB midnight epoch for indexing
}
```

- **Time display:** `dateUtils.ts` already has `utcToWibTimeStr()` and `formatDateTimeId()` for WIB conversion
- **Per-staff production tracking:** Already exists via `productionLog` table which records `chefId`. The existing `StaffPerformance.tsx` page already aggregates per-staff production (balls, grams, waste). Attendance just adds hours-worked context
- **Monthly summary:** `date-fns` (installed) provides `startOfMonth`/`endOfMonth` for period queries. Convex index on `[userId, shiftDate]` gives O(log n) lookups

### 4. Data Health / Integrity Checks Dashboard

**Stack needed:** Nothing new.

The codebase already has `convex/integrityChecks/` (weekly production count verification). The v2.0 Data Health page expands this pattern:

| Check | Data Source | Implementation |
|-------|-------------|----------------|
| Revenue completeness | `externalRevenue` vs `orders` | Convex query: count orders with `status=Complete` not in externalRevenue |
| COGS coverage | `menuProducts.unitCost` | Convex query: count where `unitCost === 0` |
| Journal balance | `journalEntryLines` | Sum all debits vs credits per entry — must equal |
| Bank reconciliation status | New `bankStatementRows` table | Count unmatched rows |
| Expense receipts | `expenses` table | Count where `receiptUrl` is missing and `status !== "draft"` |

All checks are Convex queries aggregating existing tables. No external libraries needed — this is database reads + arithmetic.

### 5. Financial Data Export (Raw Transactions + P&L Summary)

**Stack needed:** Nothing new.

The codebase already has two robust CSV export patterns:
- `src/lib/csvExport.ts`: Full P&L CSV export with formula injection protection, cell escaping, `downloadCSV()` browser trigger
- `src/lib/staffPerformanceExport.ts`: Per-staff production CSV

The v2.0 export extends these patterns:
- **Raw transaction export:** Query `journalEntryLines` with date range, format with existing `escapeCell()` + `downloadCSV()` helpers
- **P&L summary export:** Already exists in `csvExport.ts` — extend to include FCF row

**Why NOT use `xlsx` or `exceljs`:**
- CSV is the stated requirement in PROJECT.md
- The existing CSV export infrastructure is proven and handles edge cases (formula injection, unicode, cell quoting)
- Adding Excel libraries would increase bundle size ~500KB for no stated requirement

### 6. COGS Override Per Product

**Stack needed:** Nothing new.

This is a single optional field on `menuProducts` table:

```typescript
// Add to menuProducts schema:
cogsOverride: v.optional(v.number()),  // IDR per unit, bypasses BOM calc when set
```

The cost resolution logic in `convex/lib/costCalculator.ts` (`buildProductCOGSMap()`) adds one early-return check: if `cogsOverride` is set, use it instead of computing from BOM. ~5 lines of logic change.

## Financial Precision Strategy

**IDR is a zero-decimal currency.** All amounts in the codebase are already stored and computed as JavaScript integers (whole IDR values). This is confirmed by:

- `formatCurrency()` in `utils.ts`: `minimumFractionDigits: 0, maximumFractionDigits: 0`
- All `v.number()` fields in schema store IDR as integers
- `Math.round()` used at calculation boundaries (e.g., `consignment/helpers.ts`, `lifetimeHelpers.ts`)

**No precision library needed.** Unlike USD/EUR (which need cent-level precision and libraries like `currency.js` or `Decimal.js`), IDR's smallest unit is Rp 1. JavaScript's safe integer range (2^53) supports values up to ~9 quadrillion IDR — well beyond any realistic business amount. The existing `Math.round()` at computation boundaries pattern is correct and sufficient.

**Recommendation:** Continue using `Math.round()` for any derived calculations (margins, averages). Store all monetary values as integers. This is what the codebase already does consistently.

## What NOT to Add

| Library | Why NOT |
|---------|---------|
| `string-similarity` / `fuse.js` | Bank reconciliation matching is amount-primary with structured data; substring matching on normalized descriptions is sufficient |
| `currency.js` / `Decimal.js` / `dinero.js` | IDR is zero-decimal; JavaScript integers are precise for all IDR calculations |
| `xlsx` / `exceljs` | CSV is the stated export format; existing CSV infrastructure handles it; Excel adds ~500KB bundle |
| `moment` / `luxon` | `date-fns` (installed) covers all date needs including Indonesian locale |
| `zod` / `yup` | Convex validators (`v.string()`, `v.number()`) handle schema validation; PapaParse + custom validation handles CSV rows (already proven in `csvImportValidation.ts`) |
| `react-table` / `@tanstack/table` | Existing table patterns with shadcn/ui `<Table>` components work fine; no complex table features needed |
| `chart.js` | Recharts (installed) covers all chart needs |
| `node-cron` | Convex has built-in `crons.ts` for scheduled functions |

## Installation

```bash
# No new packages to install.
# All v2.0 features build on the existing stack.
```

## Integration Points with Existing Convex Stack

### Bank Reconciliation Schema Design

New tables (all in Convex):

```typescript
bankStatements: defineTable({
  bankName: v.string(),           // "BCA" | "Mandiri"
  accountNumber: v.string(),
  uploadedBy: v.id("users"),
  uploadedAt: v.number(),
  fileName: v.string(),
  rowCount: v.number(),
  matchedCount: v.number(),
  periodStart: v.number(),        // earliest transaction date
  periodEnd: v.number(),          // latest transaction date
}).index("by_date", ["uploadedAt"]),

bankStatementRows: defineTable({
  statementId: v.id("bankStatements"),
  transactionDate: v.number(),    // WIB epoch
  description: v.string(),
  debitAmount: v.number(),        // IDR, 0 if credit
  creditAmount: v.number(),       // IDR, 0 if debit
  balance: v.number(),            // running balance
  rowIndex: v.number(),           // original CSV row order
  matchStatus: v.union(
    v.literal("unmatched"),
    v.literal("auto_matched"),
    v.literal("manual_matched"),
    v.literal("ignored")
  ),
  matchedJournalEntryId: v.optional(v.id("journalEntries")),
  matchedEntityType: v.optional(v.string()),  // "order" | "expense" | "reimbursement" | "revenue"
  matchedEntityId: v.optional(v.string()),
  matchConfidence: v.optional(v.number()),     // 0.0-1.0 score
  matchedBy: v.optional(v.id("users")),        // who confirmed manual match
  matchedAt: v.optional(v.number()),
}).index("by_statement", ["statementId"])
  .index("by_status", ["matchStatus"])
  .index("by_date", ["transactionDate"]),
```

### Attendance Schema Design

```typescript
staffAttendance: defineTable({
  userId: v.id("users"),
  shiftDate: v.number(),          // WIB midnight epoch
  clockIn: v.number(),            // UTC epoch ms
  clockOut: v.optional(v.number()),
  totalMinutes: v.optional(v.number()),  // computed on clock-out
  notes: v.optional(v.string()),
}).index("by_user_date", ["userId", "shiftDate"])
  .index("by_date", ["shiftDate"]),
```

### Employee Profile Extension

```typescript
// Add to existing users table:
hireDate: v.optional(v.number()),     // WIB epoch
baseRateIdr: v.optional(v.number()),  // IDR per month or per day
```

### BCA/Mandiri CSV Header Mapping

Based on research, Indonesian bank CSV exports use these common patterns:

**BCA KlikBCA Bisnis:**
```
Tanggal, Keterangan, Cabang, Jumlah, Mutasi, Saldo
```
Where Mutasi is "DB" (debit) or "CR" (credit), Jumlah is the amount.

**Mandiri (Kopra Cash Management):**
```
Tanggal, Keterangan, Debit, Kredit, Saldo
```

The parser should auto-detect format by inspecting headers, then normalize to a common internal format (date, description, debit, credit, balance). This is a ~50-line header-mapping function per bank, not a library concern.

**LOW confidence note:** Exact BCA/Mandiri CSV column names could not be verified from official documentation. The formats above are from community sources and may need adjustment when the user provides actual exported CSV files. Build the parser with a pluggable header-mapping pattern so new bank formats can be added trivially.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CSV parsing | PapaParse (existing) | SheetJS/xlsx | PapaParse already installed, proven for this exact use case; xlsx adds bundle weight for features we don't need |
| String matching | Custom normalizer + substring | string-similarity, fuse.js | Bank data is structured (amount/date/ref), not free text; over-engineering |
| Financial precision | Native JS integers + Math.round | currency.js, Decimal.js | IDR is zero-decimal; JS integers are exact for all IDR values |
| Date handling | date-fns (existing) | dayjs, luxon | date-fns already installed with Indonesian locale configured |
| Export format | CSV (existing infra) | Excel (exceljs) | CSV is stated requirement; existing download/escape helpers proven |
| Scheduling | Convex crons (existing) | node-cron | Convex has native cron support, already used for integrity checks |

## Sources

- Existing codebase: `package.json`, `csvImportValidation.ts`, `csvExport.ts`, `incomeStatement.ts`, `costCalculator.ts`, `dateUtils.ts`, `confidence.ts`, `integrityChecks/`
- [PapaParse 5.5.3 on npm](https://www.npmjs.com/package/papaparse) — current installed version is latest
- [Bank reconciliation auto-matching best practices](https://www.cashbook.com/auto-matching-algorithms-in-accounts-reconciliation/) — scoring algorithm design
- [Midday automatic reconciliation engine](https://midday.ai/updates/automatic-reconciliation-engine/) — real-world matching implementation reference
- [JavaScript financial precision](https://dev.to/benjamin_renoux/financial-precision-in-javascript-handle-money-without-losing-a-cent-1chc) — confirms integer strategy for zero-decimal currencies
- [BCA KlikBCA Bisnis tutorial](https://www.klikbca.com/kbbdemo/tutorial/02-03.html) — CSV export capability confirmed
- [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions) — cron pattern for integrity checks
