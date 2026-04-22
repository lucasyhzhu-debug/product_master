---
phase: 75-full-p-l-extension
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - convex/reports/__tests__/incomeStatement-capex.test.ts
  - convex/reports/__tests__/incomeStatement-gap-missingReversals.test.ts
  - src/lib/__tests__/csvExport.test.ts
  - src/components/financials/ChannelRow.test.tsx
  - convex/reports/incomeStatement.ts
  - src/pages/FinancialStatement.tsx
  - src/components/financials/PLRow.tsx
  - src/components/financials/ChannelRow.tsx
  - src/components/financials/DataQualityPanel.tsx
  - src/lib/csvExport.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 75: Code Review Report

**Reviewed:** 2026-04-21
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 75 delivers a full P&L extension: CapEx/FCF line items on the income statement, D/A separation from OpEx, the D-15 missing-reversal gap check, and CSV export rows for all new fields. The implementation is structurally sound — the backend pure-function architecture is followed correctly, index usage is correct, and the formula-injection sanitizer is present. No critical issues found.

Four warnings require attention before merging: an FCF confidence label that overstates precision, a potential URL.revokeObjectURL leak on fast re-clicks, a `totalOpEx` vs `opexExcludingDA` mismatch in the EBITDA formula, and a data race window in `buildMissingReversals` when `convertedExpenses` spans both periods. Three info items are noted for cleanup.

---

## Warnings

### WR-01: FCF confidence label "exact" is inaccurate — should be "calculated"

**File:** `src/lib/csvExport.ts:629`
**Issue:** The Free Cash Flow CSV row emits `confidence: "exact"`, but FCF is derived (`NI + D/A − CapEx`) — it is not a directly recorded value. "exact" misleads downstream consumers (accountants, analysts) into thinking it came straight from a ledger entry. EBITDA (line 452) correctly uses `"exact"` because it is computed from ledger entries, but FCF adds CapEx on top, which comes from a fixedAssets table scan with no ledger counterpart.

The UI `PLRow` at `src/pages/FinancialStatement.tsx:784` already passes `confidence="calculated"` for FREE CASH FLOW. The CSV is inconsistent with the UI.

**Fix:**
```typescript
// csvExport.ts line ~629
rows.push([
  periodStr,
  "summary",
  "All",
  "Free Cash Flow",
  String(data.current.freeCashFlow),
  "calculated",           // was "exact"
  String(data.previous.freeCashFlow),
  formatPrecomputedDelta(data.deltas.freeCashFlow),
]);
```

---

### WR-02: URL.revokeObjectURL called synchronously after click — blob released before download completes on slow connections

**File:** `src/lib/csvExport.ts:739-742`
**Issue:** The download helper creates a blob URL, clicks the link, immediately removes the link from the DOM, and synchronously calls `URL.revokeObjectURL`. On slow connections or when the browser has not yet started fetching the blob, revoking the URL before the download starts causes a partial or failed download. The standard pattern is to revoke inside a short `setTimeout` (100–200ms) to give the browser time to initiate the download.

**Fix:**
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
  setTimeout(() => URL.revokeObjectURL(url), 150); // give browser time to start download
}
```

---

### WR-03: EBITDA formula inconsistency — `ebitda` computed from full `totalOpEx` but displayed with `opexExcludingDA` subtotal

**File:** `convex/reports/incomeStatement.ts:494`
**Issue:** `ebitda = ebit + depreciationAmount + amortizationAmount` where `ebit = grossProfit - totalOpEx`. `totalOpEx` is the inclusive total (including 6150/6160 D/A lines). Adding back D/A from the same OpEx total is correct arithmetically: `ebitda = grossProfit - totalOpEx + DA`. However, `opexExcludingDA = totalOpEx - DA`, so `ebitda` should also equal `grossProfit - opexExcludingDA`. This is consistent.

The concern is that `opex.items` returned to the frontend (line 541–545) is filtered to exclude 6150/6160, but `totalOpEx` (line 482) is NOT filtered. The UI section header reads "Operating Expenses (excl. D/A)" and uses `opexExcludingDA` for the total (line 639 of FinancialStatement.tsx), while the per-line items in the expanded section are the filtered list. This is correct.

The actual bug: the CSV emits `"Total Operating Expenses (excl. D/A)"` at line 438 using `-data.current.opexExcludingDA`, which is correct, but the per-account OpEx rows above it (lines 400–429) iterate `data.current.opex` (already D/A-filtered by the backend). If the previous period's opex array still contains 6150/6160 items (e.g., the previous period was computed before Phase 75 deployed and the query returned unfiltered items), the `data.previous.opex.find()` lookup at line 401 can return a 6150/6160 entry, causing a phantom D/A row in the "opex" section of the CSV even though the current period correctly omits it.

This is a race condition that only appears during the transition week when one period was computed with old code and the other with new code. Post-deployment it resolves automatically, but the first export after deploy may show a phantom D/A row.

**Fix:** Add an explicit code-filter guard in the CSV opex loop to match the backend filter:
```typescript
// After line 400 in csvExport.ts
const DA_CODES = new Set(["6150", "6160"]);

