# Phase 72: Bank Statement Parser & Auto-Match - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Users upload BCA bank statement CSV → system parses, classifies each line via keyword rules into CoA categories with suggested JE accounts, and auto-matches lines to existing system records (expenses / revenue / reimbursements / payroll). All results persist to new `bankStatements` + `bankStatementLines` tables. Phase 72 ships **data + pipeline + minimal read-only post-import review**. Phase 73 builds the split-view reconciliation UI, manual overrides, inline expense/JE creation, revenue gap dashboard, and JE posting.

**Requirements:** BANK-01 (BCA CSV upload with format detection), BANK-02 (auto-match to expenses/revenue/reimbursements/payroll by amount+date+description)

**Two use cases the tool serves (informs downstream UX):**
1. **Expense capture** — unmatched bank debits become a source of truth for creating expense records (inline convert in P73).
2. **Revenue audit** — per-channel aggregate comparison of bank credits vs `externalRevenue` totals exposes revenue we fail to pull (e.g. GrabFood). Dashboard is P73; data model lands in P72.

</domain>

<decisions>
## Implementation Decisions

### Storage Model

- **D-01:** Two new tables — `bankStatements` (header: fileHash, fileName, accountNumber, accountHolder, reportedPeriodStart, reportedPeriodEnd, currency, openingBalance, closingBalance, reportedDebitTotal, reportedCreditTotal, lineCount, matchedCount, uploadedBy, createdAt) + `bankStatementLines` (child rows). Mirrors the `journalEntries`/`journalEntryLines` pattern. Header fields come DIRECTLY from the BCA statement metadata rows (see D-06a) — they are the source of truth for reconciliation validation.
- **D-02:** **Polymorphic match linkage** on each line — `matchedType: v.optional(v.union(v.literal("expense"), v.literal("revenue"), v.literal("reimbursement"), v.literal("payroll")))` + `matchedId: v.optional(v.string())`. Extends the `externalRevenueItems.linkedMenuProductId` idea to four targets without adding four nullable FK columns.
- **D-03:** **Line-level reconciliation state only.** `bankStatementLines.status: v.union(v.literal("unmatched"), v.literal("auto_matched"), v.literal("suggested"), v.literal("confirmed"))`. Header counts derived via query — header stays immutable after import. P73 mutates line.status on manual action.
- **D-04:** **Duplicate dedup via file hash** stored on `bankStatements.fileHash` (SHA-256 of raw XLSX bytes). Re-upload with same hash blocked with error `"Already imported on {createdAt}"`. Secondary dedup: `(accountNumber, reportedPeriodStart, reportedPeriodEnd)` composite should also be unique — guards against re-exports of the same period with different file metadata (e.g. re-downloaded statement).
- **D-05:** **Statement period** taken from the `Periode : DD/MM/YYYY - DD/MM/YYYY` metadata row directly — NOT derived from line dates. Why: the user's actual BCA export uses `DD-Mon` date format on transaction rows (no year), so the period row is the authoritative source for year context. Line dates are reconstructed using the period's year.

### Real BCA Statement Format (input — authoritative)

Sample: `D:\OneDrive\Documents\Malo Financials\2025\2511\Mutasi - BCA - 2511.xlsx` — reference file committed conceptually via this CONTEXT.md (actual file stays outside repo for privacy).

- **D-06a:** Input file shape — **XLSX single-sheet** (not CSV). Layout:
  - **Rows 0-5 (metadata block):**
    - Row 0: `"Informasi Rekening - Mutasi Rekening"` (title banner)
    - Row 2: `"No. rekening : {accountNumber}"`
    - Row 3: `"Nama : {accountHolderCompany}"`
    - Row 4: `"Periode : DD/MM/YYYY - DD/MM/YYYY"` — year source for transaction dates
    - Row 5: `"Kode Mata Uang : Rp"`
  - **Row 6 (column headers):** `Tanggal Transaksi | Keterangan | Jumlah | Keterangan | Saldo` — note columns B and D BOTH say "Keterangan" (BCA quirk). Parser MUST use column index, not header label.
  - **Rows 7..N (transactions):** one per bank line, 5 cells each:
    - Col A `Tanggal Transaksi`: date in `DD-Mon` format with Indonesian month abbreviations (`Jan/Feb/Mar/Apr/Mei/Jun/Jul/Agu/Sep/Okt/Nov/Des`). NO year — inferred from Periode.
    - Col B `Keterangan`: raw description string (can contain counterparty name, reference codes, memo text — all concatenated; no separate fields).
    - Col C `Jumlah`: amount with format `" Rp1,000,000 "` (leading/trailing whitespace + `Rp` prefix + thousands commas + optional decimals). Parser strips to integer IDR.
    - Col D (direction flag — labelled "Keterangan" again): `"DB"` = debit (money out), `""` empty = credit (money in).
    - Col E `Saldo`: running balance, format same as Jumlah. Populated only on the LAST transaction of each day (multi-transaction days show blank balance on all but the last line).
  - **Rows after transactions (blank spacer rows)**
  - **Footer summary block (4 rows):**
    - `"Saldo Awal : {openingBalance}"`
    - `"Mutasi Debet : {totalDebit}"`
    - `"Mutasi Kredit : {totalCredit}"`
    - `"Saldo Akhir : {closingBalance}"`
