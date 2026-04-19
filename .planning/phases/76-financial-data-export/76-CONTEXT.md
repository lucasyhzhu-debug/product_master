# Phase 76: Financial Data Export - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver two CSV exports for external analysis and accountant handoff:

1. **Raw transactions export** (FIN-03) — every GL-level movement in the period as one row per `journalEntryLines` entry, joined with parent `journalEntries` metadata and GL account info.
2. **Multi-period P&L summary export** (FIN-04) — extends the existing Phase 75 single-period `generateIncomeStatementCSV` so a user-selected date range emits stacked P&L rows across weekly / monthly / custom granularity.

Entry point is a new `/financials/export` page, gated to manager + admin, that lets the user pick export type, date range, granularity, and triggers per-file browser downloads.

**Not in scope:**
- XLSX output (CSV only per roadmap)
- Source-document pivot exports (revenue-by-channel, expense-by-category, etc.) — those are analytics, not data export
- Data Health / integrity checks on exported data — belongs in Phase 77
- Multi-file ZIP bundling — rejected in favor of per-file browser downloads (no new dep, no cleanup logic needed)
- Email delivery / scheduled exports — user manually clicks Download

</domain>

<decisions>
## Implementation Decisions

### Raw Transactions Export (FIN-03)

- **D-01:** Raw transactions CSV contains ONE row per `journalEntryLines` entry in the date range, with parent `journalEntries` metadata and `glAccounts` info denormalized in-line. Columns:
  ```
  entry_date, je_id, je_number, je_type, account_code, account_name,
  debit_idr, credit_idr, description, source_doc_type, source_doc_id, created_by
  ```
  - `je_type` comes from `journalEntries.entryType` (revenue, expense, payroll, consignmentSettlement, manual, reversal, etc.)
  - `source_doc_type` + `source_doc_id` is the link back to the business document (e.g., `expense:abc123`, `externalRevenue:xyz789`) so the accountant can cross-reference.
  - `debit_idr` / `credit_idr` are mutually exclusive per row — one is always 0.
  - `created_by` = the user who recorded the JE (from `journalEntries.createdBy` or the user from the source mutation). Useful for audit.
- **D-02:** Ordered by `entry_date ASC`, then by `je_number ASC`, then by line insertion order (natural line order within an entry — debits first, credits second, matching double-entry visual convention).
- **D-03:** Query uses the existing `journalEntryLines.by_entryDate` index (from v1.7 Phase 49+). Single indexed scan of the date range, then enrich each line with its parent JE (batch-fetch by unique `entryId`) and GL account (batch-fetch by unique `accountId`). No N+1.
- **D-04:** GL lines whose parent `journalEntries` was reversed are INCLUDED in the export — both the original and the reversal appear, each with its own row. Matches PSAK / accounting conventions (reversal is an auditable event, not a delete). Reversal lines are identifiable via `je_type = "reversal"` and `description` containing the cross-reference.

### P&L Summary Export (FIN-04)

- **D-05:** Multi-period P&L export extends `generateIncomeStatementCSV`'s existing flat schema (`period, section, channel, line_item, amount_idr, confidence, prev_period_idr, delta_pct`) and emits rows for EVERY period in the user-selected range. Long format — one row per (period, section, channel, line_item).
  - Example: a quarterly range at weekly granularity = 13 periods × ~30 line-items ≈ 390 rows.
  - `period` column carries the period label (e.g., `2026-W15` for weekly, `2026-04` for monthly, `2026-04-01_to_2026-04-19` for custom-single).
  - `prev_period_idr` and `delta_pct` are computed against the IMMEDIATELY PRIOR period within the range (not a fixed reference). For the first period in the range, they remain empty.
