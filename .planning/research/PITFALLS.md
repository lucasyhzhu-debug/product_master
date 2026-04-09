# Pitfalls Research: v2.0 Financial Management & Data Quality

**Domain:** Bank statement reconciliation, staff attendance, full P&L, COGS override, data health validation, revenue recognition fix -- added to existing Convex + React 19 production system (70 tables, ~148K LOC TypeScript)
**Researched:** 2026-04-07
**Confidence:** HIGH (Convex-specific pitfalls from 69 phases of direct production experience; financial patterns from existing journal engine, income statement, and expense system code inspection; Indonesian banking format research from web sources)

---

## Critical Pitfalls

### CP-1: Bank Statement CSV Parsing Assumes Consistent Format (It Won't Be)

**What goes wrong:** BCA and Mandiri do NOT export standardized CSV from consumer banking. BCA's KlikBCA Bisnis exports CSV for business accounts, but personal e-Statements are PDF-only. Mandiri exports are typically PDF or XLS from Livin/MCM. Developers build a parser for one format, then discover the actual files users upload are hand-converted PDFs with inconsistent column ordering, merged date/description cells, and Indonesian locale number formatting (1.000.000,50 instead of 1000000.50).

**Why it happens:** Assumption that "CSV upload" means a standardized bank export. In reality, Indonesian bank CSV formats vary by: (1) business vs personal account, (2) KlikBCA Bisnis vs myBCA app vs e-Statement PDF conversion, (3) date range selected, (4) whether user copy-pasted from Excel.

**Consequences:** Parser fails silently on unexpected formats, amounts parsed incorrectly (dot-as-thousands-separator treated as decimal), dates parsed as MM/DD when they're DD/MM, transactions imported with wrong amounts causing phantom reconciliation mismatches.

**Prevention:**
- Support exactly 2 formats initially: KlikBCA Bisnis CSV export (business account) and a "generic" format with configurable column mapping
- Parse IDR amounts with explicit Indonesian locale handling: strip dots as thousands separators, treat comma as decimal separator
- Date parsing must try DD/MM/YYYY before MM/DD/YYYY (Indonesian standard is DD/MM)
- Validate parsed totals against a user-entered "statement ending balance" as a checksum
- Show a preview table of first 10 parsed rows BEFORE importing, with amount/date columns highlighted for user confirmation
- Store raw CSV text alongside parsed records for debugging

**Detection:** Users report reconciliation totals that don't match their bank statement. Amounts off by factor of 1000 (dot/comma confusion). Dates shifted by months.

**Phase mapping:** Bank Statement Reconciliation phase -- build parser with preview step as the FIRST deliverable before any matching logic.

---

### CP-2: Reconciliation Auto-Match Creates False Positives

**What goes wrong:** Auto-matching by amount + date finds multiple candidates. A Rp 150.000 transfer on the same day could match a direct sales order, an expense reimbursement, or a consignment settlement payment. The system matches to the wrong record, and the user doesn't notice because the amounts are identical.

**Why it happens:** Small FMCG operations have many transactions at similar amounts (product prices cluster around Rp 35K-150K). Daily bank statements contain dozens of small transfers that look identical by amount and date. Description fields from bank statements are often truncated or use abbreviations that don't match system records.

**Consequences:** Revenue double-counted (matched to wrong order), expenses marked as reconciled against wrong bank transaction, audit trail becomes unreliable, P&L accuracy degrades silently.

**Prevention:**
- Auto-match must require amount + date + at least one secondary signal (partial description match, order number in bank memo, customer name overlap)
- Confidence scoring: exact match (amount + date + reference number) = auto-reconcile; partial match = suggest with yellow highlight; no match = manual queue
- NEVER auto-reconcile one-to-many matches. If 3 bank transactions of Rp 150K exist on the same day, ALL go to manual queue
- Track reconciliation source: `matchType: "auto_exact" | "auto_suggested" | "manual"` on every reconciled record
- Build an "undo reconciliation" action -- mistakes will happen and must be reversible