- **D-06b:** **Parser validation (required on import).** After parsing all transaction rows:
  - Sum of parsed debit amounts MUST equal `Mutasi Debet`
  - Sum of parsed credit amounts MUST equal `Mutasi Kredit`
  - `Saldo Awal + Mutasi Kredit − Mutasi Debet` MUST equal `Saldo Akhir`
  - If any check fails, abort import and surface a diagnostic showing the diff (parsed vs reported). Never partially import a mis-reconciled statement — this is the audit integrity guarantee.
- **D-06c:** **CSV fallback.** Keep a CSV parser path for the same logical shape (user may manually export-as-CSV). Detection: if file extension is `.xlsx/.xls` use SheetJS; if `.csv` use Papa Parse. Shared downstream pipeline after row extraction.

### Bank Statement Line Schema

- **D-06:** `bankStatementLines` fields — source data captured literally from BCA, plus classification + matching output:
  - **Source (from statement):** `statementId: v.id("bankStatements")`, `rowIndex: v.number()` (source row number in XLSX, 1-indexed from first transaction row), `date: v.number()` (epoch ms, year inferred from statement Periode), `month: v.string()` ("YYYY-MM" derived), `rawDescription: v.string()` (full Keterangan cell contents, untouched), `direction: v.union(v.literal("debit"), v.literal("credit"))` (parsed from DB/CR flag column), `amountIdr: v.number()` (positive integer IDR, parser-normalized from Jumlah), `runningBalanceIdr: v.optional(v.number())` (Saldo — blank on non-last-of-day lines)
  - **Derived (computed by parser):** `parsedCounterparty: v.optional(v.string())` — heuristic extraction of the likely counterparty substring from `rawDescription` (trailing name-case token sequence; null if no confident extraction). Used ONLY as a display/sort aid — rules match against `rawDescription` directly.
  - **Classification (filled by match engine):** `originalCategory: v.optional(v.string())`, `matchMethod: v.optional(v.union(v.literal("keyword"), v.literal("exact_match"), v.literal("counterparty"), v.literal("linked_to_record"), v.literal("unmatched")))`, `updatedCategoryAccountId: v.optional(v.id("accounts"))`, `subCategory: v.optional(v.string())`, `plSection: v.optional(v.string())`, `matchedRuleId: v.optional(v.id("bankKeywordRules"))` (which rule fired)
  - **Journaling suggestion (not posted in P72):** `jeDebitAccountId: v.optional(v.id("accounts"))`, `jeCreditAccountId: v.optional(v.id("accounts"))`
  - **Record linkage:** `matchedType`, `matchedId` (see D-02)
  - **Revenue attribution:** `linkedChannel: v.optional(v.string())`
  - **Review meta:** `overrideCategoryAccountId: v.optional(v.id("accounts"))` (P73), `confidence: v.union(v.literal("exact"), v.literal("strong"), v.literal("suggested"), v.literal("none"))`, `notes: v.optional(v.string())`, `status` (D-03), `isAutoMatched: v.boolean()`, `flags: v.optional(v.array(v.string()))` (inherited from matched rule — e.g. `capex_needs_asset_register`)
  - **Note on `debitIdr`/`creditIdr`:** **Not separate fields** — use `direction` + `amountIdr` (simpler, matches BCA shape). View layer can synthesize split columns for the reconciliation table display if needed.

### Scope: Bank Formats & Upload UX

- **D-07:** **BCA only.** Single format, single source-of-truth shape (see D-06a). No Mandiri or other banks in P72. Adding banks later = new parser module in a registry. (Phase 72 goal in ROADMAP references BCA/Mandiri; we are narrowing to BCA based on actual business scope.)
- **D-08:** **XLSX primary, CSV fallback.** Primary input is BCA's `.xlsx` e-statement export (format described in D-06a). Parser dependency: SheetJS (`xlsx` npm package) — widely used, MIT, no native deps. CSV path uses existing Papa Parse from `src/lib/csvImportValidation.ts` for the same logical shape.
- **D-08a:** **Output display = user's original reconciliation table.** The 17-column reconciliation view (from the user's pasted table, see `<specifics>`) is the OUTPUT layout for the review page — source columns (Date, Description, Debit, Credit, Saldo) rendered on the left, classification + JE suggestion columns on the right. Kept as-is — only the INPUT format changed.
- **D-09:** **New dedicated page `/bank-reconciliation`** under Financial nav section. Separate from `/import` (Phase 71 Bulk Import). P72 ships upload wizard + minimal read-only post-import review list. P73 builds the full split-view review UI on the same route.
- **D-10:** Upload wizard mirrors Phase 71 Bulk Import shell — state machine `upload → validating → review → importing → complete → error`. Do not share state; different parsing paths and different row schemas.