- **D-06:** Granularity selector at export time: `weekly` | `monthly` | `custom` (custom treats the full range as a single period — same shape as today's single-week export). Default = `weekly`.
- **D-07:** Reuse the existing per-period `aggregateWeek` helper from `convex/reports/incomeStatement.ts`. New export query is a thin loop: split date range into N periods (using `calculateWeekRange` / month-range helper), call `aggregateWeek` for each, concatenate rows. No duplication of P&L math.
- **D-08:** Data Quality footer rows appear ONCE at the bottom of the file, summarizing gaps across the entire range (unmapped products seen in any period, missing channels, zero-cost components). Not repeated per period — would bloat the file.

### UI Entry Point (FIN-03, FIN-04)

- **D-09:** New page at `/financials/export`, linked from a primary button in the `FinancialStatement.tsx` page header (next to the existing "Download CSV" button for the current week). The existing single-period Download CSV button STAYS for one-click current-week workflow; the new page is for range exports.
- **D-10:** Page layout — single-column form:
  1. **Export type** — checkbox group: `[x] Raw transactions` / `[x] P&L summary` (at least one required; both checked by default).
  2. **Date range** — preset buttons (Last week / Last month / Last quarter / YTD / Custom) + date pickers. WIB timezone via shared `dateUtils.ts`.
  3. **Granularity** (P&L only, hidden when P&L unchecked) — `weekly` / `monthly` / `custom-single`. Default weekly.
  4. **Generate exports** button — triggers per-file downloads.
- **D-11:** After clicking Generate, each selected CSV downloads as a separate browser download (no ZIP). Filenames:
  - `frollie-transactions-{YYYYMMDD}-{YYYYMMDD}.csv`
  - `frollie-pl-summary-{YYYYMMDD}-{YYYYMMDD}-{granularity}.csv`
  Dates formatted per WIB timezone (not UTC).
- **D-12:** Page shows pre-flight stats after date range is set: "Range covers N journal entries, M revenue rows, X periods" — helps the user verify before clicking Generate. Uses a cheap COUNT-style query (no full row fetch).

### Access Control & Security

- **D-13:** Role gate = `manager` + `admin`. Applied in TWO places:
  1. `<ProtectedRoute roles={["manager","admin"]}>` around `/financials/export`.
  2. `requireRole(ctx, args.token, ["manager","admin"])` at the top of every new Convex query used by this page.
  Matches `/financials` access — managers already see the aggregated numbers; raw GL lines are one level deeper but still within their scope.
- **D-14:** Every new CSV row MUST flow through the existing `escapeCell()` sanitizer in `src/lib/csvExport.ts` — formula-injection prevention (CVE-aware: `=`, `+`, `-`, `@`, tab, CR prefix-quoted) and RFC-4180 quote escaping. No exceptions. Add a test asserting this for the new raw-transactions export.
- **D-15:** IDR amounts exported as INTEGER rupiah values (no decimals, no thousand separators, no currency symbol). Matches the existing `amount_idr` column convention in `generateIncomeStatementCSV`. Let the spreadsheet application format the display.

### Performance & Limits

- **D-16:** Raw-transactions query has no hard row cap — rely on Convex's natural pagination. BUT: if the range would return > ~10,000 lines (rough internal threshold — tune based on profiling), the pre-flight stats panel shows a soft warning: "Large range — export may take a moment." No blocking.
- **D-17:** P&L export computes period-by-period in the Convex action/query. With weekly granularity and a 1-year range = 52 `aggregateWeek` calls. Existing `aggregateWeek` is sub-second per call (confirmed in Phase 75 verification). Acceptable. If performance becomes a concern later, batch-fetch optimization is additive.

### Folded Todos

None — no pending todos matched Phase 76 scope.

### Claude's Discretion

- XLSX output — deferred per roadmap "CSV format" locking. If a user ever demands it, SheetJS is already installed (CLAUDE.md pitfall #15) and the write path would reuse the same row structures.
- Pre-flight stats panel's exact numbers / layout — can be tuned during implementation.
- Date preset button labels ("Last week" vs "Last 7 days" vs "Previous week") — pick the one most consistent with existing UI copy in `FinancialStatement.tsx`.
- Filename date format — `YYYYMMDD` recommended (sortable, short); but if a team convention says otherwise, follow that.
- Internal structure of the Convex file(s) — could be `convex/reports/financialExport.ts` or split by export type. Research/plan phases decide.
- Error surfacing — empty date range, no data found, permission denied: use existing toast pattern and `<ProtectedRoute>` redirect behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Backend — Journal Engine (raw transactions source)

- `convex/schema.ts` §journalEntries (line ~1730) — `entryType`, `entryNumber`, `entryDate`, `description`, `createdBy`, `sourceDocType`, `sourceDocId`, `reversalOfEntryId`
- `convex/schema.ts` §journalEntryLines (line ~1765) — `entryId`, `accountId`, `debit`, `credit`, `description`, indexed by `by_entryDate`
- `convex/schema.ts` §glAccounts — `code`, `name`, `category` (for account_code / account_name denormalization)
- `convex/lib/journalHelpers.ts` — `aggregateJournalLines` pattern; adapt for range-bounded raw export
- `convex/lib/auth.ts` — `requireRole(ctx, token, roles[])` for manager+admin gate

### Core Backend — P&L Summary Source

- `convex/reports/incomeStatement.ts` — `aggregateWeek(ctx, periodStart, periodEnd)` is the per-period aggregator to loop over
- `convex/lib/costCalculator.ts` — `buildProductCOGSMap` (Phase 70 COGS override honored automatically)
- `convex/lib/periodRange.ts` — `calculateWeekRange` (WIB); add / reuse a month-range helper for monthly granularity
- `convex/lib/confidence.ts` — Confidence classification (flows through into CSV per D-01 of Phase 75)

### Frontend — Existing Export Infrastructure

- `src/lib/csvExport.ts` — **REUSE** `escapeCell`, `downloadCSV`, `generateIncomeStatementCSV`. New multi-period function wraps `generateIncomeStatementCSV` or factors shared rows
- `src/lib/staffPerformanceExport.ts` — Prior-art staff-performance CSV pattern (Phase 74)
- `src/pages/FinancialStatement.tsx` — Current P&L page; location of the new link button to `/financials/export`
- `src/lib/dateUtils.ts` — WIB timezone helpers (MUST use for all date formatting)
- `src/components/ProtectedRoute.tsx` — Role gate wrapper

### Prior Phase Context (MUST read)

- `.planning/phases/75-full-p-l-extension/75-CONTEXT.md` §D-16 — Phase 75 extended `generateIncomeStatementCSV` through FCF. Phase 76 builds on that row set, not a fresh implementation.
- `.planning/phases/74-staff-attendance/` — Prior-art export pattern via `staffPerformanceExport.ts`

### Requirements & Roadmap

- `.planning/REQUIREMENTS.md` §FIN-03, FIN-04 — Active v2.0 requirements
- `.planning/ROADMAP.md` Phase 76 — Goal + success criteria
- `.planning/PROJECT.md` line 18 — "export button with raw transactions or P&L summary, weekly/monthly/custom range, CSV format"

### Security & Pitfalls (CLAUDE.md)

- CLAUDE.md Pitfall #10 — `token: v.string()` required on all protected mutations/queries; strip before db ops
- CLAUDE.md Pitfall #14 — Keep phase directory slug short (already satisfied: `76-financial-data-export` = 26 chars)
- CLAUDE.md Pitfall #15 — xlsx installed via SheetJS CDN; do NOT run `npm audit fix` on xlsx. Not needed for this phase (CSV-only), but note for Claude's Discretion fallback.
- `src/lib/csvExport.ts:611-619` — Formula-injection sanitization pattern (MUST reuse for raw transactions export)

### Docs to Update After Merge

- `docs/CHANGELOG.md` (MANDATORY)
- `docs/API_REFERENCE.md` — Document new export queries
- `docs/ROADMAP.md` — Mark FIN-03 and FIN-04 complete
- `docs/FILE_MAP.md` — Add `/financials/export` route to permission table

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`escapeCell` + `downloadCSV` in `src/lib/csvExport.ts`** — Already CVE-aware (formula injection prefix-quote + RFC-4180 escaping). Use verbatim for the new raw-transactions CSV. Do NOT reimplement escaping.
- **`generateIncomeStatementCSV` row shape** — Keep the 8-column schema (`period, section, channel, line_item, amount_idr, confidence, prev_period_idr, delta_pct`). Phase 76 emits the same columns, repeated per period. The only change is the `period` column now carries N distinct values, not 1.
- **`aggregateWeek` in `convex/reports/incomeStatement.ts`** — Already handles a single period's full P&L through FCF (per Phase 75 D-16). Phase 76 loops this over N periods; zero new P&L math.
- **`journalEntryLines.by_entryDate` index** — Phase 49 introduced this index; range scan on it is the correct path for raw-transactions export. No new index needed.
- **WIB helpers in `src/lib/dateUtils.ts` and `convex/lib/periodRange.ts`** — Already used across v1.7/v1.8 financial features. Reuse for all date formatting + range bucketing.

### Established Patterns

- **Per-page role gate via `<ProtectedRoute>` + backend `requireRole`** — double-layer access control (established in v1.0). Apply both.
- **Flat CSV row format with denormalized metadata** — `csvExport.ts` and `staffPerformanceExport.ts` both follow "one row = one fact, metadata denormalized into columns". Raw-transactions export continues this pattern.
- **Confidence classification on every numeric field** — Phase 75 carries `confidence` into the CSV. For raw GL, confidence is always `exact` (actual posted amount). Keep the column anyway for schema consistency.
- **Pre-flight stats pattern** — `/bank-reconciliation` shows stats before the expensive action (per Phase 73 feedback). Apply here too — show count estimates before generating.

### Integration Points

- **New route** — add `/financials/export` to `src/App.tsx` (or wherever routes are declared) with `<ProtectedRoute roles={["manager","admin"]}>`.
- **New button in `FinancialStatement.tsx` header** — "Export range…" next to the existing "Download CSV" button.
- **New Convex file(s)** — likely `convex/reports/financialExport.ts` (two queries: `getRawTransactionsExport`, `getMultiPeriodPLExport`). Or split into two files if LOC pushes past ~400.
- **New frontend file(s)** — `src/pages/FinancialExportPage.tsx`, possibly `src/lib/financialExportHelpers.ts` for multi-period row generation.
- **Test coverage** — Vitest + convex-test for both queries (range correctness, role gate, empty-range handling, formula-injection sanitization). One happy-path E2E Playwright test (navigate → set range → click generate → assert download triggered).

</code_context>

<specifics>
## Specific Ideas

- **Accountant-first framing:** The raw-transactions CSV is the primary accountant handoff. Columns should be copy-paste-ready into standard accounting imports (QuickBooks / Xero column names are similar — `entry_date`, `account_code`, `debit`, `credit`, `description`). Not required to match any specific tool's import format, but the column order and names should feel instantly familiar to a bookkeeper.
- **Per-period delta meaningfulness:** In the multi-period P&L export, delta_pct compares against the immediately prior period in the range. This means the first period in the range will have empty prev/delta columns — document this explicitly in the column header or a footer note.
- **Browser download, not email:** User explicitly confirmed per-file browser download. No upload to S3, no email attachment, no scheduled cron. Manual click → file save.
- **Reuse `generateIncomeStatementCSV`:** The multi-period function should call `generateIncomeStatementCSV` per period and concatenate, OR factor out the shared row-building into a helper both can call. Either is fine; planner picks the cleaner split.

</specifics>

<deferred>
## Deferred Ideas

- **XLSX export** — Roadmap specified CSV; defer XLSX to a future phase if any user actually asks. SheetJS already installed (bank-recon read), so the dep is there if needed.
- **ZIP bundling when multiple files requested** — User opted for per-file browser downloads; skip jszip dependency.
- **Scheduled / cron exports** — Sending monthly P&L + transactions to accountant email on the 1st of each month. Nice-to-have; not requested.
- **Source-document pivot exports** — Revenue by channel, expenses by vendor, payroll by employee. Those are analytics dashboards, not "data export" — belong in their own phases or are already covered by existing pages.
- **Accountant-import-format preset** — Dropdown to emit QuickBooks-style or Xero-style CSV. Over-engineering until someone asks.
- **Signed URL / expiring share link** — Upload export to object storage and send a link. Unnecessary for internal-tool scale; direct browser download is fine.
- **Data Health hooks from export** — Phase 77 will surface data quality issues on a dashboard; don't duplicate here.

### Reviewed Todos (not folded)

None — no pending todos matched this phase's scope.

</deferred>

---

*Phase: 76-financial-data-export*
*Context gathered: 2026-04-19*