**Detection:** Monthly P&L shows revenue spikes/dips that don't correlate with order volume. Bank reconciliation report shows 100% matched but journal balances disagree.

**Phase mapping:** Bank Statement Reconciliation phase -- implement matching logic AFTER parser is validated. Start with manual-only, then add auto-suggest.

---

### CP-3: Revenue Recognition Gap Persists After "Fix"

**What goes wrong:** The direct sales revenue recognition fix patches the `syncInternalOrders` action to capture orders it previously missed, but doesn't backfill historical orders. The P&L shows correct revenue going forward, but historical weeks/months have gaps. Users see different totals in Sales Analytics vs Income Statement for the same period, losing trust in both.

**Why it happens:** The existing `getRevenueOrders` query in `convex/integrations/internal/queries.ts` filters by `REVENUE_COUNTABLE_STATUSES` (PaymentReceived, BeingPrepared, AwaitingDelivery, Complete) and uses `_creationTime` for incremental sync. Orders that were created before the last sync but transitioned to a revenue-countable status after the last sync window (beyond the 24h buffer) are permanently missed. The bug is in the incremental sync logic, not the status filter.

**Consequences:** Permanent revenue gap for historical orders. The income statement underreports direct sales revenue. COGS calculations based on this revenue produce incorrect gross margins. Users manually compare bank deposits against system revenue and find discrepancies, eroding trust.

**Prevention:**
- The revenue fix MUST include a one-time backfill migration that re-syncs ALL historical orders (not just incremental)
- Change incremental sync to use `confirmedAt` (revenue recognition date) instead of `_creationTime` for the buffer window -- orders confirmed late get captured
- Add a Data Health check that compares `orders` table count (revenue-countable statuses) against `externalRevenue` table count (source="internal") and flags the delta
- After fix, run the sync once with `sinceTimestamp: undefined` (full scan) to catch all gaps

**Detection:** Data Health page shows "X orders with PaymentReceived+ status but no matching externalRevenue record." Sales Analytics total for "Direct" channel diverges from order manager total for same period.

**Phase mapping:** Revenue Recognition Fix phase -- must be completed BEFORE Full P&L phase, because P&L accuracy depends on complete revenue data.

---

### CP-4: COGS Override Silently Breaks BOM-Derived Cost Chain

**What goes wrong:** A flat COGS override per product (`menuProducts.cogsOverride`) is added, but the `buildProductCOGSMap` helper in `convex/lib/costCalculator.ts` doesn't check for overrides. The income statement, order cost calculations, and margin analysis each independently decide whether to use BOM or override, creating inconsistency. Some paths use the override, others still compute from BOM components.

**Why it happens:** COGS is consumed in 5+ places: (1) `buildProductCOGSMap` for income statement, (2) order item `unitCost` snapshot at creation, (3) margin analysis in product editor, (4) gap analysis "zero cost components" check, (5) kitchen production cost tracking. Adding a field to `menuProducts` without updating ALL consumers creates divergence.

**Consequences:** Product editor shows override COGS of Rp 8.000, but new orders snapshot BOM-derived COGS of Rp 6.500. Income statement uses override, sales analytics uses BOM. Gross margin percentages disagree across pages.

**Prevention:**
- Add the override field to `menuProducts` schema: `cogsOverride: v.optional(v.number())`
- Modify `buildProductCOGSMap` (the single source of truth for COGS) to check for override FIRST, falling back to BOM calculation. This is the ONLY place the override-vs-BOM decision should live
- Order item `unitCost` snapshot must also go through the same resolution path
- When override is set, gap analysis must NOT flag the product as "zero cost" (it has a cost, just not BOM-derived)
- Add visual indicator on product editor: "COGS: Rp 8.000 (override)" vs "COGS: Rp 6.500 (BOM)" so users know the source
- Track `cogsSource: "bom" | "override"` on snapshots for audit trail

**Detection:** Compare P&L gross margin % against order manager margin % for same products. If they diverge, a consumer is not honoring the override.

**Phase mapping:** COGS Override phase -- modify `buildProductCOGSMap` as the FIRST step, then update downstream consumers.

---

