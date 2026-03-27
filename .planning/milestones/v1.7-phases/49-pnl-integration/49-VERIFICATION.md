---
phase: 49-pnl-integration
verified: 2026-03-14T14:08:38Z
status: passed
score: 6/6 must-haves verified
---

# Phase 49: P&L Integration Verification Report

**Phase Goal:** The income statement extends below Gross Profit to show OpEx breakdown, EBIT, and Net Income sourced from journal entries
**Verified:** 2026-03-14T14:08:38Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Income statement shows Operating Expenses broken down by GL account name (6xxx accounts) below Gross Profit | VERIFIED | `FinancialStatement.tsx` lines 580-611: `SectionHeaderRow` with "Operating Expenses" label, collapsible `PLRow` items showing `{code} {name}` per account, "Total Operating Expenses" always-visible bold row. Backend `WeekData.opex` array with `{code, name, total}` populated from `aggregateJournalLines` using `by_type` index for opex accounts. |
| 2 | EBIT (Operating Profit) = Gross Profit - Total OpEx is displayed with EBIT margin percentage | VERIFIED | Backend `incomeStatement.ts` line 487: `ebit = grossProfit - totalOpEx`. Line 489: `ebitMarginPercent = (ebit / netRevenue) * 100`. Frontend lines 614-661: `PLRow` for "EBIT (Operating Profit)" with `isBold, isTopBorder`, followed by "EBIT Margin %" row with `DeltaIndicator unit="pp"`. Test at line 1110: asserts `ebit === 800000` and `ebitMarginPercent ~= 80`. |
| 3 | Other Income/Expense section (7xxx accounts) and Net Income with net margin percentage are displayed below EBIT | VERIFIED | Backend `WeekData.otherItems` populated via `aggregateJournalLines` for accounts with `type="other"`. `netIncome = ebit - totalOther` (line 491). `netMarginPercent = netIncome / netRevenue * 100` (line 493). Frontend lines 663-742: "Other Income / Expense" collapsible section, "Total Other Income / Expense" bold row, "NET INCOME" bold row with `isTopBorder`, "Net Margin %" row. Tests verify negative total for credit-normal accounts (line 1035) and full chain `netIncome = 760000` (line 1172). |
| 4 | OpEx data sourced from single indexed query on journalEntryLines by entryDate (not N+1) | VERIFIED | `incomeStatement.ts` lines 591-596: two `by_entryDate` index queries (current + previous period) in the Phase 1 `Promise.all`. No `by_account_entryDate` usage anywhere in the file. In-memory grouping via `aggregateJournalLines` pure function (lines 189-218) using `targetIds` Set for O(1) account membership check. |
| 5 | Period filtering uses entryDate (business date), not _creationTime | VERIFIED | `incomeStatement.ts` lines 592-595: `.withIndex("by_entryDate", (q) => q.gte("entryDate", currentStart).lt("entryDate", currentEnd))`. No `_creationTime` reference anywhere in the file. Test helper `seedJournalEntryWithLines` (test line 926) sets `entryDate` on journal entry lines, confirming the business date is the indexed/queried field. |
| 6 | CSV export includes OpEx, EBIT, Other Income/Expense, and Net Income sections | VERIFIED | `csvExport.ts` lines 367-525: Per-opex account rows (section "opex"), "Total Operating Expenses" row, "EBIT (Operating Profit)" row, "EBIT Margin %" row, per-other account rows (section "other"), "Total Other Income / Expense" row, "NET INCOME" row, "Net Margin %" row. `WeekData` interface extended with all new fields (lines 63-71). `IncomeStatementData.deltas` extended (lines 87-93). |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/reports/incomeStatement.ts` | Extended WeekData, aggregateJournalLines helper, single-query journal aggregation in fetchAndAggregate | VERIFIED | WeekData extended (lines 78-87). `aggregateJournalLines` pure function (lines 189-218) with `Math.abs < 0.01` near-zero filtering, total computed before filtering. `fetchAndAggregate` uses `by_entryDate` single query (lines 591-596), `by_type` for account lookups (lines 588-589). Deltas extended with totalOpEx/ebit/ebitMarginPp/totalOther/netIncome/netMarginPp (lines 725-748). |
| `src/pages/FinancialStatement.tsx` | OpEx and Other Income/Expense collapsible sections, EBIT and Net Income summary rows | VERIFIED | `opexExpanded` and `otherExpanded` state (lines 115-116, default collapsed). `unionMergeByCode` shared helper (lines 58-84) used by both `mergedOpexItems` and `mergedOtherItems` memos (lines 177-185). Operating Expenses section (lines 580-611), EBIT row (lines 614-622), EBIT Margin % (lines 624-661), Other Income/Expense section (lines 663-692), NET INCOME (lines 695-703), Net Margin % (lines 705-742). All hooks declared before conditional returns (React hooks rules compliant). |
| `src/lib/csvExport.ts` | Extended CSV with Operating Expenses, EBIT, Other Income/Expense, Net Income rows | VERIFIED | `WeekData` interface extended (lines 63-71). `IncomeStatementData.deltas` extended (lines 87-93). CSV rows added: per-opex accounts with negative sign (lines 370-383), previous-only items (lines 386-399), Total OpEx (lines 401-411), EBIT (lines 413-423), EBIT Margin % (lines 425-445), per-other accounts (lines 449-463), previous-only others (lines 465-479), Total Other (lines 481-491), NET INCOME (lines 493-503), Net Margin % (lines 505-525). |
| `tests/convex/incomeStatement.test.ts` | Integration tests for OpEx aggregation, EBIT, Other Income/Expense, Net Income, zero-balance filtering | VERIFIED | 7 new tests in `describe("P&L OpEx/EBIT/Other/NetIncome")` (lines 942-1244): empty week zeros (line 626), OpEx grouping/filtering/sorting (line 943), Other credit-normal negative total (line 1007), reversed entry cancellation (line 1039), EBIT arithmetic (line 1078), Net Income full chain (line 1115), deltas for new fields (line 1177). Test helpers: `seedAccount`, `seedUser`, `seedJournalEntryWithLines` (lines 865-936). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `incomeStatement.ts` | `journalEntryLines` | `by_entryDate` index single-query | WIRED | Lines 591-596: two `by_entryDate` range queries in parallel `Promise.all`. No N+1 pattern. |
| `incomeStatement.ts` | `accounts` | `by_type` index for opex and other accounts | WIRED | Lines 588-589: `by_type` queries for `"opex"` and `"other"` account types. Results used to build `opexIds` Set, `otherIds` Set, and `accountLookup` Map (lines 600-605). |
| `FinancialStatement.tsx` | `data.current.opex` | WeekData interface extension | WIRED | Line 179: `unionMergeByCode(data.current.opex, data.previous.opex)`. Lines 604, 605: `data.current.totalOpEx` / `data.previous.totalOpEx`. Lines 616-618: `data.current.ebit`. Lines 697-699: `data.current.netIncome`. |
| `csvExport.ts` | `WeekData` | Duplicated interface extension | WIRED | `WeekData` interface (lines 63-71) has `totalOpEx`, `ebit`, `ebitMarginPercent`, `otherItems`, `totalOther`, `netIncome`, `netMarginPercent`. `IncomeStatementData.deltas` (lines 87-93) has matching delta fields. CSV generation accesses all fields (lines 367-525). |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PNL-01 | 49-01-PLAN | OpEx broken down by GL account (6xxx) below Gross Profit | SATISFIED | `aggregateJournalLines` groups by accountId using opex accounts (`type="opex"`). Frontend shows collapsible OpEx section with per-account `PLRow` items displaying code + name. Test confirms sorting, filtering, and grouping. |
| PNL-02 | 49-01-PLAN | EBIT = Gross Profit - Total OpEx, with EBIT margin % | SATISFIED | Backend: `ebit = grossProfit - totalOpEx`, `ebitMarginPercent = ebit/netRevenue*100`. Frontend: EBIT row + EBIT Margin % row. Test asserts `ebit === 800000`, `ebitMarginPercent ~= 80`. |
| PNL-03 | 49-01-PLAN | Other Income/Expense (7xxx) and Net Income with net margin % | SATISFIED | Backend: `otherItems` from `type="other"` accounts, `netIncome = ebit - totalOther`, `netMarginPercent = netIncome/netRevenue*100`. Frontend: Other section + NET INCOME row + Net Margin % row. Test asserts negative total for credit-normal (Interest Income), full chain `netIncome = 760000`. |
| PNL-04 | 49-01-PLAN | Single indexed query on journalEntryLines by entryDate (not N+1) | SATISFIED | Two `by_entryDate` range queries (current + previous period) in the Phase 1 `Promise.all`. No `by_account_entryDate` usage in the file. In-memory grouping via `aggregateJournalLines` pure function. |
| PNL-05 | 49-01-PLAN | Period filtering uses entryDate (business date), not _creationTime | SATISFIED | Queries use `.withIndex("by_entryDate", ...)` with `entryDate` field. No `_creationTime` references in the file. `entryDate` is denormalized from `journalEntries.date` (business date). |

No orphaned requirements found -- all 5 PNL requirements are declared in the plan and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO, FIXME, PLACEHOLDER, or stub patterns found in any modified file |

### Human Verification Required

### 1. Visual P&L Layout Below Gross Profit

**Test:** Navigate to `/financials`, ensure journal entries exist for the selected period. Verify that Operating Expenses, EBIT, Other Income/Expense, and Net Income sections appear below Gross Profit with correct formatting.
**Expected:** Collapsible sections match existing Revenue/Deductions/COGS styling. EBIT and NET INCOME rows have bold text and top borders. Margin % rows show percentage with pp deltas.
**Why human:** Visual layout, spacing, alignment, and collapsible behavior cannot be verified programmatically.

### 2. CSV Export Contains All New Sections

**Test:** Click "Export CSV" on the income statement page. Open the downloaded file and verify it contains Operating Expenses, EBIT, EBIT Margin %, Other Income/Expense, NET INCOME, and Net Margin % rows.
**Expected:** OpEx amounts are negative (expense convention). EBIT and NET INCOME are positive when profitable. Margin % rows show percentage with "pp" suffix on deltas.
**Why human:** File download and spreadsheet rendering behavior.

### 3. Mobile Comparison Toggle

**Test:** View income statement on mobile. Toggle "Show comparison" and verify that previous period and delta columns appear/hide for all new P&L sections.
**Expected:** All new rows (OpEx, EBIT, Other, Net Income, margin %) correctly show/hide comparison columns.
**Why human:** Responsive behavior and mobile layout.

### Gaps Summary

No gaps found. All 6 must-have truths verified against actual codebase. All 5 requirements (PNL-01 through PNL-05) satisfied with concrete implementation evidence. All 4 artifacts pass three-level verification (exists, substantive, wired). All 4 key links confirmed wired. No anti-patterns detected. 3 items flagged for human visual verification only.

---

_Verified: 2026-03-14T14:08:38Z_
_Verifier: Claude (gsd-verifier)_
