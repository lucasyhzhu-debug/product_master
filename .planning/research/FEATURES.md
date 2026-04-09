# Feature Landscape

**Domain:** Financial Management & Data Quality for SME Food Production (Indonesian FMCG)
**Milestone:** v2.0 -- Financial Management & Data Quality
**Researched:** 2026-04-07
**Confidence:** HIGH -- builds on existing v1.5-v1.9 financial foundation; domain patterns well-established; existing schema and architecture deeply understood.

---

## Scope

8 features for v2.0, spanning financial reporting, bank reconciliation, workforce management, and data quality. All build on the existing Convex + React 19 stack with 70 tables, double-entry journal engine, 8-channel revenue bridge, and weekly P&L already shipping.

---

## Table Stakes

Features users expect given the existing financial system. Missing = system feels incomplete or untrustworthy.

| # | Feature | Why Expected | Complexity | Dependencies | Notes |
|---|---------|--------------|------------|--------------|-------|
| TS-1 | **Revenue Recognition Fix** | Direct sales orders (source="internal") not flowing into `externalRevenue` bridge = P&L understates revenue. Known bug (Bali order 0330-002). Users already see the gap in income statement gap analysis panel. | **Low** | `externalData/mutations.ts`, `orders/mutations/`, `incomeStatement.ts` | Debug + fix existing pipeline. Likely a missing `syncInternalOrder` call on certain order status transitions. Should be the first thing fixed -- all financial reporting is wrong without it. |
| TS-2 | **COGS Override per Product** | BOM-calculated COGS is wrong for some products (BigSeller COGS=0, ingredients not always updated). Users need a flat override field to force correct COGS when BOM is incomplete. Standard in QuickBooks, Xero, Zoho Books. | **Low** | `menuProducts` table, `costCalculator.ts`, `incomeStatement.ts` | Add `cogsOverride: v.optional(v.number())` to `menuProducts`. When set, `buildProductCOGSMap` returns override instead of BOM calculation. Simple field + conditional logic. |
| TS-3 | **Employee Profile Extensions** | Bank account fields partially exist (`bankAccountNumber`, `bankName` on `users`). Missing: hire date, base rate, bank account holder name. Required for payroll accuracy and bank reconciliation matching. | **Low** | `users` table in `schema.ts`, `UsersManager.tsx` | Add 3 optional fields: `hireDate`, `baseRate`, `bankAccountHolderName`. Straightforward schema extension + form fields. |
| TS-4 | **Full P&L with Per-Channel Breakdown (Revenue to FCF)** | Current P&L goes Revenue -> Net Income but lacks depreciation integration into the main flow, and has no FCF computation. Users doing manual calculations for cash flow. Per-channel breakdown already exists for Revenue -> EBITDA, but needs extension to Operating Income -> FCF. | **Medium** | `incomeStatement.ts`, `fixedAssets/helpers.ts`, `journalHelpers.ts` | Already 80% built. Remaining work: (1) integrate depreciation/amortization into the P&L flow properly (currently shown as a reminder banner), (2) add CapEx from fixed asset acquisitions to compute FCF = Net Income + D&A - CapEx. Straightforward extension of existing `aggregateWeek`. |
| TS-5 | **Financial Data Export** | CSV export exists for income statement (flat format) but users need: (a) raw transaction export (all `externalRevenue` + `journalEntryLines` for a period), (b) P&L summary export for weekly/monthly/custom range, (c) download button accessible from financial pages. Table stakes for any accounting system -- QuickBooks, Xero, Wave all offer this. | **Medium** | `incomeStatement.ts`, existing CSV export in `src/lib/csvExport.ts` | Build on existing `csvExport.ts`. Two export types: raw transactions (dump externalRevenue + journal lines with columns matching accountant expectations) and P&L summary (reuse incomeStatement query, format as multi-section CSV). Date range picker component needed. |

---

## Differentiators

Features that set the product apart. Not expected by all SME tools, but high-value for this specific use case (production-centric FMCG with multi-channel sales).

