---
phase: 72
plan: 01
subsystem: bank-reconciliation-foundations
tags: [schema, dependencies, chart-of-accounts, fixtures]
requires: []
provides:
  - xlsx@0.20.3 from SheetJS CDN (secure)
  - fastest-levenshtein@^1.0.16 for fuzzy counterparty matching
  - bankStatements / bankStatementLines / bankKeywordRules tables
  - journalEntries.sourceType += "bank_statement"
  - accounts.by_name index
  - 3 amount-first indexes (externalRevenue, reimbursementBatches, payrollEntries) for plan 03 Layer B scan
  - 20 new PSAK-coded accounts referenced by 72-SEED-RULES.json
  - Synthetic BCA fixture generator (5 exports)
affects:
  - convex/lib/journalEngine.ts (JournalSourceType union extended)
tech-stack:
  added:
    - xlsx (SheetJS, MIT): CDN tarball 0.20.3 — avoids CVE-2023-30533 / CVE-2024-22363 on npm registry 0.18.5
    - fastest-levenshtein 1.0.16 (MIT): O(n) edit distance for fuzzy description matching
  patterns:
    - "Dependency sourcing from vendor CDN tarball (not npm registry) — precedent for other security-pinned deps"
    - "Amount-first compound indexes for cross-table lookup scans (reuses pattern from expenses.by_amount_date_submitter)"
key-files:
  created:
    - tests/fixtures/bca-sample-synthetic.ts
    - .planning/phases/72-bank-statement-parser-auto-match/72-01-SUMMARY.md
  modified:
    - package.json
    - package-lock.json
    - convex/schema.ts
    - convex/accounts/mutations.ts
    - convex/lib/journalEngine.ts
decisions:
  - "Install xlsx from SheetJS CDN tarball, not npm registry (security — CVE-pinned on npm)"
  - "Add amount-first indexes on externalRevenue/reimbursementBatches/payrollEntries during plan 01 (not deferred to plan 03) to avoid full-table scans"
  - "New accounts assigned to PSAK-aligned sub-codes (1110, 1510, 3400, 4110/4210/4310/4320/4330/4810/4820/4910, 5110/5210/5500, 6110/6310/6410/6420/6710/6810) leaving gaps for future expansion"
  - "bank_statement is non-reversible in journalEngine (matches asset_acquisition precedent — corrections via manual JE)"
metrics:
  completed: 2026-04-13
  tasks: 4
  files_modified: 5
  files_created: 1
---

# Phase 72 Plan 01: Bank Reconciliation Foundations Summary

## One-liner

Installed secure SheetJS/fastest-levenshtein deps, extended schema with 3 bank tables + `bank_statement` journal source literal + 4 new indexes (accounts.by_name + 3 amount-first indexes), added 20 rule-referenced CoA accounts, and shipped a no-PII synthetic BCA XLSX/CSV fixture generator.

## Commits

| # | Hash | Task | Message |
|---|------|------|---------|
| 1 | `59037227` | Task 1 | `chore(72-01): install xlsx@0.20.3 (SheetJS CDN) + fastest-levenshtein` |
| 2 | `4bbf95b5` | Task 2 | `feat(72-01): add bank reconciliation schema (3 tables + sourceType + indexes)` |
| 3 | `530bbc33` | Task 3 | `feat(72-01): extend CoA with 20 bank-rule accounts (72-SEED-RULES.json)` |
| 4 | `963a29e3` | Task 4 | `feat(72-01): add synthetic BCA fixture generator + extend JournalSourceType` |

## Deliverables

### 1. Dependencies (Task 1)

- **xlsx**: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (resolved 0.20.3 — verified via `npm ls xlsx`)
- **fastest-levenshtein**: `^1.0.16` (resolved 1.0.16)
- `npm audit fix` intentionally NOT run (would downgrade xlsx to CVE-vulnerable 0.18.5)

### 2. Schema (Task 2) — `convex/schema.ts`

**3 new tables:**
- `bankStatements` — immutable XLSX header. Indexes: `by_fileHash`, `by_account_period`, `by_createdAt`. PII fields (`accountNumber`, `accountHolder`) documented in-line.
- `bankStatementLines` — parsed rows + match state. Indexes: `by_statement`, `by_statement_status`, `by_matched`, `by_date`.
- `bankKeywordRules` — admin-editable auto-classification rules. Indexes: `by_ruleCode`, `by_active_priority`, `by_isCatchAll`.