### Match Engine

- **D-11:** **Two-layer matching** per line:
  - **Layer A — Keyword/Counterparty classification:** Evaluate `bankKeywordRules` against the line's `rawDescription` + `direction`. `counterpartyPatterns` in a rule = **substring-in-rawDescription match** (case-insensitive) — there is no separate counterparty field in the BCA input (see D-06a). `descriptionPatterns` = same but semantically for memo keywords. Rule's `direction` must match the line's `direction` (`debit`/`credit`) unless rule is `any`. Sets `originalCategory`, `updatedCategoryAccountId`, `subCategory`, `plSection`, `jeDebitAccountId`, `jeCreditAccountId`, `matchMethod`, `matchedRuleId`, and `flags` (from the rule). Rules evaluated by `priority DESC, ruleCode ASC`; first match wins; catch-all (`isCatchAll`) evaluated LAST.
  - **Layer B — Record linkage:** Independently of Layer A, try to link to existing `expenses` / `externalRevenue` / `reimbursementBatches` / `payrollEntries` by `amountIdr exact + date within ±3 days + fuzzy description similarity`. If found, sets `matchedType` + `matchedId` + `matchMethod="linked_to_record"` (layering note: Layer B's match can coexist with Layer A's classification — e.g. a payroll payment matched via B still keeps its O01 JE suggestion from A; P73 user resolves which takes precedence).
- **D-12:** **Confidence tiers** — string literal union `"exact" | "strong" | "suggested" | "none"`, mirroring `externalRevenueItems.matchConfidence`. Mapping:
  - `exact` = keyword rule exact pattern match, OR linked record with amount+date+description all matching
  - `strong` = keyword contains match with ≥1 high-priority rule, OR linked record with amount+date exact + description fuzzy score ≥ 0.8
  - `suggested` = lower-confidence keyword OR fuzzy description only with amount+date window match
  - `none` = no rule matched, no record linked
- **D-13:** **Fuzzy description matching** for record linkage uses Levenshtein similarity. Start with a minimal implementation (`fastest-levenshtein` or hand-rolled) — do NOT pull in heavy NLP libs. Threshold for "strong" tier: similarity ≥ 0.8 after lowercase + remove-whitespace normalization.
- **D-14:** **Date window** for record match: ±3 days default. Tune later if hit rate is off.
- **D-15:** Payroll match uses `users.bankAccountHolderName` (added in Phase 70 DA-04) — description contains holder name AND amount exact AND date within window.
  - **D-15 Revision (2026-04-13):** Earlier draft referenced `users.bankAccountHolderName` — that field exists but `payrollEntries` has NO `userId` link to `users` (see `convex/schema.ts:1949-1978` — only `recipientName: v.string()`). Actual implementation: Layer B matches `payrollEntry.recipientName` substring in bank line's `rawDescription` directly (case-insensitive), amount exact, date in ±14 day window of `periodStart` (payroll period bounds are looser than the ±3 day window used for expenses). Still skip the payroll scan entirely for lines flagged `related_party` (B02 matches) per D-17b.

### Keyword Rules Table

- **D-16:** **New `bankKeywordRules` table** with admin CRUD. Schema enriched after parsing real rule seed (see `72-SEED-RULES.json`) — counterparty, direction, and multi-pattern matching are first-class:
  ```
  {
    ruleCode: v.string(),                          // "R01", "C02", etc. for traceability to source table
    plSection: v.union(
      v.literal("Revenue"),
      v.literal("COGS"),
      v.literal("OpEx"),
      v.literal("Below the Line")
    ),
    direction: v.union(
      v.literal("debit"),
      v.literal("credit"),
      v.literal("any")
    ),                                              // FIRST-CLASS predicate — OVO credit ≠ OVO debit
    matchType: v.union(
      v.literal("counterparty"),
      v.literal("description_contains"),
      v.literal("description_exact"),
      v.literal("description_regex"),
      v.literal("counterparty_or_keyword"),
      v.literal("counterparty_and_keyword"),
      v.literal("catch_all")
    ),
    counterpartyPatterns: v.optional(v.array(v.string())),  // case-insensitive contains match
    descriptionPatterns: v.optional(v.array(v.string())),   // multi-pattern array
    descriptionPatternsMode: v.union(
      v.literal("any"),                             // any-match
      v.literal("all"),                             // all-must-match
      v.literal("hint")                             // not required; raises confidence if matches
    ),
    isCatchAll: v.boolean(),                        // catch-all rules evaluate LAST regardless of priority
    categoryAccountId: v.id("accounts"),            // CoA category
    subCategoryTemplate: v.optional(v.string()),    // e.g. "BCA Bank Admin Fee"
    jeDebitAccountId: v.id("accounts"),
    jeCreditAccountId: v.id("accounts"),
    linkedChannel: v.optional(v.string()),          // "gopay" | "ovo" | "tokopedia" | "shopee" | "cafe_ruma52" | ...
    confidence: v.union(
      v.literal("exact"),
      v.literal("strong"),
      v.literal("suggested")
    ),
    priority: v.number(),                           // 100/80/60/40/20 — higher evaluated first
    flags: v.optional(v.array(v.string())),         // "direction_sensitive" | "needs_line_item_review" | "capex_needs_asset_register" | "negates_revenue" | "related_party" | "catch_all_misc"
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.id("users")),
  }
  ```