| # | Feature | Value Proposition | Complexity | Dependencies | Notes |
|---|---------|-------------------|------------|--------------|-------|
| D-1 | **Data Health Page** | Centralized dashboard showing automated integrity checks across the full data pipeline: revenue completeness, COGS coverage, journal balance verification, expense receipt status, bank reconciliation progress. No SME tool does this -- most hide data quality issues. Frollie already has confidence classification on every P&L figure (exact/calculated/inferred/missing) and gap analysis panel. This consolidates all data quality signals into one actionable page. | **Medium** | `integrityChecks/`, `incomeStatement.ts` (gap analysis), `expenses/fraudHelpers.ts`, new `dataHealth/` module | Aggregate existing checks (production integrity, P&L gap analysis, fraud detection) into a single page. Add new checks: (1) journal balance validation (sum debits = sum credits), (2) revenue completeness (all active channels have data for current period), (3) COGS coverage (% of products with non-zero COGS), (4) orphaned records (expenses without journals, orders without revenue). Run checks on-demand + show historical trend. |
| D-2 | **Bank Statement Reconciliation** | CSV upload for BCA/Mandiri statements, auto-match against journals/expenses/revenue by amount+date+description. Manual match UI for exceptions. Critical for Indonesian SME cash management -- most still do this in Excel. No off-the-shelf solution handles Indonesian bank formats well. | **High** | `bankAccounts` table, `journalEntryLines`, `expenses`, `externalRevenue`, `reimbursementBatches` | **Most complex feature.** Requires: (1) CSV parser with BCA/Mandiri format detection (date format DD/MM/YYYY, comma decimal separator, debit/credit columns), (2) `bankStatements` + `bankStatementLines` + `reconciliationMatches` tables, (3) auto-match engine: exact amount match within +/-2 day window, then fuzzy description match (Levenshtein >= 85 threshold), (4) match types: one-to-one, many-to-one (multiple expenses = one bank withdrawal), (5) manual match/unmatch UI with search, (6) reconciliation status tracking per statement. BCA exports PDF (needs manual CSV conversion) or KlikBCA CSV; Mandiri exports CSV from internet banking. |
| D-3 | **Staff Attendance & Production Tracking** | Clock-in/out on kitchen app (PIN-based, same auth), per-staff production tracking (balls by type, grams from `kitchenShiftRecords`), monthly summary with hours worked + output. Connects workforce cost to production output -- unique differentiator for a food production system. Most attendance apps are standalone; this integrates with the existing production pipeline. | **High** | `users` table, `kitchenShiftRecords` (already has `chefUserId`), `productionLog` (has `performedBy`), new `attendance` table | Requires: (1) `attendanceRecords` table (userId, clockIn, clockOut, date, totalHours, breaks), (2) clock-in/out UI on kitchen app (big button, PIN confirmation), (3) per-staff production query aggregating `kitchenShiftRecords` by `chefUserId` + `productionLog` by `performedBy`, (4) monthly summary page: days worked, total hours, total balls produced, balls/hour efficiency. Complexity is in the UX -- kitchen staff need one-tap clock-in that doesn't slow production. |

---

## Anti-Features

Features to explicitly NOT build in v2.0.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full payroll calculation engine** | Indonesian labor law (BPJS, PPh 21, THR) is extremely complex. Building a compliant payroll calculator is a multi-month project with regulatory risk. Current payroll entry system is sufficient. | Keep current manual payroll entry with auto-generated journal entries. Add `baseRate` to user profile for reference only (not automated calculation). |
| **Automated bank statement import via API** | BCA and Mandiri APIs require corporate banking agreements, IP whitelisting, and dedicated security infrastructure. Completely impractical for an SME internal tool. | CSV upload with format auto-detection. Manual export from KlikBCA/Mandiri internet banking is fast enough for weekly reconciliation. |
| **AI-powered transaction categorization** | Over-engineering for current volume (~50-100 bank transactions/month). Rule-based matching is sufficient and transparent. AI categorization adds opacity and debugging complexity. | Amount + date + description matching with confidence scores. Manual categorization for unmatched items. |
| **Multi-currency support** | Frollie operates entirely in IDR. No foreign suppliers or customers currently. Adding currency conversion adds massive complexity to every financial query. | All amounts in IDR. If foreign transactions appear, convert manually before entry. |
| **Budget vs. actual comparison** | Requires a full budgeting input system that doesn't exist. Listed in PROJECT.md as out of scope. | Keep P&L as actuals-only. Budget comparison is a future milestone after budget input is built. |
| **Real-time bank balance tracking** | Would need API integration with banks (see above) or constant manual updates. Low value vs. effort. | Bank balance is visible in KlikBCA/Mandiri apps. Reconciliation shows discrepancies, which is sufficient. |
| **Overtime/leave management** | Complex HR feature. Attendance clock-in/out is sufficient for production tracking. Leave management needs approval workflows, accrual calculation, etc. | Track hours worked only. Leave/overtime handled outside the system (WhatsApp/verbal as currently done). |
| **Monthly/quarterly P&L auto-generation** | Listed in PROJECT.md out of scope. Weekly P&L with custom date range export covers the immediate need. | Financial data export with custom date ranges lets users build monthly views in Excel. Add period switching in a future milestone. |

---

## Feature Dependencies