**Extensions:**
- `journalEntries.sourceType` += `v.literal("bank_statement")` (11th literal)
- `accounts` += `.index("by_name", ["name"])` (plan 04 seeder consumes this)
- `externalRevenue` += `.index("by_amount_transactionDate", ["revenueGross", "transactionDate"])` (plan 03 Layer B)
- `reimbursementBatches` += `.index("by_amount_createdAt", ["totalAmount", "createdAt"])` (plan 03 Layer B)
- `payrollEntries` += `.index("by_amount_period", ["amount", "periodStart"])` (plan 03 Layer B)

### 3. Chart of Accounts (Task 3) — `convex/accounts/mutations.ts`

**20 new entries appended to `DEFAULT_ACCOUNTS`:**

| Code | Name | Type |
|------|------|------|
| 1110 | Cash / Bank — BCA Main | asset |
| 1510 | Fixed Assets — Equipment & Machinery | asset |
| 3400 | Equity — Owner Drawing / Related-Party Receivable | equity |
| 4110 | Revenue — Direct Sales / Transfers | revenue |
| 4210 | Revenue — GoPay / GoFood | revenue |
| 4310 | Revenue — OVO / ShopeePay | revenue |
| 4320 | Revenue — Marketplace Payouts (Tokopedia) | revenue |
| 4330 | Revenue — Marketplace Payouts (Shopee / AirPay) | revenue |
| 4810 | Revenue — Cafe Wholesale (Ruma 52) | revenue |
| 4820 | Revenue — Cafe Wholesale (Thirdhome) | revenue |
| 4910 | Revenue — Customer Refunds (contra-revenue) | revenue |
| 5110 | COGS — Raw Materials & Ingredients | cogs |
| 5210 | COGS — Packaging | cogs |
| 5500 | COGS — Production Labor (Contractor) | cogs |
| 6110 | OpEx — Payroll & Wages | opex |
| 6310 | OpEx — Delivery & Logistics | opex |
| 6410 | OpEx — Marketing & Printing | opex |
| 6420 | OpEx — E-commerce / Marketplace Supplies | opex |
| 6710 | OpEx — R&D / Telecom / Office / Bank Fees | opex |
| 6810 | OpEx — Legal & Licensing | opex |

Existing `seedDefaults` upsert loop handles these unmodified.

### 4. Synthetic Fixture Generator (Task 4) — `tests/fixtures/bca-sample-synthetic.ts`

**Exports:**
- `generateSyntheticBcaWorkbook(opts?)` — default 5-txn 2511-shaped dataset, reconciliation passes (0 + 136M − 76.96M = 59.04M).
- `generateYearRolloverWorkbook()` — Periode "20/12/2025 - 19/01/2026", Dec→Jan 2 txns. For year-inference edge-case test.
- `generateBrokenReconciliationWorkbook()` — default data + tampered `Mutasi Debet` footer (99,999,999). For abort-on-reconciliation test.
- `generateMultiSheetWorkbook()` — default + extra "Sheet2". For reject-multi-sheet test.
- `generateCsvSyntheticString()` — same dataset as RFC-4180 CSV. For CSV-fallback test.

All fixtures use synthetic account `9999999999` / holder `SYNTHETIC TEST CO PT` — no real PII.

## Near-duplicate Chart of Accounts entries (surfaced for P73 cleanup)

Several new accounts conceptually overlap with pre-existing PSAK accounts. Per plan guidance ("Never rename; add exact names needed by rule seed and flag near-duplicates"), the new entries were added alongside the legacy ones:

| New (Phase 72) | Legacy | Notes |
|---|---|---|
| 1110 `Cash / Bank — BCA Main` | 1100 `Cash (Bank Accounts)` | Legacy is a generic bank bucket; new is BCA-specific. P73 may repoint legacy to 1110. |
| 1510 `Fixed Assets — Equipment & Machinery` | 1500 `Fixed Assets` | Legacy is the aggregate; new is the equipment sub-account. |
| 4110 `Revenue — Direct Sales / Transfers` | 4100 `Direct Sales` | Semantically the same revenue stream. |
| 4210 `Revenue — GoPay / GoFood` | 4200 `GoFood Revenue` | New combines two settlement sources; legacy is GoFood-only. |
| 4310 `Revenue — OVO / ShopeePay` | 4300 `Shopee Revenue` | Different slice — OVO rail vs. Shopee marketplace. |
| 4320 `Revenue — Marketplace Payouts (Tokopedia)` | (none) | No legacy equivalent. |
| 4330 `Revenue — Marketplace Payouts (Shopee / AirPay)` | 4300 `Shopee Revenue` | Overlaps with legacy 4300. |
| 5110 `COGS — Raw Materials & Ingredients` | 5100 `Production COGS`, 1300 `Inventory (Raw Materials)` | Legacy 5100 is a production bucket; legacy 1300 is asset-side. New 5110 is specifically expensed-as-incurred raw materials (cash COGS). |
| 5210 `COGS — Packaging` | 5200 `Packaging COGS` | Functional duplicate — P73 consolidation candidate. |
| 5500 `COGS — Production Labor (Contractor)` | 5100 `Production COGS` | Legacy likely bundles labor + materials; new splits labor to its own account. |
| 6110 `OpEx — Payroll & Wages` | 6100 `Salaries & Wages` | Semantic duplicate. |
| 6310 `OpEx — Delivery & Logistics` | 6300 `Transportation (Local)` | Similar; new is broader (outbound shipping/OVO/Lalamove). |
| 6410 `OpEx — Marketing & Printing` | 6400 `Marketing & Promotion`, 6500 `Office & Supplies` | New bundles marketing printing into one line. |
| 6420 `OpEx — E-commerce / Marketplace Supplies` | (none) | No legacy equivalent. |
| 6710 `OpEx — R&D / Telecom / Office / Bank Fees` | 6500 `Office & Supplies`, 6700 `Software & Subscriptions` | Catch-all for misc expenses. |
| 6810 `OpEx — Legal & Licensing` | 6800 `Professional Services` | Close but distinct. |
| 3400 `Equity — Owner Drawing / Related-Party Receivable` | (none — no owner-draw account exists) | First appearance. |
| 4910 `Revenue — Customer Refunds (contra-revenue)` | (none) | First appearance. |

**Recommendation for P73:** Open a consolidation pass — either deactivate legacy duplicates after backfilling journal entry references, or rename the legacy accounts to match the new naming convention. Do NOT delete (FK integrity). The bank-rule seeder (plan 04) resolves by exact name via the new `accounts.by_name` index, so legacy accounts do not interfere with seeding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Extended `JournalSourceType` TypeScript union in `convex/lib/journalEngine.ts`**

- **Found during:** Post-Task-4 `npm run build`
- **Issue:** The TS2345 error `'"bank_statement"' is not assignable to type 'JournalSourceType'` appeared at `convex/lib/journalEngine.ts:309` after the schema's sourceType union was extended. The `JournalSourceType` type alias in journalEngine.ts was NOT listed in `files_modified` in the plan.
- **Fix:** Added `| "bank_statement"` to the `JournalSourceType` union and added `"bank_statement"` to `NON_REVERSIBLE_TYPES` (matching `asset_acquisition` precedent — corrections via manual JE, not automated void).
- **Why appropriate:** Required for `npm run build` to pass (success criterion). Matches existing precedent for non-reversible source types. Does not alter Phase 72 JE posting semantics (still "suggestion only" in P72 per D-20).
- **Files modified:** `convex/lib/journalEngine.ts`
- **Commit:** `963a29e3`

## Authentication Gates

None.

## Verification Evidence

- `npm run type-check` — PASS (clean, no diagnostics)
- `npm run build` — PASS (TypeScript project references build + Vite bundle succeed)
- `npm ls xlsx fastest-levenshtein` — resolves `xlsx@0.20.3` + `fastest-levenshtein@1.0.16`
- All schema `grep -c` acceptance criteria from plan — matched exactly (1 each for new table declarations, new sourceType literal, and new indexes)
- All 20 account names from `72-SEED-RULES.json §accountRefs` present in `DEFAULT_ACCOUNTS` (verified via scripted check)

## Self-Check: PASSED

**Files verified present:**
- `tests/fixtures/bca-sample-synthetic.ts` — FOUND
- `package.json` changes — FOUND (xlsx CDN URL + fastest-levenshtein both present)
- `convex/schema.ts` changes — FOUND (3 new tables, bank_statement literal, by_name, 3 amount indexes)
- `convex/accounts/mutations.ts` — FOUND (20 new entries)
- `convex/lib/journalEngine.ts` — FOUND (bank_statement added to union + NON_REVERSIBLE_TYPES)

**Commits verified in git log:**
- `59037227` — FOUND
- `4bbf95b5` — FOUND
- `530bbc33` — FOUND
- `963a29e3` — FOUND