- **D-17:** **Seed 26 rules** from `72-SEED-RULES.json` (not 15-20 — real rule set is richer). Seed runs once via Convex dashboard `Functions` tab via `bankKeywordRules:seedDefaults` (follow `tags:seedDefaults` / `menuProducts:seedDefaults` pattern). Seeder resolves logical `accountRef` names to `accounts._id` at seed time — if any ref cannot be resolved, seed fails loudly with the unresolved list (never silently skip).
- **D-17a:** **CoA prerequisite.** Seeder requires 19 specific accounts to exist (listed in `accountRefs` section of `72-SEED-RULES.json`). If missing, planner must insert a "CoA setup wave" before the rule-seed wave — either add missing accounts to the seed itself, or document manual CoA setup as a runbook step.
- **D-17b:** **Evaluation semantics.** Engine iterates rules by `priority DESC, ruleCode ASC`. For each candidate rule: (1) direction must match line direction (unless rule.direction="any"); (2) if `counterpartyPatterns` provided, line counterparty must case-insensitive-contain at least one; (3) if `descriptionPatterns` provided, apply `descriptionPatternsMode`: `any`=at least one matches, `all`=every one matches, `hint`=optional but presence elevates confidence. Catch-all rules (R01) evaluated ONLY after every non-catch-all failed — the engine must segregate these regardless of priority.
- **D-17c:** **Special CapEx handling (B01).** When a line matches B01, the suggested JE is placeholder only — the P73 confirmation flow should route CapEx lines into the Asset Register intake (Phase 45+) so depreciation schedule is set up rather than posting a flat DR to Fixed Assets. Flag `capex_needs_asset_register` surfaces this on the line.
- **D-18:** **Admin CRUD page for rules** — either a dedicated `/bank-rules` page or an integrated "Rules" tab on `/bank-reconciliation`. P72 ships the CRUD; P73 adds the "learn from override" flow (when user overrides a line's category, offer to save the description pattern as a new rule).
- **D-19:** Rules are **admin-only** (same `requireRole(ctx, token, ["admin"])` guard as other sensitive mutations).

### JE Creation Timing

- **D-20:** **Phase 72 does NOT post journal entries.** All ledger-side effects happen in Phase 73 via explicit user "Confirm" action. P72 only persists suggestions — `jeDebitAccountId` and `jeCreditAccountId` are proposals, not commitments.
- **D-21:** **Add `"bank_statement"` literal** to `journalEntries.sourceType` union (schema change lands in P72 even though P73 uses it — avoids a second schema migration). `journalEntries.sourceId = bankStatementLines._id` (as string) for confirmed entries.
- **D-22:** Each confirmed line in P73 creates a 2-line JE: DR = line's `jeDebitAccountId`, CR = line's `jeCreditAccountId`, amount = `debitIdr || creditIdr`.

### Revenue Aggregation (scope-boundary with P73)

- **D-23:** **Data model for per-channel aggregation lands in P72** (`linkedChannel` field on `bankStatementLines` populated by revenue-type keyword rules). **Aggregation dashboard ships in P73** — compares `SUM(creditIdr) GROUP BY linkedChannel, period` vs `SUM(externalRevenue.revenueGross) GROUP BY source, period` and surfaces diffs.
- **D-24:** **Channel-by-channel rollout** — revenue classification rules implemented iteratively as patterns emerge. Start with GrabFood, Shopee, TikTok, direct-transfer. Unmatched credits stay with `linkedChannel = null` and flag for P73 review (user manually allocates, which becomes the basis for a new rule).

### Phase 72 UI Scope

- **D-25:** Post-import view in P72 is **read-only list** showing each parsed line with: date / description / debit-credit / classified category / matched-to / confidence badge. No edit actions, no split-view, no manual match/unmatch. All user-facing review actions belong to P73.
- **D-26:** Statement history list: previously-uploaded statements as a simple table (fileName, period, line count, matched %). Click-through currently dead-ends at the read-only review (P73 replaces with split-view).

### Approach: AI vs Rules

- **D-27:** **Rules-only. No AI / LLM in P72 or P73.** Keyword rules are deterministic, debuggable, and free. "Learn from manual override" in P73 gives 90% of AI's value without the cost. Real AI revisited only if rule-based hit rate plateaus below ~90% (Deferred).

### Parser Contract (BCA XLSX)

- **D-28:** **Parser responsibilities (deterministic, testable):**
  1. Read sheet via SheetJS. Accept only single-sheet workbooks; reject with diagnostic if multi-sheet.
  2. Extract metadata from rows 2-5 by regex against column A:
     - `/^No\. rekening\s*:\s*(\S+)/` → `accountNumber`
     - `/^Nama\s*:\s*(.+)$/` → `accountHolder`
     - `/^Periode\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/` → `reportedPeriodStart`, `reportedPeriodEnd`
     - `/^Kode Mata Uang\s*:\s*(\w+)/` → `currency` (validate === "Rp", fail otherwise — P72 is IDR-only)
  3. Locate header row by matching column A cell === `"Tanggal Transaksi"`. Fail import if not found.
  4. Iterate rows below header until a row's column A is blank AND column B is blank (end of transactions). Skip blank spacer rows but treat a fully-blank row as potential terminator — then check if following rows look like footer.
  5. For each transaction row:
     - **Date:** Parse `DD-Mon` using Indonesian month map (`Jan, Feb, Mar, Apr, Mei, Jun, Jul, Agu, Sep, Okt, Nov, Des`). Year resolved from `reportedPeriodStart`; rollover heuristic if period spans year boundary — use period month to pick year.
     - **Description:** Trim col B verbatim. Keep original casing. No interpretation.
     - **Amount:** Col C stripped of whitespace and `Rp` prefix and thousands commas → parse as integer (or decimal if present, multiplied by 100 then rounded to integer IDR if sub-rupiah).
     - **Direction:** Col D === `"DB"` → `direction="debit"`; empty → `direction="credit"`. Any other value → fail row with diagnostic.
     - **Saldo:** Col E parsed same as amount if present; null if blank.
     - **Heuristic counterparty parse:** Attempt to extract trailing name-case token sequence (2+ consecutive all-caps or Capitalized words) from `rawDescription`. Null if no confident match. Never required for matching — purely cosmetic.
  6. Locate footer: scan remaining rows for `Saldo Awal`, `Mutasi Debet`, `Mutasi Kredit`, `Saldo Akhir` labels via regex. Extract numeric values.
  7. **Reconciliation check:** computed sum-of-debits must equal `Mutasi Debet`; sum-of-credits must equal `Mutasi Kredit`; `openingBalance + credits − debits` must equal `closingBalance`. On failure, return import error listing expected vs actual — do NOT persist partial state.
  8. Return structured `ParsedStatement { header, lines[] }` ready for insertion.
- **D-29:** **Year rollover edge case:** when `reportedPeriodStart.month > reportedPeriodEnd.month` (period crosses December-January), use this rule: if the line's `DD-Mon` month >= period start month, use start year; else use end year. Unit test this explicitly with a Dec-Jan period.
- **D-30:** **Indonesian month map** defined in `convex/lib/indonesianDate.ts` (new file): `{ Jan: 0, Feb: 1, Mar: 2, Apr: 3, Mei: 4, Jun: 5, Jul: 6, Agu: 7, Sep: 8, Okt: 9, Nov: 10, Des: 11 }`. Export for reuse by any downstream Indonesian-format parsing.

### Claude's Discretion

- SheetJS parsing options (cellDates/raw flags tuning)
- Exact parser error message wording
- Counterparty heuristic extraction algorithm details (regex vs NER-light; err on "null if uncertain")
- Levenshtein library choice (`fastest-levenshtein` vs hand-rolled) — pick lighter option
- Confidence threshold tuning (0.8 fuzzy) — revisit after first real import
- Exact seed rule set content — start from user template; expand as edge cases surface
- Read-only review table pagination / sort defaults (date desc likely)
- Account-ID lookup strategy in seed (by `code` or `name` — follow existing `accounts` seed conventions)
- Levenshtein normalization details (case, whitespace, punctuation stripping)
- Multi-sheet XLSX handling beyond "reject" — could allow user to pick sheet, defer to P73 if needed

### Folded Todos

None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §Phase 72 (lines 233-242) — goal + success criteria
- `.planning/REQUIREMENTS.md` BANK-01, BANK-02 (lines 33-34) — acceptance criteria

### Prior-phase decisions that feed this phase
- `.planning/phases/70-data-accuracy-foundation/70-CONTEXT.md` D-11, D-13 — `users.bankAccountHolderName` for payroll matching
- `.planning/phases/71-bulk-expense-upload-asset-reclassification/71-CONTEXT.md` D-13..D-17 — Bulk Import wizard pattern + editable preview UX

### Existing schema (to reference, NOT extend in P72 unless noted)
- `convex/schema.ts` lines 1701-1722 — `accounts` (CoA; source for category + JE account dropdowns)
- `convex/schema.ts` lines 1723-1784 — `expenses` (match target: amount + expenseDate + description + vendorName)
- `convex/schema.ts` lines 1092-1137 — `externalRevenue` (match target: revenueGross + transactionDate + source)
- `convex/schema.ts` lines 1138-1157 — `externalRevenueItems.matchConfidence` union (**mirror this pattern** on `bankStatementLines.confidence`)
- `convex/schema.ts` lines 1796-1831 — `reimbursementBatches` (match target: totalAmount + createdAt)
- `convex/schema.ts` lines 1949-1978 — `payrollEntries` (match target: amount + periodStart + recipientName + holder-name match)
- `convex/schema.ts` lines 1833-1862 — `journalEntries` (**add `"bank_statement"` to sourceType union in P72**)
- `convex/schema.ts` lines 1866-1876 — `journalEntryLines` (used by P73 on confirmation)
- `convex/schema.ts` lines 1879-1887 — existing `bankAccounts` (reimbursement transfer accounts; NOT modified by P72)
- `convex/schema.ts` line 466 — Phase 70 DA-04 `users.bankAccountHolderName` anchor

### Accounting helpers / backend
- `convex/accounts/queries.ts` — account list for dropdowns
- `convex/lib/journalEngine.ts` — `createJournalEntryWithLines` (P73 uses on confirmation)
- `convex/lib/auth.ts` — `requireRole(ctx, token, ["admin"])` for all P72 mutations
- `convex/lib/functions.ts` — `protectedMutation` / `protectedQuery` wrappers

### CSV import patterns to reuse
- `src/lib/csvImportValidation.ts` — Papa Parse integration, `parseAndValidateCsv`, `chunkArray`, `escapeCsv`
- `src/lib/__tests__/csvImportValidation.test.ts` — test structure for parser validators
- `src/pages/HistoricalImportPage.tsx` — wizard state machine (`WizardState` union) to adapt

### User-provided canonical template
- BCA e-statement CSV template — captured in `<specifics>` section below (not in a standalone file; this CONTEXT.md is the source of truth for schema derivation)
- **`.planning/phases/72-bank-statement-parser-auto-match/72-SEED-RULES.json`** — machine-readable seed for 26 rules with logical account refs, consumed by `bankKeywordRules:seedDefaults`. **Authoritative source** for the seed rule set — prose examples in this doc are illustrative only.

### Legacy (do NOT extend)
- `convex/journalImport/mutations.ts` `bulkCreateJournalEntries` — legacy; P72 does not touch it

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`externalRevenueItems.matchConfidence` literal union** — exact pattern to mirror on `bankStatementLines.confidence`. Keeps schema consistent and avoids numeric-score drift.
- **`csvImportValidation.ts` Papa Parse pipeline** — reuse parsing core with BCA-specific column mapping. Row validation helpers (`chunkArray`, `escapeCsv`) reused as-is.
- **`HistoricalImportPage.tsx` wizard shell** — `upload | validating | review | importing | complete | error` state union pattern. Copy shape, don't share state (different data flow).
- **`accounts` table** (Phase 54 Accounting foundation) — source for every CoA / JE account dropdown in `bankKeywordRules` admin page.
- **`createJournalEntryWithLines`** in `convex/lib/journalEngine.ts` — P73 posts JEs via this helper using `sourceType="bank_statement"`.
- **`protectedMutation`/`protectedQuery` wrappers** — consistent auth pattern across new mutations.
- **Admin-gated UsersManager/MenuProductsManager CRUD pages** — pattern template for `/bank-rules` admin CRUD UI.

### Established Patterns

- **Confidence as literal union, not numeric score** — established by `externalRevenueItems`; continued here.
- **`v.id("accounts")` for all CoA account references** — established throughout accounting module (expenses, payrolls, invoices).
- **CSV upload with preview-before-commit** — established by Phase 71 Bulk Import wizard.
- **Polymorphic FK via `type` + `id` string pair** — NOT previously used in this codebase. P72 introduces it. Trade-off accepted over four nullable FK columns for cleaner queries; downside: no Convex-level referential integrity check on `matchedId` (mutation must validate).
- **Keyword-rule-with-priority pattern** — new; model after CoA/tag/rule patterns elsewhere but formalized in `bankKeywordRules`.

### Integration Points

- **Routing:** New route `/bank-reconciliation` in `src/App.tsx`, wrapped in `<ProtectedRoute>`. Permission: `canAccessAssets` (admin/manager) or new `canManageBankReconciliation` — planner's call.
- **Nav:** Add "Bank Reconciliation" entry under Financial section in sidebar.
- **Schema migration:** Add `"bank_statement"` to `journalEntries.sourceType` union in P72 (even though posting happens in P73) — avoids a second schema revision.
- **Seeding:** `bankKeywordRules:seedDefaults` callable from Convex dashboard, same pattern as `tags:seedDefaults`. Requires `accounts` to already be seeded (Phase 54).

</code_context>

<specifics>
## Specific Ideas

### Auto-Seed Rules (full parsed set)

**`72-SEED-RULES.json`** is the canonical machine-readable seed — 26 rules (R01-R12, C01-C03, O01-O09, B01-B02) with logical account refs, direction, counterparty/description patterns, confidence, priority, and flags. The planner should treat this as authoritative over the prose examples below and wire the seeder to consume it directly.

**Summary of rule set:**
- 12 Revenue rules (R01-R12): direct sales, platform payouts (GoPay, OVO, Tokopedia, Shopee, Katiga), B2B (Skala Pangan), cafes (Ruma 52, Thirdhome), auto-credit patterns, refunds (contra-revenue)
- 3 COGS rules (C01-C03): raw materials, packaging, production labor
- 9 OpEx rules (O01-O09): payroll, logistics (shipping/LalaMove/OVO-debit), printing, e-commerce supplies (Shopee/Tokopedia debit), legal, R&D/misc
- 2 Below-the-Line rules (B01-B02): CapEx, owner draws

**Precedence tiers (priority DESC):**
- 100 — Named personal/entity counterparties (R11, R12, B02)
- 80 — Platform counterparties (R02-R07)
- 60 — Description pattern OR counterparty (C01-C03, O01, O03, O04, O06, O07, B01)
- 40 — Description keyword + direction (O02, O05, O08, O09, R08, R09, R10)
- 20 — Catch-all (R01 only) — evaluated LAST regardless of priority via `isCatchAll=true`

**Critical ambiguities handled by direction or counterparty:**
- OVO: credit=revenue (R03), debit=logistics (O04)
- Shopee: credit=marketplace revenue (R05), debit=e-commerce supplies (O06)
- Tokopedia: credit=marketplace revenue (R04), debit=e-commerce supplies (O07)
- "Stickers" keyword: NIU ULUNG/NILSON counterparty → packaging (C02); PILAR/JOSS PRINT counterparty → printing (O05)
- Pierre (C03 production vs O02 shipping): description keyword disambiguates
- BI-FAST: credit from unknown individual = Direct Sales (R09); debit to named owner = Owner Draw (B02)

### Real BCA XLSX reference sample

File: `D:\OneDrive\Documents\Malo Financials\2025\2511\Mutasi - BCA - 2511.xlsx` (November 2025 MALO GROUP BAHAGIA PT statement, 5 transaction rows). Parsed during discuss-phase on 2026-04-12 to confirm layout. Representative row breakdown:

| Row | Cell A | Cell B (Keterangan) | Cell C (Jumlah) | Cell D | Cell E (Saldo) | Notes |
|---|---|---|---|---|---|---|
| 0 | `Informasi Rekening - Mutasi Rekening` | | | | | title banner |
| 2 | `No. rekening : 6044830994` | | | | | |
| 3 | `Nama : MALO GROUP BAHAGIA PT` | | | | | |
| 4 | `Periode : 01/11/2025 - 30/11/2025` | | | | | **year source** |
| 5 | `Kode Mata Uang : Rp` | | | | | |
| 6 | `Tanggal Transaksi` | `Keterangan` | `Jumlah` | `Keterangan` | `Saldo` | header (col D label is BCA quirk) |
| 7 | `19-Nov` | `BI-FAST CR BIF TRANSFER DR 019 RISTIANA ETENG` | ` Rp1,000,000 ` | `` | ` Rp1,000,000 ` | credit (empty D) |
| 8 | `20-Nov` | `ND-LAINNYA` | ` Rp50,000 ` | `DB` | ` Rp950,000 ` | debit (bank fee) |
| 9 | `30-Nov` | `TRSF E-BANKING CR 3011/FTSCY/WS95271 135000000.00 Tania investment KEVIN YOSUA / RIST` | ` Rp135,000,000 ` | `` | `` | credit, saldo blank (not end of day) |
| 10 | `30-Nov` | `TRSF E-BANKING DB 3011/FTSCY/WS95051 76876615.00 reimburse KEVIN YOSUA / RIST` | ` Rp76,876,615 ` | `DB` | `` | debit, saldo blank |
| 11 | `30-Nov` | `BIAYA ADM` | ` Rp30,000 ` | `DB` | ` Rp59,043,385 ` | last of day — running balance shown |
| 14 | `Saldo Awal : 0.00` | | | | | footer: opening |
| 15 | `Mutasi Debet : 76,956,615.00` | | | | | footer: total debit |
| 16 | `Mutasi Kredit : 136,000,000.00` | | | | | footer: total credit |
| 17 | `Saldo Akhir : 59,043,385.00` | | | | | footer: closing |

**Reconciliation check (must pass):**
- Sum of parsed debits = 50,000 + 76,876,615 + 30,000 = **76,956,615** ✓ matches `Mutasi Debet`
- Sum of parsed credits = 1,000,000 + 135,000,000 = **136,000,000** ✓ matches `Mutasi Kredit`
- 0 + 136,000,000 − 76,956,615 = **59,043,385** ✓ matches `Saldo Akhir`

This worked end-to-end on the sample file during discuss-phase — confirming the parser contract in D-28.

### User-provided reconciliation output table (canonical OUTPUT shape)

The user pasted a sample template showing 17 columns — this is the DISPLAY / output layout for the review page (NOT the input). Input is the BCA XLSX described above. Output columns:

```
No | Date (DD/MM/YYYY) | Month (MMM YYYY) | Description | Debit (IDR) | Credit (IDR)
   | Original Category | Match Method | Updated Category | Sub-Category | P&L Section
   | JE Debit | JE Credit | Source / Import Batch | Override Category | Confidence | Notes
```

**Only the first 6 columns are input to the parser.** The remaining 11 are populated by the matching engine (auto) or by P73 user review (override/notes). The engine output maps to the schema fields in D-06.

### Example rules extracted from the template (seed candidates)

| Description pattern | match type | Updated Category → account | Sub-Category | P&L Section | JE Debit → account | JE Credit → account | Confidence |
|---|---|---|---|---|---|---|---|
| `BIAYA ADM` | exact | Operating Expenses — Bank Fees & Charges | BCA Bank Admin Fee | Operating Expenses | Bank Fees & Charges Expense | Cash / Bank (BCA) | exact |
| `ND-LAINNYA` | contains | same as above | BCA Bank Admin Fee | Operating Expenses | Bank Fees & Charges Expense | Cash / Bank (BCA) | strong |
| `TRSF E-BANKING DB` + `reimburse` | contains (two-term) | Owner Draws / Related-Party Transfer | Reimburse / Related-Party Transfer | Below the Line | Owner Drawing / Related Party Receivable | Cash / Bank (BCA) | strong |
| `TRSF E-BANKING CR` + `investment` | contains (two-term) | Equity — Founder Capital Injection | Capital Injection | Equity | Cash / Bank (BCA) | Shareholder Equity — Paid-in Capital | strong |
| `BI-FAST CR` + `TRANSFER` | contains | Transfers to Individuals (Needs Review) | Founder Transfer (opening) | Equity | Cash / Bank (BCA) | Shareholder Equity — Paid-in Capital | suggested |
| `TRSF E-BANKING DB` + generic | contains | Operating Expenses — Miscellaneous | Debit Transfer — Needs Manual Review | Operating Expenses | Miscellaneous Expense | Cash / Bank (BCA) | suggested |

Two-term keyword matching (e.g. "TRSF E-BANKING DB" + "reimburse") needs a multi-pattern rule type. Planner to decide whether to model as:
- compound `keywordPattern: v.array(v.string())` (all-contains semantics), or
- split into higher-priority narrower rule + lower-priority generic rule (simpler data model).
Latter is more aligned with priority-desc evaluation. Flag for planner.

### Revenue-channel keyword seed candidates (Layer B / future P73 dashboard)

- `GRABFOOD` / `GF BILLING` / `PT GRAB TEKNOLOGI` → `linkedChannel: "grabfood"`
- `SHOPEE` / `PT AIRPAY INTERNATIONAL` → `linkedChannel: "shopee"`
- `TIKTOK` / `PT BYTEDANCE INDONESIA` → `linkedChannel: "tiktok"`
- `GOPAY` / `PT DOMPET ANAK BANGSA` → `linkedChannel: "gopay"`
- `GOFOOD` / `PT APLIKASI KARYA ANAK BANGSA` → `linkedChannel: "gofood"`

User guidance: "if you're not sure of any revenue attribution please ask in the review so we can allocate properly." Translation — uncertain credits leave `linkedChannel = null` and flag for P73 review.

### UI tone / inspiration

- The /bank-reconciliation page should feel like a financial audit tool, not a flashy dashboard
- Data-dense read-only table in P72; split-view workspace in P73
- Rules admin page modelled after MenuProductsManager (shadcn table + inline edit)

</specifics>

<deferred>
## Deferred Ideas

- **AI/LLM classification** of bank lines — revisit only if keyword rules + learn-from-override plateau below ~90% classification hit rate. Rules-only is the intentional first swing.
- **Mandiri and other bank format support** — not in P72. Add when needed by extending a parser registry; keep BCA parser as the reference implementation.
- **Multi-currency bank accounts** — not needed (BCA IDR only).
- **Batch "recategorize historical" tool** — for when rules change after initial import. Not in P72 or P73; capture for P74+.
- **Revenue aggregation dashboard (P73)** — per-channel diff table, gap indicators, drill-down to bank lines for a given channel+period. Lives in P73.
- **Learn-from-override rule creation (P73)** — when user overrides a line's category, offer "Save as rule for future imports".
- **Real-time import progress bar / long-import resilience** — P72 can be synchronous for now given statement sizes (~hundreds of lines). Revisit if BCA exports grow into thousands.
- **Automated BCA API pull** (if BCA ever exposes a dev API) — replaces CSV upload. Keep CSV as fallback.

</deferred>

---

*Phase: 72-bank-statement-parser-auto-match*
*Context gathered: 2026-04-12*