### CP-5: Convex 32K Document Scan Limit Breaks Bank Reconciliation Queries

**What goes wrong:** Bank reconciliation needs to scan both `bankStatementTransactions` (newly uploaded, potentially thousands of rows per month) and match against `externalRevenue` + `expenses` + `journalEntryLines` + `orders`. A single query that scans all these tables exceeds the 32,000 document scan limit, causing a Convex runtime error.

**Why it happens:** Convex enforces a hard limit of 32,000 documents scanned per query/mutation execution. The existing system already has large tables: `externalRevenue` (thousands of records across 8 channels), `expenses` (350+ historical imports plus ongoing), `orders` (growing daily). Reconciliation needs to cross-reference all of them.

**Consequences:** Reconciliation query throws `DocumentScanLimitExceeded` error in production. Works in dev (small dataset), fails in production (months of accumulated data).

**Prevention:**
- NEVER scan full tables for reconciliation. Use date-range indexed queries: `by_period` on `externalRevenue`, `by_status_expenseDate` on `expenses`, `by_date` on `journalEntryLines`
- Pre-filter candidates by date range (statement period) before attempting matches
- Bank statement import should be a Convex ACTION (not mutation) that processes rows in batches of 100, writing via `ctx.runMutation` per batch -- keeps each mutation's scan count under limits
- Reconciliation matching should work per-statement-row, not per-table-scan: for each bank transaction, query candidate matches by amount+date using indexed scans
- Consider denormalizing a `reconciliationStatus` field on source records (expenses, orders) to avoid re-scanning reconciled items

**Detection:** Error logs show `DocumentScanLimitExceeded` or query timeouts on reconciliation page. Works for new accounts but fails for accounts with 3+ months of data.

**Phase mapping:** Bank Statement Reconciliation phase -- architect the query strategy BEFORE writing any reconciliation logic. Test with production-scale data counts.

---

### CP-6: Attendance Clock-In Without Timezone Handling Drifts Across Shifts

**What goes wrong:** Kitchen staff clock in at 6 AM WIB (UTC+7), but the system stores `Date.now()` which is UTC. Shift boundary calculations (morning shift vs afternoon shift) use server-side UTC timestamps, causing a 7-hour offset. A clock-in at 06:00 WIB registers as 23:00 UTC the previous day, appearing in yesterday's shift summary.

**Why it happens:** JavaScript `Date.now()` returns UTC milliseconds. The existing system already has WIB handling in `convex/lib/periodRange.ts` (backend) and `src/lib/dateUtils.ts` (frontend), but new attendance code written without awareness of these helpers will default to UTC.

**Consequences:** Shift summaries show wrong dates. Monthly attendance reports show staff working on days they didn't. Production tracking per-staff-per-shift is assigned to wrong shifts. Payroll calculations based on attendance have wrong day counts.

**Prevention:**
- Reuse `convex/lib/periodRange.ts` for all date-to-WIB-day conversions in attendance logic
- Store clock-in/out as UTC epoch (standard), but always derive "attendance date" using WIB conversion: `getWIBDate(clockInTimestamp)` 
- Shift boundaries must be defined in WIB (e.g., morning shift: 06:00-14:00 WIB), then converted to UTC for comparison
- Frontend display must use `src/lib/dateUtils.ts` helpers consistently
- Add a test case: clock-in at 23:30 UTC (06:30 WIB next day) must appear in next day's attendance, not current UTC day

**Detection:** Staff reports showing work on holidays or rest days. Attendance count per month off by 1-2 days at month boundaries.

**Phase mapping:** Staff Attendance phase -- establish WIB-aware date derivation in the schema design, before building clock-in mutations.

---

### CP-7: Data Health Page Becomes Stale Monitoring Instead of Actionable Alerts

**What goes wrong:** The Data Health page is built as a passive dashboard that runs expensive queries on page load, showing counts of integrity issues. Users open it once, see "14 unmatched orders," and never return. The issues persist for months because there's no notification or enforcement mechanism.

