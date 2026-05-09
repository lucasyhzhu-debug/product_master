# Phase 76 UAT — Financial Data Export

**Tested by:** _______________
**Date:** _______________
**Environment:** _______________

## Prerequisites
- Manager or admin account
- Production data has at least 1 confirmed order in the last week
- Browsers available: Chrome (current), Firefox (current), Safari (if Mac/iOS)

## Setup — formula injection seed (D-14)
Before UAT, seed a manual journal entry with the description literal `=SUM(A1:A10)` (use `/journal` page — verified at src/App.tsx:457). Note the JE entry date so it falls inside the test range.

## Checks

### 1. Navigation + role gate
- [ ] Login as manager. Visit `/financials`. Confirm "Export range…" button visible next to "Export CSV" in the header.
- [ ] Click "Export range…". Confirm URL is `/financials/export` and form is visible.
- [ ] Logout. Login as kitchen role. Try to visit `/financials/export` directly. Confirm redirect to kitchen landing page (NOT the export page).
- [ ] Logout. Login as order_staff. Confirm same redirect.

### 2. Form interaction (UI-SPEC)
- [ ] Both export-type checkboxes default to checked.
- [ ] Granularity section visible by default (P&L checked).
- [ ] Uncheck "P&L summary". Granularity section disappears.
- [ ] Re-check "P&L summary". Granularity reappears, "Weekly" selected by default.
- [ ] Click "Last week" preset. Both date pickers update — From=Monday, To=Sunday (prior ISO week per Improvement 9). Active preset chip shows ring highlight.
- [ ] Click "Custom" preset. Manually type a different date. Verify preflight refreshes within ~1s (300ms debounce — Improvement 4).
- [ ] Set start > end. Generate button disabled with tooltip "End date must be on or after start date."
- [ ] Uncheck both checkboxes. Generate button disabled with tooltip "Select at least one export type."

### 3. Preflight stats (D-12, D-16)
- [ ] Set range with known data. Confirm "Range covers N journal entries, M revenue rows, X periods." appears.
- [ ] Numbers render in tabular-nums (re-render doesn't shift digits visually).
- [ ] Set a very large range (e.g., entire year of data). Confirm `Large range` warning Alert appears with amber surface and AlertTriangle icon (only if seeded data has >10k JE lines; skip if not).

### 4. Generate + multi-file download (D-11)
- [ ] With both types checked + "Last week" preset, click "Generate exports".
- [ ] Two file downloads triggered. Filenames match `frollie-transactions-YYYYMMDD-YYYYMMDD.csv` and `frollie-pl-summary-YYYYMMDD-YYYYMMDD-weekly.csv`.
- [ ] Filename dates correspond to WIB-interpreted prior-ISO-week range (NOT off-by-one from UTC).
- [ ] Toast "Downloaded transactions and P&L summary CSVs." appears.

### 5. Single-file + granular toast (Improvement 7)
- [ ] Uncheck "Raw transactions". Click "Generate exports".
- [ ] Only ONE file downloaded (`frollie-pl-summary-...`).
- [ ] Toast "Downloaded frollie-pl-summary-...csv." appears.
- [ ] (If possible — pick a date range that has zero raw transactions but has P&L data, e.g., a future-dated range that has revenue but no JE postings yet.) With BOTH types checked, click Generate. Confirm toast "P&L downloaded; no raw transactions in range." appears (NOT the generic "Downloaded both CSVs" toast).

### 6. CSV correctness — Excel
Open `frollie-transactions-*.csv` in Microsoft Excel:
- [ ] First row contains 12 column headers in D-01 order: `entry_date, je_id, je_number, je_type, account_code, account_name, debit_idr, credit_idr, description, source_doc_type, source_doc_id, created_by`.
- [ ] Find the JE we seeded with `=SUM(A1:A10)` description. Confirm cell renders the LITERAL string (prefixed with apostrophe `'=SUM(A1:A10)`), NOT a formula result. Excel should NOT compute or display a number.
- [ ] `debit_idr` and `credit_idr` columns: every row has exactly one populated, the other is `0`. Numbers render as integers (no decimals).
- [ ] Dates render as YYYY-MM-DD; pasting back into a date column verifies WIB correctness.

### 7. CSV correctness — Google Sheets
Upload the same `frollie-transactions-*.csv` to Google Sheets:
- [ ] Same 12 column headers.
- [ ] `=SUM(A1:A10)` description cell renders the literal string (apostrophe prefix); Sheets does not execute the formula.
- [ ] Integer rendering same as Excel.

### 8. Multi-period P&L
Open `frollie-pl-summary-*.csv` in Excel:
- [ ] First row = 8-column header: `period, section, channel, line_item, amount_idr, confidence, prev_period_idr, delta_pct`.
- [ ] Second row = annotation `# Multi-period export — prev_period_idr compares against the immediately prior period within the file.`
- [ ] First period's body rows have empty `prev_period_idr` and `delta_pct` cells.
- [ ] Second period's body rows have non-empty `prev_period_idr` (matches first period's `amount_idr`).
- [ ] Bottom of file: single block starting with `# Data Quality Notes (range-aggregated)` — NOT repeated per period.
- [ ] Footer shows real product names + counts (NOT all zeros — Critical 3 follow-through). If unmapped products exist in seeded data, names appear in `# Unmapped products: ...` line.

### 9. Browser compatibility (D-11 multi-file download)
- [ ] Repeat step 4 in Chrome — both files download.
- [ ] Repeat step 4 in Firefox — both files download (may prompt for permission on first attempt; grant + retry).
- [ ] Repeat step 4 in Safari (if available) — both files download.

## Sign-off

- [ ] All checks pass: ☐ yes ☐ no
- [ ] Issues found: __________________________________________________
- [ ] Approved for merge: ☐ yes ☐ no — Signed: _________________
