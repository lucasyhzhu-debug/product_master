# Project Research Summary

**Project:** Frollie Recipe Master v2.0 -- Financial Management & Data Quality
**Domain:** SME Financial Management for Indonesian FMCG Food Production
**Researched:** 2026-04-07
**Confidence:** HIGH

## Executive Summary

Frollie v2.0 adds financial management completeness and data quality assurance to an already-mature production management system (70 tables, ~148K LOC, 10 milestones shipped). The milestone includes 8 features spanning revenue bug fixes, COGS accuracy improvements, full P&L with FCF, bank statement reconciliation, staff attendance tracking, data health monitoring, and financial data export. All features build entirely on the existing Convex + React 19 stack with zero new npm dependencies -- the codebase already has PapaParse for CSV, Recharts for charts, date-fns for dates, and proven CSV export infrastructure.

The recommended approach is a strict dependency-ordered build: fix data accuracy first (revenue recognition bug, COGS override), then extend reporting (full P&L with FCF), then add new tracking capabilities (staff attendance), then build the most complex feature (bank reconciliation), and finally layer data health monitoring and export on top. This ordering matters because every financial feature downstream depends on accurate revenue and COGS data -- building P&L or reconciliation on broken data wastes effort and creates false confidence.

The primary risks are: (1) Indonesian bank CSV formats are inconsistent and poorly documented -- the parser must show a preview before import, not assume a fixed format; (2) bank reconciliation auto-matching will produce false positives because FMCG transactions cluster around similar amounts (Rp 35K-150K) -- require multiple match signals, never auto-reconcile ambiguous matches; (3) the revenue recognition fix must include historical backfill, not just a forward-looking pipeline change, or the P&L will remain wrong for past periods. All three risks have clear mitigation strategies documented in the research.

## Key Findings

### Recommended Stack

No new libraries. Every v2.0 feature builds on existing infrastructure. This is unusual and reflects the maturity of the codebase after 10 milestones.

**Stack reuse:**
- **PapaParse** (installed): Bank statement CSV parsing -- same library already used in csvImportValidation.ts for expense import
- **Recharts** (installed): P&L and data health visualizations
- **date-fns** (installed): WIB timezone handling for attendance and period calculations
- **Existing CSV export** (src/lib/csvExport.ts): Financial data export with formula injection protection already built
- **Convex crons** (built-in): Data health scheduled checks -- same pattern as existing integrityChecks/

**Explicitly rejected:** string-similarity/fuse.js (bank matching is amount-primary, not text search), currency.js/Decimal.js (IDR is zero-decimal, JS integers are exact), xlsx/exceljs (CSV is sufficient, Excel adds ~500KB bundle), any new date library (date-fns covers all needs).

### Expected Features

**Must have (table stakes):**
- **TS-1 Revenue Recognition Fix** -- P&L is actively wrong without it; direct sales orders missing from revenue bridge (P0)
- **TS-2 COGS Override per Product** -- single optional field on menuProducts, massive accuracy gain for products with incomplete BOM (P0)
- **TS-3 Employee Profile Extensions** -- 2-3 optional fields on users table, unblocks downstream features (P0)
- **TS-4 Full P&L to FCF** -- extend existing 80%-complete P&L with CapEx and FCF computation (P1)
- **TS-5 Financial Data Export** -- raw transactions + P&L summary CSV for accountant handoff (P2)

**Should have (differentiators):**
- **D-1 Data Health Page** -- centralized integrity dashboard consolidating existing checks plus new ones (P2)
- **D-2 Bank Statement Reconciliation** -- CSV upload + auto-match for BCA/Mandiri, replaces Excel workflow (P3)
- **D-3 Staff Attendance** -- clock-in/out integrated with kitchen production tracking (P1)

**Anti-features (explicitly NOT building):**
- Full payroll calculation engine (Indonesian labor law too complex)
- Automated bank API import (requires corporate banking agreements)
- AI-powered transaction categorization (overkill for ~50-100 monthly transactions)
- Multi-currency support (all operations in IDR)
- Budget vs. actual comparison (no budget input system exists yet)

### Architecture Approach

The architecture adds 4 new tables (growing schema from 70 to 74) and modifies 2 existing tables with optional fields -- no migrations needed. The key architectural decisions are: (1) bank reconciliation is a VALIDATION layer that links to existing records, NOT a data source for P&L; (2) COGS override resolution lives in a single function (buildProductCOGSMap) to prevent cost-path divergence; (3) CSV parsing uses Convex actions (longer timeout) with batch mutations for writes; (4) attendance is a separate table from kitchen shift records (different lifecycle, different access patterns); (5) data health runs checks via cron and caches results, not as expensive on-load queries.

**New tables:**
1. bankStatements -- CSV upload header records (~10/month)
2. bankStatementLines -- parsed transaction rows (~500/month)
3. bankReconciliationMatches -- matched pairs linking bank lines to system records (~500/month)
4. staffAttendance -- clock-in/out records (~150/month for 5 staff)