```
Employee Profile (TS-3) ─── required by ──→ Bank Reconciliation (D-2) [bank account matching]
                         └── required by ──→ Staff Attendance (D-3) [hire date for tenure]
                         └── required by ──→ Financial Data Export (TS-5) [employee names in payroll export]

Revenue Recognition Fix (TS-1) ─── required by ──→ Full P&L (TS-4) [accurate revenue needed first]
                                └── required by ──→ Data Health (D-1) [revenue completeness check]
                                └── required by ──→ Financial Data Export (TS-5) [export needs accurate data]

COGS Override (TS-2) ─── required by ──→ Full P&L (TS-4) [accurate COGS for margin calculation]
                     └── required by ──→ Data Health (D-1) [COGS coverage check]

Full P&L (TS-4) ─── required by ──→ Financial Data Export (TS-5) [P&L summary export]

Data Health (D-1) ─── optional enrichment from ──→ Bank Reconciliation (D-2) [reconciliation status check]

Staff Attendance (D-3) ─── independent (parallel-safe with other features)
Bank Reconciliation (D-2) ─── depends on TS-3 only
```

### Critical Path

```
Phase 1: TS-1 (Revenue Fix) + TS-2 (COGS Override) + TS-3 (Employee Profile)
   │      ↓ All low complexity, unblock everything else
Phase 2: TS-4 (Full P&L) + D-3 (Staff Attendance)
   │      ↓ P&L depends on Phase 1; Attendance is independent but needs TS-3
Phase 3: TS-5 (Financial Export) + D-1 (Data Health)
   │      ↓ Export needs accurate P&L; Data Health needs all checks in place
Phase 4: D-2 (Bank Reconciliation)
          ↓ Most complex, benefits from all other features being stable
```

---

## Feature Prioritization Matrix

| Feature | Business Value | Complexity | Risk | Priority | Phase |
|---------|---------------|------------|------|----------|-------|
| TS-1 Revenue Recognition Fix | **Critical** -- P&L is wrong without it | Low | Low | **P0** | 1 |
| TS-2 COGS Override | **High** -- immediate accuracy improvement | Low | Low | **P0** | 1 |
| TS-3 Employee Profile | **Medium** -- enables other features | Low | Low | **P0** | 1 |
| TS-4 Full P&L (to FCF) | **High** -- complete financial picture | Medium | Low | **P1** | 2 |
| D-3 Staff Attendance | **Medium** -- production visibility | High | Medium | **P1** | 2 |
| TS-5 Financial Data Export | **High** -- accountant handoff | Medium | Low | **P2** | 3 |
| D-1 Data Health Page | **High** -- trust in data | Medium | Low | **P2** | 3 |
| D-2 Bank Reconciliation | **Medium** -- replaces Excel workflow | High | Medium | **P3** | 4 |

---

## MVP Recommendation

**Prioritize (Phase 1 -- immediate wins):**
1. **TS-1 Revenue Recognition Fix** -- every financial report is wrong until this ships. Debug-level effort.
2. **TS-2 COGS Override** -- one field addition, massive accuracy improvement for products where BOM is incomplete.
3. **TS-3 Employee Profile Extensions** -- 3 optional fields, unblocks downstream features.

**Build next (Phase 2 -- core value):**
4. **TS-4 Full P&L to FCF** -- extend existing 80%-done P&L to completion.
5. **D-3 Staff Attendance** -- clock-in/out + production tracking. High UX complexity but high value for production management.

**Then (Phase 3 -- data trust):**
6. **TS-5 Financial Data Export** -- essential for accountant handoff, builds on completed P&L.
7. **D-1 Data Health Page** -- consolidates all data quality signals. Most valuable after other features are in place so checks have data to validate.

**Defer to last (Phase 4 -- ambitious):**
8. **D-2 Bank Reconciliation** -- highest complexity feature. Benefits from all other features being stable. Can be cut to a simpler v1 (upload + auto-match only, no many-to-one) if time-constrained.

---

## Complexity Deep Dives

### Bank Reconciliation (D-2) -- Why High Complexity

**Schema additions (3 new tables):**
- `bankStatements`: statementId, bankAccountId, uploadedAt, fileName, periodStart, periodEnd, status (uploaded/in_progress/reconciled), totalTransactions, matchedCount, unmatchedCount
- `bankStatementLines`: statementId, date, description, amount (positive=credit, negative=debit), balance, category, rawData (original CSV row), matchStatus (unmatched/auto_matched/manual_matched/excluded), matchedEntityType (expense/revenue/reimbursement/journal/payroll), matchedEntityId, matchConfidence, matchedAt, matchedBy
- `reconciliationSessions`: statementId, startedAt, completedAt, autoMatchCount, manualMatchCount, unmatchedCount, reconciledBy

**Auto-match engine complexity:**
1. Parse CSV (BCA vs Mandiri detection by column headers)
2. Normalize amounts (handle comma as decimal separator)
3. Date normalization (DD/MM/YYYY -> epoch)
4. For each bank line, search candidates: expenses (by amount+date), externalRevenue (by revenueNet+date), reimbursementBatches (by totalAmount+transferDate), journalEntryLines (by debitAmount/creditAmount+entryDate)
5. Score matches: exact amount = 50 points, date within 1 day = 30 points, date within 2 days = 20 points, description fuzzy match >= 85 = 20 points
6. Accept matches >= 80 points as auto-match
7. Flag 60-79 as suggested match (user confirms)
8. Below 60 = unmatched (manual only)