for (const item of data.current.opex) {
  if (DA_CODES.has(item.code)) continue; // guard against stale data
  ...
}

for (const prevItem of data.previous.opex) {
  if (DA_CODES.has(prevItem.code)) continue; // same guard
  if (!data.current.opex.find((c) => c.code === prevItem.code)) {
    ...
  }
}
```

---

### WR-04: `buildMissingReversals` uses `expenseDate` for period scoping but `convertedExpenses` is fetched globally — misses expenses converted outside the queried period

**File:** `convex/reports/incomeStatement.ts:737-755`
**Issue:** `convertedExpenses` is fetched with a full table scan at line 649 (all expenses where `convertedToAssetId != undefined`). Then `buildMissingReversals` filters by `expenseDate >= start && expenseDate < end`. This correctly scopes the gap report to expenses dated within the period.

However, the same `convertedExpenses` list is reused for **both** `currentMissingReversals` (lines 758–761) and `previousMissingReversals` (lines 762–765). The journal entries for those expenses are fetched once at lines 725–731, building `jeByIdMap` keyed on `journalEntryId`. This is correct — all JEs for all converted expenses are pre-fetched, so both period filters can look them up.

The subtle issue: if an expense has `journalEntryId = undefined` (e.g., imported/legacy expense without a JE), `buildMissingReversals` skips it at the filter on line 740 (`e.journalEntryId`). That is correct. But `convertedExpenseJeIds` at line 723 also uses `.filter(e => e.journalEntryId)` to build the fetch list. If the same expense appears in both periods (expenseDate changes are theoretically impossible, but defensive coding matters), the `jeByIdMap` will have it. No actual bug here, but worth documenting.

The real gap: an expense with `convertedToAssetId` set but `expenseDate` outside both the current and previous period windows would silently escape both gap checks. If an accountant corrects a mis-dated expense's date field to move it out of the period, the double-count it represents becomes invisible. This is an edge case but the data quality check is advertised as catching all such cases.

**Fix:** Add a footer note in the CSV data quality section that missingReversals is scoped to the queried period only, so period-boundary edge cases are documented:
```typescript
// csvExport.ts, after the missingReversals block
rows.push([
  "# Note: missing-reversal check is scoped to the queried period; converted expenses outside this period are not flagged",
]);
```
This does not require a backend change but sets correct expectations for the accountant reading the CSV.

---

## Info

### IN-01: `escapeCell` is exported but unused outside the module

**File:** `src/lib/csvExport.ts:723`
**Issue:** `escapeCell` is exported but no other file in the codebase imports it. The same escaping logic is inlined in `generateIncomeStatementCSV`. The export is harmless but creates a public API surface with no consumers, suggesting it was extracted speculatively. Either use it inside `generateIncomeStatementCSV` to deduplicate the inline logic, or remove the export.

**Fix:** Either replace the inline `map((cell) => { ... })` block with `cell => escapeCell(String(cell ?? ""))` to actually use the extracted helper, or drop the `export` keyword.

---

### IN-02: Test helper `parseRows` is naive and will silently misparse quoted CSV cells

**File:** `src/lib/__tests__/csvExport.test.ts:114`
**Issue:** The comment at line 111 already flags this: `"assumes unquoted fields and no embedded commas"`. The formula-injection sanitizer in production code wraps cells containing commas in double-quotes, which means any channel `displayName` with a comma (e.g., `"GoFood, Indomaret"`) would break the test parser. Current test fixtures use only simple values, so this does not affect Phase 75 test correctness. But it is a future reliability risk if fixtures grow.

**Fix:** The comment is sufficient acknowledgement. No action required for Phase 75 — the note is already there. Flag for cleanup when the test suite grows.

---

### IN-03: `DataQualityPanel` re-syncs open/close state via `useEffect` on `issueCount` — but initial `useState(hasIssues)` uses a stale closure

**File:** `src/components/financials/DataQualityPanel.tsx:86-91`
**Issue:** `useState(hasIssues)` at line 86 computes the initial state from `hasIssues` at mount time. On week navigation, the parent re-renders `DataQualityPanel` with new props, `issueCount` changes, and `useEffect` on line 89 fires to sync `isOpen`. This is correct for subsequent navigations. However, if the component is mounted with `issueCount === 0` (clean week) and then the query resolves with issues (Convex loading pattern: undefined → data), the `useState` initial value was already set to `false` (from `hasIssues = false` at mount) and the `useEffect` will correctly set it to `true` on the first non-zero count. No actual bug, but the pattern is mildly fragile — a direct derivation (`const isOpen = issueCount > 0`) without local state would be simpler. Since the user can manually collapse/expand, local state is intentional. Document this with a comment.

**Fix:** Add a comment above the useEffect:
```typescript
// Re-sync: initial useState captures mount-time value; this effect handles
// subsequent period navigations and late-arriving Convex data.
useEffect(() => {
  setIsOpen(issueCount > 0);
}, [issueCount]);
```

---

_Reviewed: 2026-04-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