**Modified tables:**
1. menuProducts -- add cogsOverrideIdr: v.optional(v.number())
2. users -- add hireDate: v.optional(v.number()), baseRate: v.optional(v.number())

### Critical Pitfalls

1. **Bank CSV format inconsistency (CP-1)** -- BCA/Mandiri export formats vary by account type, app version, and user behavior. Build a parser with preview confirmation step; support exactly 2 formats initially (KlikBCA Bisnis CSV + generic configurable); handle IDR locale (dot=thousands, comma=decimal) and DD/MM/YYYY dates explicitly.

2. **Revenue recognition gap persists after fix (CP-3)** -- Forward-only fix leaves historical orders unlinked. Must include one-time full backfill migration and switch incremental sync from _creationTime to confirmedAt for the buffer window.

3. **COGS override breaks cost chain (CP-4)** -- Override field added but not all 5+ COGS consumers updated. Modify buildProductCOGSMap as the SINGLE source of truth; all paths must go through it including order item snapshots.

4. **Convex 32K document scan limit (CP-5)** -- Bank reconciliation cross-references multiple large tables. Use date-range indexed queries exclusively; batch imports via actions; never scan full tables for matching.

5. **P&L double-counting from reconciliation (CP-8)** -- Bank reconciliation must LINK to existing records, not create new revenue/expense entries. P&L sources remain: Revenue = externalRevenue + consignmentSettlements, COGS = buildProductCOGSMap, OpEx = journalEntryLines.

## Implications for Roadmap

Based on combined research, suggested 7-phase structure:

### Phase 1: Data Accuracy Foundation
**Rationale:** Every financial feature depends on correct revenue and COGS data. Fix the data first, everything else is wrong until this ships.
**Delivers:** Correct revenue pipeline + COGS override + employee profile fields
**Addresses:** TS-1 (Revenue Fix), TS-2 (COGS Override), TS-3 (Employee Profile)
**Avoids:** CP-3 (historical gap -- include backfill), CP-4 (cost chain break -- modify single source of truth)
**Complexity:** Low. Schema additions are optional fields. Revenue fix is a bug fix with backfill migration.
**Estimate:** 2-3 phases (revenue fix alone may need its own phase due to backfill testing)

### Phase 2: Full P&L Extension
**Rationale:** Depends on accurate COGS and complete revenue from Phase 1. Extends existing 80%-done query.
**Delivers:** FCF line item (Net Income + Depreciation - CapEx), complete P&L flow
**Addresses:** TS-4 (Full P&L)
**Avoids:** CP-8 (double-counting -- P&L sources clearly defined, bank recon is validation only)
**Complexity:** Medium. Mostly query extension + 1-2 new UI rows.

### Phase 3: Staff Attendance
**Rationale:** Independent of financial features (only depends on TS-3 employee profile, done in Phase 1). Can ship in parallel with Phase 2 if desired.
**Delivers:** Clock-in/out for kitchen staff, monthly attendance summary, production-per-hour metrics
**Addresses:** D-3 (Staff Attendance)
**Avoids:** CP-6 (timezone drift -- use existing WIB helpers, store UTC, derive date in WIB)
**Complexity:** High (UX complexity for kitchen environment, edge cases around midnight shifts, manual corrections with audit trail).

### Phase 4: Financial Data Export
**Rationale:** Trivial after P&L is complete. Two export types using existing CSV infrastructure.
**Delivers:** Raw transaction CSV export + P&L summary CSV with date range picker
**Addresses:** TS-5 (Financial Export)
**Avoids:** No major pitfalls. Well-established pattern in codebase.
**Complexity:** Low-Medium. Pattern already proven.

### Phase 5: Bank Statement Reconciliation
**Rationale:** Most complex feature -- 3 new tables, CSV parser, matching engine, split-view UI. Benefits from all other features being stable. Needs employee profile (Phase 1) for bank account matching.
**Delivers:** BCA/Mandiri CSV upload with format detection, auto-match engine, manual match UI, reconciliation status tracking
**Addresses:** D-2 (Bank Reconciliation)
**Avoids:** CP-1 (format assumptions -- preview step), CP-2 (false positives -- confidence scoring + manual queue), CP-5 (scan limit -- batch actions + indexed queries), IG-1 (action vs mutation)
**Complexity:** High. Likely needs 2-3 sub-phases: (a) CSV parser + preview, (b) auto-match engine, (c) match UI + reconciliation workflow.

### Phase 6: Data Health Page
**Rationale:** Must come last -- validates ALL other features data integrity. Building it before bank recon means updating it again.
**Delivers:** Centralized data quality dashboard with automated checks, cron-based monitoring, actionable fix paths
**Addresses:** D-1 (Data Health)
**Avoids:** CP-7 (stale monitoring -- cron + actionable fixes + dashboard banner for critical issues)
**Complexity:** Medium. Read-only queries aggregating existing tables. No new tables needed.