**Why it happens:** Integrity checks are framed as read-only queries rather than automated validators with actionable outputs. The existing `integrityChecks/mutations.ts` runs a weekly cron for production counts but only writes to `integrityCheckLogs` -- nobody reads those logs regularly.

**Consequences:** Data quality degrades silently. Revenue gaps persist. COGS coverage gaps mean P&L is always "approximate." Bank reconciliation shows permanent unmatched items. Users lose trust and fall back to spreadsheets.

**Prevention:**
- Data Health checks should run as a scheduled cron (weekly minimum), not just on page load
- Each check category produces a score (0-100%) and a trend (improving/stable/degrading)
- Critical issues (revenue completeness < 95%, journal imbalance > Rp 0) should surface as a dashboard banner, not require navigating to a separate page
- Each flagged item must have a "Fix" action or clear instruction (e.g., "Run Internal Sync" button next to "12 orders missing from revenue bridge")
- Track issue resolution over time: when an issue is resolved, record it -- this motivates continued attention

**Detection:** Data Health score stays at the same value for 30+ days. Users report "the data health page always shows the same warnings."

**Phase mapping:** Data Health phase -- should come AFTER revenue recognition fix and bank reconciliation, so it can validate those features work correctly.

---

### CP-8: Full P&L Extension Double-Counts Revenue from Overlapping Sources

**What goes wrong:** The current income statement in `convex/reports/incomeStatement.ts` aggregates revenue from `externalRevenue` (platform sources) and `consignmentSettlements` separately. Adding bank reconciliation creates a third source of truth. If a direct sales payment appears in both `externalRevenue` (from internal sync) AND a reconciled bank statement transaction, it gets counted twice.

**Why it happens:** The system has three independent data flows that can record the same business event: (1) order system -> `externalRevenue` bridge, (2) bank statement upload -> reconciled transactions, (3) journal entries from expense/payroll approvals. Without explicit linking, the P&L aggregation adds them all.

**Consequences:** Revenue inflated, OpEx inflated, Net Income could go either direction. Auditor sees journal entries that don't match bank statements. Month-end close requires manual adjustment.

**Prevention:**
- Bank reconciliation LINKS to existing records (orders, expenses, journal entries) -- it does NOT create new revenue/expense records
- Reconciliation status is a flag on the source record: `isReconciled: boolean, bankStatementTransactionId: v.optional(v.id("bankStatementTransactions"))`
- P&L continues to source from existing tables ONLY. Bank reconciliation is a VALIDATION layer, not a data source
- The Data Health page shows reconciliation coverage: "85% of revenue verified against bank statements" but this is informational, not a revenue input
- Explicitly define the single source of truth for each P&L line: Revenue = `externalRevenue` + `consignmentSettlements`, COGS = BOM via `buildProductCOGSMap`, OpEx = `journalEntryLines` by account code. Bank = verification only

**Detection:** P&L total revenue exceeds sum of bank deposits for the same period (after accounting for timing differences).

**Phase mapping:** Full P&L phase must clearly document data source boundaries. Bank Reconciliation phase must be designed as linking, not duplicating.

---

## Technical Debt Patterns

### TD-1: Employee Profile Fields Split Across Two Tables

The `users` table already has `bankAccountNumber` and `bankName` (added Phase 41 for reimbursements). Adding `hireDate`, `baseRate`, and additional fields to `users` is tempting but creates a bloated auth table. Every `requireRole()` call fetches the full user document including financial fields the auth check doesn't need.