**UI complexity:**
- Split view: bank statement lines (left) vs matched/candidate items (right)
- Filter by match status (all/matched/unmatched/suggested)
- Manual match: click bank line, search candidates, confirm
- Unmatch: click matched pair, confirm undo
- Summary header: X/Y matched, $Z reconciled, $W unreconciled

### Staff Attendance (D-3) -- Why High Complexity

**Not the schema or queries** (straightforward). The complexity is in UX:
1. Kitchen staff are in gloves, handling food. Clock-in must be one-tap after PIN.
2. Forgot to clock out? Need end-of-day auto-close or manager correction.
3. Break tracking: simple start/end or skip it entirely? (Recommend: skip for v1.)
4. Production attribution: `productionLog.performedBy` is a username string, not a userId. Need to match or migrate.
5. Monthly summary needs to cross-reference: (a) attendance hours from `attendanceRecords`, (b) production output from `kitchenShiftRecords` grouped by `chefUserId`, (c) ball counts from `productionLog` grouped by `performedBy`.
6. Edge cases: double clock-in, clock-in on wrong date (midnight shift), multiple clock-in/out per day (split shift).

---

## Existing Infrastructure Leverage

| Feature | What Already Exists | What's New |
|---------|---------------------|------------|
| Revenue Fix (TS-1) | `externalRevenue` bridge, `internal` adapter, order mutations, gap analysis panel | Fix the pipeline gap -- likely 1-2 missing function calls |
| COGS Override (TS-2) | `menuProducts.unitCost` cache, `buildProductCOGSMap`, `incomeStatement.ts` COGS resolution | One schema field + one conditional in cost calculator |
| Employee Profile (TS-3) | `users.bankAccountNumber`, `users.bankName` already exist | 3 additional optional fields + form UI |
| Full P&L (TS-4) | Weekly P&L with Revenue -> Net Income, depreciation banner, journal aggregation | FCF = Net Income + D&A - CapEx computation |
| Financial Export (TS-5) | `csvExport.ts` with flat format, income statement query | Date range picker, raw transaction dump query, multi-section CSV |
| Data Health (D-1) | `integrityChecks/` (production), gap analysis (P&L), `fraudHelpers.ts` (expenses) | Consolidation page + 4-5 new automated checks |
| Bank Reconciliation (D-2) | `bankAccounts` table, `journalEntryLines`, expense/reimbursement tables | 3 new tables, CSV parser, matching engine, split-view UI |
| Staff Attendance (D-3) | `kitchenShiftRecords.chefUserId`, `productionLog.performedBy`, PIN auth | `attendanceRecords` table, clock-in/out UI, monthly summary |

---

## Sources

- [Bank Reconciliation Best Practices 2026](https://bankreconciler.app/blogHowToAutomateBankReconciliation) -- auto-match patterns, date tolerance, confidence scoring
- [Fuzzy Matching in Bank Reconciliation](https://optimus.tech/blog/fuzzy-matching-algorithms-in-bank-reconciliation-when-exact-match-fails) -- Levenshtein threshold 85-90, blocking techniques for performance
- [Auto-Matching Algorithms for Reconciliation](https://www.cashbook.com/auto-matching-algorithms-in-accounts-reconciliation/) -- many-to-one matching, confidence tiers
- [Midday Automatic Reconciliation Engine](https://midday.ai/updates/automatic-reconciliation-engine/) -- real-world implementation of receipt-to-transaction matching
- [Data Quality Dashboard Best Practices](https://murdio.com/insights/data-quality-dashboard/) -- centralized health view, violation alerts, trend tracking
- [Data Integrity Best Practices 2026](https://atlan.com/data-integrity-best-practices/) -- continuous validation, automated rule enforcement
- [BOM Cost vs COGS](https://www.spannerpd.com/blog-2/bom-cost-vs-cogs-the-sneaky-difference) -- 40% delta between BOM and true COGS, override necessity
- [COGS Calculation Guide 2026](https://www.shopify.com/blog/cost-of-goods-sold) -- per-product cost tracking, manual override patterns
- [Top P&L Software 2026](https://wifitalents.com/best/p-l-software-1/) -- channel breakdown, drill-down analytics as standard features
- [Best Clock-In Clock-Out Apps 2026](https://connecteam.com/best-clock-in-clock-out-app/) -- one-tap clock-in, real-time monitoring, production role tracking
- [BCA PDF to CSV Conversion](https://github.com/devbernardi/Estatement-BCA-pdf-to-CSV-or-Excel) -- BCA statement format reference