### Phase 7: Polish & Integration
**Rationale:** Final pass after all features are in place.
**Delivers:** Dashboard banners for critical data health issues, cross-feature consistency validation, documentation updates
**Complexity:** Low.

### Phase Ordering Rationale

- **Phases 1-2 are non-negotiable first** because revenue and COGS accuracy affect every downstream calculation. Building reconciliation or data health on broken data creates false confidence.
- **Phase 3 (Attendance) is independent** and can run in parallel with Phase 2 or Phase 4 if multiple developers are available.
- **Phase 4 (Export) before Phase 5 (Reconciliation)** because export is trivial and quick, while reconciliation is the longest single feature.
- **Phase 5 (Reconciliation) before Phase 6 (Data Health)** because data health should include reconciliation status checks.
- **Phase 6 (Data Health) last** because it reads from ALL other features tables and validates their correctness.

### Research Flags

Phases likely needing /gsd-research-phase during planning:
- **Phase 1 (Revenue Fix):** Need to trace exact failure mode in syncInternalOrders action -- root cause analysis required before implementation
- **Phase 5 (Bank Reconciliation):** CSV format details uncertain (LOW confidence on exact BCA/Mandiri column names). Need user to provide actual exported CSV files for parser development. Matching algorithm thresholds need tuning with real data.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Full P&L):** Extension of existing query, well-understood arithmetic
- **Phase 3 (Staff Attendance):** Standard CRUD pattern with WIB timezone handling (already solved in codebase)
- **Phase 4 (Financial Export):** Existing CSV export infrastructure, just new queries
- **Phase 6 (Data Health):** Aggregation queries following established integrityChecks/ pattern

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; all existing libraries verified against npm registry and codebase usage |
| Features | HIGH | All 8 features derived from PROJECT.md with existing codebase infrastructure mapped; dependency chain validated |
| Architecture | HIGH | All recommendations based on direct codebase analysis of 70-table schema, existing query patterns, and Convex limitations |
| Pitfalls | HIGH | 8 critical/high pitfalls identified from 69 phases of production experience + Convex platform limits documentation + financial domain research |

**Overall confidence:** HIGH

### Gaps to Address

- **BCA/Mandiri CSV format (LOW confidence):** Exact column names and date formats could not be verified from official documentation. Community sources used. Must validate with actual exported CSV files from the users bank accounts before finalizing parser.
- **Reconciliation auto-match thresholds:** Scoring weights (amount 50%, date 30%, description 20%) and threshold (>=0.7 for auto-match) are theoretical. Need tuning with real transaction data after initial implementation.
- **productionLog.performedBy vs userId:** Staff attendance integration with production tracking requires matching performedBy (username string) to userId (typed ID). May need a migration or lookup table if these do not align cleanly.
- **Attendance edge cases:** Midnight-crossing shifts, split shifts, forgotten clock-outs -- UX decisions needed during planning. Research recommends: skip break tracking for v1, auto-close at midnight for forgotten clock-outs, manager correction flow with audit trail.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: convex/schema.ts, incomeStatement.ts, costCalculator.ts, integrations/internal/adapter.ts, csvExport.ts, csvImportValidation.ts, periodRange.ts, dateUtils.ts, integrityChecks/
- [Convex Limits Documentation](https://docs.convex.dev/production/state/limits) -- action timeout, document scan limit, mutation write limit
- [Convex Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions) -- cron pattern for integrity checks

### Secondary (MEDIUM confidence)
- [Bank Reconciliation Auto-Matching Best Practices](https://www.cashbook.com/auto-matching-algorithms-in-accounts-reconciliation/) -- scoring algorithm design
- [Midday Automatic Reconciliation Engine](https://midday.ai/updates/automatic-reconciliation-engine/) -- real-world matching implementation
- [BOM Cost vs COGS](https://www.spannerpd.com/blog-2/bom-cost-vs-cogs-the-sneaky-difference) -- override necessity rationale
- [Data Quality Dashboard Best Practices](https://murdio.com/insights/data-quality-dashboard/) -- health page design
- [Clock-In Apps 2026](https://connecteam.com/best-clock-in-clock-out-app/) -- kitchen-friendly UX patterns

### Tertiary (LOW confidence)
- [KlikBCA Bisnis Tutorial](https://www.klikbca.com/KbbDemo/tutorial/04-02-01a.html) -- CSV export format (may not match actual output)
- [BCA PDF to CSV Conversion](https://github.com/devbernardi/Estatement-BCA-pdf-to-CSV-or-Excel) -- community format reference, needs validation

---
*Research completed: 2026-04-07*
*Ready for roadmap: yes*