**Prevention:** Either accept the bloat (it's a small table, ~10 users) or create a separate `employeeProfiles` table with `userId: v.id("users")` as a 1:1 link. Given the small user count, bloating `users` is acceptable. Document the decision.

### TD-2: Bank Statement Transactions Table Growth

Each monthly bank statement import adds hundreds of rows. Unlike expenses or orders (which are operational and regularly queried), old bank statement data is archival. Without a retention strategy, the table grows indefinitely and slows reconciliation queries.

**Prevention:** Index `bankStatementTransactions` by `statementMonth` (YYYY-MM string). Reconciliation queries filter by current month only. Archive old months by marking `isArchived: true` and excluding from default queries.

### TD-3: Attendance Records Without Aggregation Cache

Raw clock-in/out records are fine for daily view, but monthly summaries (total hours, late count, production per staff) require scanning all records for the month. At 4 staff * 30 days * 2 records/day = 240 records/month -- manageable now, but grows linearly.

**Prevention:** Compute monthly summaries as a separate query with date-range index, not full table scan. The existing `kitchenShiftRecords` pattern (by_date index) works well for this scale.

---

## Integration Gotchas (Convex-Specific)

### IG-1: CSV Upload Must Use Action, Not Mutation

Convex mutations are limited to 16 MiB data written and 16,000 documents written per transaction. A bank statement with 500 transactions, each creating a `bankStatementTransactions` record, is fine. But if the import also attempts to run auto-matching (reading `externalRevenue`, `expenses`, `orders`), the 32,000 document scan limit hits.

**Fix:** Use a Convex action for CSV import. Parse CSV in the action, then batch-write via `ctx.runMutation` in chunks of 100. Auto-matching runs as a separate action after import completes.

### IG-2: Convex Cannot Join Tables -- Reconciliation Must Denormalize

Reconciliation matching conceptually requires joining `bankStatementTransactions` with `orders`, `expenses`, `externalRevenue`, and `journalEntries`. Convex has no JOIN. Each cross-reference is a separate `ctx.db.get()` or indexed query.

**Fix:** Denormalize match candidates into the bank statement transaction record after matching: `matchedEntityType: "order" | "expense" | "revenue"`, `matchedEntityId: string`, `matchedAmount: number`. This avoids re-joining on every page load.

### IG-3: Real-Time Reactive Queries Make Reconciliation Page Expensive

Convex queries are reactive -- every subscribed query re-runs when underlying data changes. A reconciliation page that subscribes to both `bankStatementTransactions` and `externalRevenue` will re-render whenever any new order triggers a revenue sync, even if unrelated to the current reconciliation view.

**Fix:** Use `useQuery` with narrow filters (specific statement ID, specific date range). Consider making summary/status queries separate from detail queries to reduce reactive blast radius.

### IG-4: Action Timeout for Large CSV Files

Convex actions have a 10-minute timeout. A bank statement CSV with 2000+ rows and complex matching logic could approach this limit, especially if each row triggers indexed lookups across multiple tables.

**Fix:** Process in batches with progress tracking. If batch count exceeds 500, use scheduler-chain pattern (existing pattern from BigSeller sync in v1.4): process first batch, then `ctx.scheduler.runAfter(0, ...)` for the next batch. Report progress via a status document.

### IG-5: No Stored Procedures -- Attendance Aggregation Is Application-Level

Traditional databases would use a stored procedure or materialized view for monthly attendance summaries. In Convex, all aggregation happens in query handlers. Complex aggregations (hours worked per staff per week, late arrivals, production output per shift) must be carefully bounded by date-range indexes.

**Fix:** Always query attendance records by date range index. Never `.collect()` the full attendance table. Pre-compute monthly summaries as a separate scheduled task if real-time aggregation becomes too slow.

---

## Performance Traps

### PT-1: Data Health Page Running All Checks On Load

The Data Health page with 6+ integrity check categories (revenue completeness, COGS coverage, journal balance, bank reconciliation, expense receipts, attendance gaps) will trigger 6+ heavy queries simultaneously on page mount.

**Fix:** Lazy-load checks: show a card per category with "Run Check" button. Or better: run checks via cron and display cached results, with "Refresh" button for on-demand re-run. The existing `integrityCheckLogs` table pattern supports this.

### PT-2: Income Statement Query Grows With Data Volume

The current `aggregateWeek` in `incomeStatement.ts` scans `externalRevenue` by period and `journalEntryLines` by date. As data accumulates, these scans slow down. Adding per-channel breakdown with COGS resolution multiplies the work.

**Fix:** The existing pattern (indexed scans with in-memory aggregation) is correct. Ensure all new P&L line items (FCF, depreciation, etc.) use the same indexed-scan approach. Never add a full-table `.collect()` to the income statement query.

### PT-3: Reconciliation UI Re-rendering on Every Keystroke

A reconciliation page with a search/filter for manual matching will subscribe to large query results. If the filter triggers a new query on every keystroke, Convex re-runs the full query each time.

**Fix:** Debounce search input (300ms minimum). Use pagination (`take(50)`) for candidate lists. Show summary counts from a lightweight query, with detail drill-down on click.

---

## Security Mistakes (Financial Data Handling)

### SM-1: Bank Statement Data Contains Account Numbers

Uploaded bank CSV files contain the business's full bank account number, transaction counterparty names, and amounts. These must not be stored in a way that's accessible to non-admin roles.

**Fix:** Bank statement tables must enforce admin-only access via `requireRole(ctx, args.token, ["admin"])`. The reconciliation UI should only be accessible to admin/manager roles. Raw CSV content stored for debugging should be in a separate field that's stripped from non-admin query results.

### SM-2: Employee Bank Details in Profile

Adding bank account number and bank name to employee profiles creates PII that must be protected. Kitchen staff viewing their own profile should see their own bank details, but not other employees'.

**Fix:** Employee profile query must filter: users can see their own financial details, managers/admins can see all. Use the existing auth pattern: `if (requestingUser._id !== targetUserId) requireRole(ctx, token, ["manager", "admin"])`.

### SM-3: Attendance Data as Labor Compliance Evidence

Clock-in/out records become legal evidence for labor compliance (Indonesian Manpower Law UU 13/2003). Attendance records must not be editable after submission without an audit trail.

**Fix:** Attendance records are insert-only. Corrections create a new record with `correctedRecordId: v.id("staffAttendance")` link and mandatory `correctionReason`. Admin-only correction permission. This mirrors the journal engine's reversal-only correction pattern.

---

## "Looks Done But Isn't" Checklist

### Bank Statement Reconciliation
- [ ] Parser handles IDR number format (dot = thousands, comma = decimal)
- [ ] Parser handles DD/MM/YYYY date format (not MM/DD)
- [ ] Preview step shows parsed data before import (user confirmation)
- [ ] Duplicate file upload detection (file hash check, like receipt dedup pattern from v1.7)
- [ ] Auto-match handles one-to-many candidates correctly (goes to manual queue)
- [ ] Reconciliation can be undone (unlink transaction from matched record)
- [ ] Old reconciliation data doesn't slow new month's queries (date-range indexed)
- [ ] Works with production data volume (not just 10-row test file)

### Staff Attendance
- [ ] Clock-in time stored as UTC, displayed as WIB
- [ ] "Attendance date" derived from WIB, not UTC (6 AM WIB = correct day)
- [ ] Handles midnight-crossing shifts (clock in 22:00, clock out 06:00)
- [ ] Mobile-friendly UI (kitchen staff use phones)
- [ ] Cannot clock in twice without clocking out (state validation)
- [ ] Monthly summary uses date-range indexed query, not full table scan
- [ ] Correction flow with audit trail (not edit-in-place)

### Full P&L
- [ ] Revenue sources match exactly what Sales Analytics shows (no divergence)
- [ ] COGS uses `buildProductCOGSMap` with override support (single path)
- [ ] OpEx sourced from journal entries, not directly from expenses table
- [ ] Depreciation sourced from fixed assets (existing `fixedAssets` helpers)
- [ ] Bank reconciliation is VALIDATION, not a revenue/expense source
- [ ] Weekly/monthly period switching works correctly at WIB boundaries
- [ ] Previous period comparison handles edge cases (first week, partial months)

### COGS Override
- [ ] `buildProductCOGSMap` checks override FIRST, falls back to BOM
- [ ] Order item `unitCost` snapshot uses same resolution path
- [ ] Gap analysis excludes products with override from "zero cost" warnings
- [ ] Visual indicator shows COGS source (override vs BOM) on product editor
- [ ] Existing orders keep their snapshotted COGS (no retroactive change)
- [ ] `unitCostStaleAt` is set when override changes (triggers recalculation badge)

### Data Health Page
- [ ] Checks run as cron AND on-demand (not just on page load)
- [ ] Each check has an actionable "Fix" path (not just a red number)
- [ ] Critical issues surface on dashboard (banner/badge), not buried in separate page
- [ ] Checks cover: revenue completeness, COGS coverage, journal balance, reconciliation status, attendance gaps
- [ ] Results persisted in `integrityCheckLogs` with timestamp and trend tracking

### Revenue Recognition Fix
- [ ] Historical orders backfilled (one-time full sync, not just incremental going forward)
- [ ] Incremental sync uses `confirmedAt` for buffer window (not `_creationTime`)
- [ ] Cancelled-then-reinstated orders handled correctly
- [ ] Data Health check validates order count vs externalRevenue count

---

## Pitfall-to-Phase Mapping

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|---|---|---|---|
| Revenue Recognition Fix | CP-3: Historical gap persists | CRITICAL | One-time full backfill + sync logic fix |
| COGS Override | CP-4: Inconsistent cost path | CRITICAL | Modify `buildProductCOGSMap` as single source |
| Bank Statement Reconciliation | CP-1: CSV format assumptions | CRITICAL | Multi-format parser with preview step |
| Bank Statement Reconciliation | CP-2: False positive auto-match | HIGH | Confidence scoring, manual queue for ambiguous |
| Bank Statement Reconciliation | CP-5: 32K scan limit | HIGH | Batch action pattern, date-range indexes |
| Bank Statement Reconciliation | IG-1: Mutation vs Action | HIGH | Action for import, mutations for writes |
| Full P&L Extension | CP-8: Double-counting from recon | CRITICAL | Bank recon is validation, not data source |
| Staff Attendance | CP-6: Timezone drift | HIGH | Reuse WIB helpers, UTC storage + WIB display |
| Staff Attendance | SM-3: Labor compliance | MEDIUM | Insert-only records, correction audit trail |
| Data Health Page | CP-7: Stale monitoring | MEDIUM | Cron + actionable fixes + dashboard banner |
| Employee Profile | TD-1: Table bloat | LOW | Accept bloat for small user count |

**Phase ordering implication:** Revenue Recognition Fix must come BEFORE Full P&L (CP-3 feeds CP-8). COGS Override should come BEFORE Full P&L (CP-4 affects margin accuracy). Bank Reconciliation should come AFTER revenue fix and COGS override (so reconciliation has correct data to match against). Data Health should come LAST (validates all other features).

---

## Sources

- [Convex Limits Documentation](https://docs.convex.dev/production/state/limits) -- action timeout (10min), document scan limit (32K), mutation write limit (16K docs/16 MiB)
- [KlikBCA Bisnis Tutorial](https://www.klikbca.com/KbbDemo/tutorial/04-02-01a.html) -- CSV export format for business accounts
- [Bank Reconciliation Pitfalls (GBQ)](https://gbq.com/avoiding-bank-reconciliation-pitfalls-common-mistakes-in-modern-accounting/) -- over-reliance on automation, duplicate imports
- [Common Bank Reconciliation Errors (SD Mayer)](https://www.sdmayer.com/resources/common-bank-reconciliation-pitfalls-to-watch-for) -- timing differences, transposed numbers
- [Bank Reconciliation Errors (Aurum)](https://aurum.solutions/resources/bank-reconciliation-errors-and-how-to-avoid-them) -- 15-25% manual error rate
- [BOM Costing Accounting (CetecERP)](https://cetecerp.com/blog/bom-costing-accounting.html) -- BOM vs override cost tracking pitfalls
- [Employee Attendance Mistakes (TaskFino)](https://taskfino.com/blog/employee-attendance-management-mistakes) -- buddy punching, integration gaps
- Codebase inspection: `convex/integrations/internal/adapter.ts`, `convex/integrations/internal/queries.ts`, `convex/lib/costCalculator.ts`, `convex/reports/incomeStatement.ts`, `convex/lib/periodRange.ts`, `convex/integrityChecks/mutations.ts`
- Production experience: 69 phases across 10 milestones, documented in CLAUDE.md session memory
