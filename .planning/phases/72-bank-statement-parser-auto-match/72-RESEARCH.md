# Phase 72: Bank Statement Parser & Auto-Match — Research

**Researched:** 2026-04-12
**Domain:** Client-side XLSX parsing, deterministic keyword/fuzzy matching, Convex parent-child persistence
**Confidence:** HIGH (most findings verified in-repo or via npm registry)

## Summary

CONTEXT.md already fixes the schema shape, parser contract, match engine layers, seed rules, UI scope, and security posture. This research resolves the open implementation unknowns:

1. **XLSX library:** Recommend `xlsx` (SheetJS CE) installed from the **official SheetJS CDN tarball**, NOT npm. The npm-published `xlsx@0.18.5` is pinned by SheetJS as a known-vulnerable artifact (CVE-2023-30533 prototype pollution + CVE-2024-22363 ReDoS). Latest secure (`0.20.3`) is only distributed via `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. `exceljs` is a viable npm-only alternative but is 3-4× larger and overkill for single-sheet read-only parsing.
2. **Levenshtein:** Recommend `fastest-levenshtein@1.0.16` (~2 KB, zero deps). Hand-roll is fine but library gives us a well-tested O(n*m) implementation for free.
3. **File hashing:** Use `crypto.subtle.digest("SHA-256", buffer)` — already used in `src/components/expenses/ReceiptUpload.tsx`. Copy that exact helper.
4. **Seed pattern:** Follow `convex/accounts/mutations.ts` `seedDefaults` (not `tags`/`menuProducts` — accounts is the most recent and closest pattern: exports `DEFAULT_ACCOUNTS` const, upserts by unique key, resolves logical refs to `Id<"accounts">` at seed time).
5. **Parent-child insert:** Convex mutations are atomic. No explicit batching API — iterate rows and call `ctx.db.insert` in a `for` loop. Mutation arg size limit is 8 MB (well beyond any realistic statement).

**Primary recommendation:** Install `xlsx` via SheetJS CDN tarball, seed `bankKeywordRules` following the `accounts:seedDefaults` upsert pattern, and clone the HistoricalImportPage wizard state machine verbatim for `BankReconciliationPage`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

Storage & schema (D-01..D-05): Two tables `bankStatements` + `bankStatementLines`; polymorphic `matchedType`+`matchedId`; line-level reconciliation state only; SHA-256 file-hash dedup (primary) with `(accountNumber, reportedPeriodStart, reportedPeriodEnd)` secondary; statement period from BCA Periode metadata row (NOT derived from lines).

BCA format (D-06a..D-06c, D-28..D-30): XLSX single-sheet primary, CSV fallback. Metadata rows 0-5, header row 6 (`Tanggal Transaksi | Keterangan | Jumlah | Keterangan | Saldo`), transaction rows 7..N, footer block. Parser MUST run reconciliation checksum (sum debits, sum credits, opening+credits−debits=closing) and abort on mismatch. Indonesian month map lives at `convex/lib/indonesianDate.ts`. Year-rollover edge case: if `periodStart.month > periodEnd.month`, line month >= periodStart.month → start year, else end year.

Line schema (D-06): Source data literal (direction + amountIdr, NOT split debitIdr/creditIdr), derived counterparty heuristic (nullable, display-only), classification output (`originalCategory`, `matchMethod`, `updatedCategoryAccountId`, `subCategory`, `plSection`, `matchedRuleId`), journaling suggestion (`jeDebitAccountId`, `jeCreditAccountId`), record linkage (`matchedType`, `matchedId`), review meta (`confidence`, `status`, `isAutoMatched`, `flags`).

Upload UX (D-07..D-10): BCA only. XLSX primary, CSV fallback. New `/bank-reconciliation` page. Wizard mirrors Phase 71 `upload → validating → review → importing → complete → error`.

Match engine (D-11..D-15): Two-layer (Layer A keyword/counterparty classification, Layer B record linkage). Rules iterated `priority DESC, ruleCode ASC`; catch-all LAST. Confidence tiers `exact|strong|suggested|none`. Fuzzy threshold 0.8. Date window ±3 days. Payroll match uses `users.bankAccountHolderName`.

Keyword rules table (D-16..D-19): `bankKeywordRules` schema with `direction`, `matchType`, `counterpartyPatterns`, `descriptionPatterns`, `descriptionPatternsMode`, `isCatchAll`, `flags`, `priority`. Seed 26 rules from `72-SEED-RULES.json`. Resolver fails loudly if any `accountRef` unresolved. Admin CRUD page. CapEx rows flagged for Asset Register intake in P73.

JE timing (D-20..D-22): **Phase 72 does NOT post JEs.** Add `"bank_statement"` literal to `journalEntries.sourceType` union (schema change in P72). P73 user-confirmation creates the 2-line JE.

Revenue aggregation (D-23, D-24): `linkedChannel` populated in P72; dashboard ships in P73. Channel-by-channel rollout.

Phase 72 UI scope (D-25, D-26): **Read-only post-import list + statement history table.** No edit actions, no split-view, no manual match/unmatch in P72.

Approach (D-27): Rules-only. No AI/LLM in P72 or P73.

### Claude's Discretion

- SheetJS cellDates/raw flags
- Parser error wording
- Counterparty heuristic (null if uncertain)
- Levenshtein library choice (fastest-levenshtein vs hand-rolled — pick lighter)
- Confidence threshold tuning (0.8 revisit after first real import)
- Exact seed rule content — start from user template
- Read-only review table pagination / sort defaults (date desc likely)
- Account-ID lookup strategy in seed (by `code` vs `name`)
- Levenshtein normalization (case, whitespace, punctuation)
- Multi-sheet XLSX handling (reject in P72)

### Deferred Ideas (OUT OF SCOPE)

- AI/LLM classification
- Mandiri or other bank formats
- Multi-currency
- Batch historical recategorization tool
- Real revenue aggregation dashboard → P73
- Learn-from-override rule creation → P73
- Long-import streaming / progress
- Automated BCA API pull

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BANK-01 | User can upload BCA bank statement XLSX/CSV with format auto-detection | SheetJS CDN install + extension-based parser dispatch (§Standard Stack, §Code Examples) |
| BANK-02 | System auto-matches bank lines to expenses/revenue/reimbursements/payroll by amount + date + description | Two-layer engine (keyword+linkage) with `fastest-levenshtein` fuzzy score ≥ 0.8 (§Architecture Patterns) |

## Project Constraints (from CLAUDE.md)

- **camelCase field names** throughout Convex schema — applies to all new fields on `bankStatements`/`bankStatementLines`/`bankKeywordRules`.
- **Protected mutations:** use `requireRole(ctx, args.token, ["admin"])` from `convex/lib/auth.ts` OR `protectedMutation` wrapper from `convex/lib/functions.ts`. Strip `token` before `db.insert`.
- **No dynamic imports in Convex** (fails silently in prod 204). `xlsx` use stays in frontend (`src/lib/bankStatement/`), not `convex/`. Parser is client-side only.
- **Convex IDs typed** — `Id<"bankStatements">` not `string`. Exception: `matchedId` stays `v.string()` (polymorphic; locked by D-02).
- **Branch-per-phase:** phase runs on its own `feature/{slug}` branch.
- **Planning template:** every plan MUST include Git Workflow, Implementation Waves, Documentation Updates, Success Criteria (copy template from CLAUDE.md).
- **Convex returns undefined while loading** — handle in all frontend hooks.
- **Mutations are async** — always await.
- **Hooks order** — all hooks before any conditional return.
- **CHANGELOG required** after merge.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xlsx` (SheetJS CE) | **0.20.3** | Parse BCA XLSX e-statement | Dominant single-file XLSX reader; MIT; no native deps; handles BCA's irregular layout via `sheet_to_json({header: 1})`. `[VERIFIED: CVE-2024-22363 fixed in 0.20.2; SheetJS issue #2961 confirms 0.19.3+ fixes prototype pollution]` |
| `fastest-levenshtein` | **1.0.16** | Fuzzy description similarity (D-13) | ~2 KB, zero deps, well-benchmarked O(n*m). `[VERIFIED: npm view fastest-levenshtein version → 1.0.16]` |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `papaparse` | 5.5.3 | CSV fallback path (D-06c, D-08) | BCA CSV re-export. Reuse pattern from `src/lib/csvImportValidation.ts`. |
| `convex` | 1.31.7 | Backend | All queries/mutations/schema |
| `convex-test` | 0.0.41 | Backend tests | Parser + seeder integration tests |
| `vitest` | 4.0.18 | Test runner | Unit + integration |
| Web Crypto API (built-in) | — | SHA-256 file hashing (D-04) | Already used in `src/components/expenses/ReceiptUpload.tsx` — copy helper |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `xlsx` (SheetJS) | `exceljs@4.4.0` | 3-4× larger bundle (streams, writer, style engine); overkill for read-only single-sheet. Use only if SheetJS CDN supply-chain becomes a problem. `[VERIFIED: npm view exceljs version → 4.4.0]` |
| `xlsx` (SheetJS) | `read-excel-file` | Smaller but schema-validation-oriented; doesn't cope well with BCA's irregular metadata/footer rows. |
| `fastest-levenshtein` | Hand-rolled (~20 LOC) | Saves 2 KB dep; costs us maintenance of an off-the-shelf algorithm. **Not worth it** — library has 8M+ weekly downloads, zero deps. |
| Web Crypto | `spark-md5` / `crypto-js` | Web Crypto is built-in, already in use, SHA-256 is NIST-standard. No reason to add a dep. |

### Installation

**CRITICAL: Do NOT install `xlsx` from npm.** The published `xlsx@0.18.5` is pinned as known-vulnerable. Use the official SheetJS tarball:

```bash
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm install --save fastest-levenshtein
```

`[VERIFIED: SheetJS install guide https://docs.sheetjs.com/docs/getting-started/installation/nodejs]`

Note: the SheetJS tarball-url install style is supported by npm (documented, stable). It writes to `package.json` as a URL dependency. This is SheetJS's official distribution channel since the 0.19.x registry freeze.

**Version verification:**
- `xlsx` latest on npm: `0.18.5` (stale, vulnerable, 2023) `[VERIFIED: npm view xlsx version]`
- `xlsx` latest on SheetJS CDN: `0.20.3` (current, patched) `[CITED: docs.sheetjs.com]`
- `fastest-levenshtein`: `1.0.16` `[VERIFIED: npm view fastest-levenshtein version]`

## Architecture Patterns

### Recommended Project Structure

```
convex/
├── bankStatements/
│   ├── queries.ts              # listStatements, getStatement, listLines
│   ├── mutations.ts            # createStatement, updateStatementLines (admin-only)
│   ├── matchEngine.ts          # applyRules(line, rules) + findLinkedRecord(line)
│   └── __tests__/
│       ├── matchEngine.test.ts      # 26 seeded rules × positive/negative tests
│       └── mutations.test.ts        # convex-test: dedup, full-statement ingest
├── bankKeywordRules/
│   ├── mutations.ts            # seedDefaults + CRUD (admin-only)
│   ├── queries.ts              # list, getById
│   ├── defaultRules.ts         # DEFAULT_RULES exported const (from 72-SEED-RULES.json)
│   └── __tests__/
│       ├── seed.test.ts             # pure: 26 rules, no duplicates, flag literals valid
│       └── mutations.test.ts        # convex-test: seed idempotency, account-ref resolution
└── lib/
    └── indonesianDate.ts       # INDONESIAN_MONTHS + parseIndonesianDate() + yearRollover

src/
├── lib/
│   └── bankStatement/
│       ├── parseBcaXlsx.ts          # main parser: File → ParsedStatement
│       ├── parseBcaCsv.ts           # CSV fallback; same output shape
│       ├── reconciliation.ts        # checksum validator (sum debits/credits, opening+credits−debits=closing)
│       ├── fileHash.ts              # computeSha256(file) — copied from ReceiptUpload.tsx
│       ├── fuzzyMatch.ts            # normalize() + similarityScore() wrapping fastest-levenshtein
│       ├── types.ts                 # ParsedStatement, ParsedLine, ReconciliationError
│       └── __tests__/
│           ├── parseBcaXlsx.test.ts
│           ├── reconciliation.test.ts
│           ├── yearRollover.test.ts
│           └── fuzzyMatch.test.ts
├── pages/
│   └── BankReconciliationPage.tsx   # clone HistoricalImportPage wizard shape
├── components/
│   └── bankReconciliation/
│       ├── StatementUploadStep.tsx
│       ├── StatementReviewTable.tsx  # read-only P72 view
│       └── StatementHistoryList.tsx
└── hooks/convex/
    └── useBankReconciliation.ts
```

### Pattern 1: Convex seedDefaults (authoritative reference: `accounts:seedDefaults`)

**What:** Export `DEFAULT_X` array const from the mutations file. `seedDefaults` mutation is upsert-by-unique-key. Fails loudly if any FK ref cannot be resolved.

**When to use:** Always for `bankKeywordRules:seedDefaults`. Matches existing `.planning/config.json` seed_functions registry pattern.

**Reference:** `convex/accounts/mutations.ts:114-156`

```typescript
// Source: convex/accounts/mutations.ts
export const seedDefaults = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.token) {
      await requireRole(ctx, args.token, ["admin"]);
    }
    const results: Array<{ code: string; action: "created" | "updated"; id: string }> = [];
    for (const account of DEFAULT_ACCOUNTS) {
      const existing = await ctx.db.query("accounts")
        .withIndex("by_code", (q) => q.eq("code", account.code)).first();
      if (existing) {
        await ctx.db.patch(existing._id, { /* fields */ });
        results.push({ code: account.code, action: "updated", id: existing._id });
      } else {
        const id = await ctx.db.insert("accounts", { /* fields */ });
        results.push({ code: account.code, action: "created", id });
      }
    }
    return results;
  },
});
```

**Apply to bankKeywordRules:**

```typescript
// convex/bankKeywordRules/mutations.ts
export const seedDefaults = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.token) await requireRole(ctx, args.token, ["admin"]);

    // Step 1: Resolve ALL account refs BEFORE any insert (fail-loud)
    const accountRefMap = new Map<string, Id<"accounts">>();
    const unresolved: string[] = [];
    for (const refDef of DEFAULT_ACCOUNT_REFS) {
      const acc = await ctx.db.query("accounts")
        .withIndex("by_name", (q) => q.eq("name", refDef.accountName)).first();
      if (!acc) unresolved.push(refDef.ref);
      else accountRefMap.set(refDef.ref, acc._id);
    }
    if (unresolved.length > 0) {
      throw new ConvexError(
        `bankKeywordRules seed failed: unresolved account refs ${JSON.stringify(unresolved)}. Run accounts:seedDefaults first or add missing accounts to CoA.`
      );
    }

    // Step 2: Upsert each rule by ruleCode
    const results = [];
    for (const rule of DEFAULT_RULES) {
      const existing = await ctx.db.query("bankKeywordRules")
        .withIndex("by_ruleCode", (q) => q.eq("ruleCode", rule.ruleCode)).first();
      const resolved = { ...rule,
        categoryAccountId: accountRefMap.get(rule.categoryRef)!,
        jeDebitAccountId: accountRefMap.get(rule.jeDebitRef)!,
        jeCreditAccountId: accountRefMap.get(rule.jeCreditRef)!,
      };
      // strip *Ref fields before persist
      const { categoryRef, jeDebitRef, jeCreditRef, ...persist } = resolved;
      if (existing) {
        await ctx.db.patch(existing._id, persist);
        results.push({ ruleCode: rule.ruleCode, action: "updated" });
      } else {
        await ctx.db.insert("bankKeywordRules", { ...persist, createdAt: Date.now(), /* ... */ });
        results.push({ ruleCode: rule.ruleCode, action: "created" });
      }
    }
    return results;
  },
});
```

**Account-ref resolution:** Use `by_name` (rules seed has no code-based refs; names in 72-SEED-RULES.json are the authoritative keys). An index on `accounts.name` may need to be added — check `convex/schema.ts` line 1701-1722. If `by_name` doesn't exist, add it in P72 or scan via `.collect()` (acceptable for one-time seed with 54 accounts).

### Pattern 2: Parent-Child Insert in One Mutation (atomic)

**What:** Convex mutations are atomic — all `db.insert` calls in a handler succeed together or fail together. No explicit transaction API; the mutation IS the transaction.

**Evidence:** `convex/expenses/bulkMutations.ts:56-170` — iterates 50 rows, inserts expense + (conditionally) JE + audit trail, all in one mutation. Enforces 50-row batch cap to stay within Convex function-time and arg-size limits.

**When to use:** `bankStatements:createFromParsedStatement` inserts one header row + N lines in a single mutation.

**Mutation arg-size note:** Convex mutation args limited to 8 MB. A 300-line statement with ~2 KB per line ≈ 600 KB — well under. No need to chunk.

**Size guardrail:** Follow `bulkCreateExpenses` convention — add a soft cap (e.g. 2000 lines per statement) with an explicit `ConvexError` for safety. Typical BCA monthly statements are 100-500 lines.

### Pattern 3: Protected Mutation Wrapper

**Two options in this codebase:**
- `mutation({ args: { token: v.string(), ... }, handler: (ctx, args) => { await requireRole(ctx, args.token, ["admin"]); ... } })` — used by `accounts:seedDefaults`.
- `protectedMutation({ roles: ["admin"], args: { ... }, handler: (ctx, args) => { /* ctx.user is typed */ } })` from `convex/lib/functions.ts` — used by `bulkCreateExpenses`.

**Recommendation for P72:**
- `seedDefaults` → use the `requireRole(ctx, args.token, ["admin"])` pattern (optional token; matches `accounts:seedDefaults` for dashboard seeding).
- All other mutations (createStatement, CRUD on rules) → use `protectedMutation({ roles: ["admin"], ... })`.

### Pattern 4: Frontend Wizard State Machine (clone HistoricalImportPage)

**Reference:** `src/pages/HistoricalImportPage.tsx:83-89`

```typescript
type WizardState =
  | { step: "upload" }
  | { step: "validating" }
  | { step: "review"; result: BulkExpenseParseResult }
  | { step: "importing"; total: number; completed: number; /* ... */ }
  | { step: "complete"; /* summary */ }
  | { step: "error"; message: string; /* retry context */ };
```

**Clone for bank statement with adjusted payload types:**

```typescript
type BankWizardState =
  | { step: "upload" }
  | { step: "validating" }
  | { step: "review"; parsed: ParsedStatement; reconciliation: ReconciliationResult }
  | { step: "importing"; statementId?: Id<"bankStatements"> }
  | { step: "complete"; statementId: Id<"bankStatements">; lineCount: number; matchedCount: number }
  | { step: "error"; message: string; parsed?: ParsedStatement };
```

**Key differences from Phase 71:**
1. File is `.xlsx` → use `FileReader.readAsArrayBuffer` (not `readAsText`).
2. Parse runs reconciliation checksum BEFORE `review` step — on checksum failure, transition to `error` not `review`.
3. Import step is a single mutation call (not batched — one statement = one atomic insert), so no batch progress bar needed.
4. No editable preview — P72 is non-editable; review step shows parsed lines + matched categories as preview only.

### Anti-Patterns to Avoid

- **Do NOT call `xlsx` inside Convex functions.** `xlsx` requires browser or Node APIs; the Convex runtime is an isolated JS environment. All parsing happens client-side. The mutation receives an already-parsed structure.
- **Do NOT trust the header row labels.** BCA puts "Keterangan" on BOTH column B and column D (D-06a). Parser MUST use column index, not header name.
- **Do NOT use `FileReader.readAsText()` for XLSX.** XLSX is a zip. Use `readAsArrayBuffer()` → `XLSX.read(buffer, {type: "array"})`.
- **Do NOT derive statement period from transaction line dates.** BCA transaction dates are `DD-Mon` (no year). Always use the `Periode` metadata row as year source (D-05, D-29).
- **Do NOT use parseFloat on BCA amounts naively.** Format is `" Rp1,000,000 "`. Strip whitespace, `Rp`, and commas before `parseInt`. IDR is integer-only.
- **Do NOT store raw `rawDescription` in a way that allows HTML injection into the review table.** React default-escapes, but if ever displayed via `dangerouslySetInnerHTML` → XSS. Keep plain text only.
- **Do NOT evaluate catch-all rules in priority order.** R01 must be evaluated LAST regardless of priority (D-17b, SEED-RULES `isCatchAll` predicate). Segregate before sort.
- **Do NOT skip rule direction check.** OVO credit (R03 revenue) vs OVO debit (O04 logistics) is the canonical example — getting direction wrong mis-classifies cash flows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XLSX parsing | Regex over unzipped sharedStrings.xml | `xlsx` (SheetJS) | Zip container, sharedStrings indirection, number/date formats, merged cells — reimplementation is weeks of bugs. |
| Levenshtein | Inline algorithm | `fastest-levenshtein` | 2 KB, zero deps, tuned implementation. Hand-roll is fine but bug risk for marginal saving. |
| SHA-256 | Any npm hasher | `crypto.subtle.digest` | Built-in, NIST-standard, already used in-repo. |
| Month-name parsing | Ad-hoc string switch | `convex/lib/indonesianDate.ts` module (new) | Reusable across phases; the Indonesian abbreviations (Agu, Okt, Des) are non-obvious. |
| Upsert seed | Bespoke | Mirror `accounts:seedDefaults` pattern exactly | Consistency + already tested. |

**Key insight:** BCA XLSX parsing is a "deceptively complex problem" — looks like 5 columns, has 6 rows of metadata + 4 rows of footer + year-inference + quirky column labels. SheetJS handles the zip/sharedStrings complexity and gives us `sheet_to_json({header: 1, raw: false, defval: ""})` which hands back an array-of-arrays. We do the interpretation; SheetJS does the binary parsing.

## Common Pitfalls

### Pitfall 1: npm `xlsx@0.18.5` is vulnerable
**What goes wrong:** `npm install xlsx` fetches 0.18.5 (CVE-2023-30533 prototype pollution). Security audit will fail; Snyk/Dependabot will flag.
**Why it happens:** SheetJS stopped publishing to npmjs.org at 0.18.5. Patched versions are only on `cdn.sheetjs.com`.
**How to avoid:** Install via `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Document in CLAUDE.md (new common pitfall entry).
**Warning signs:** `npm audit` reports high-severity xlsx vulnerability post-install. Fix = reinstall from CDN URL.

### Pitfall 2: BCA date format without year
**What goes wrong:** Dec-Jan period parsed with `new Date(\`${day} ${month} ${periodStartYear}\`)` puts January transactions in the wrong year.
**Why it happens:** `DD-Mon` has no year. Naive implementation uses period start year everywhere.
**How to avoid:** D-29 rollover rule. Unit test explicitly with a Dec-Jan fixture (e.g. period `20/12/2025 - 19/01/2026`, transactions `28-Des` → 2025, `05-Jan` → 2026). Year rollover test file: `src/lib/bankStatement/__tests__/yearRollover.test.ts`.
**Warning signs:** Transaction dates outside `[periodStart, periodEnd]` after parsing.

### Pitfall 3: Reconciliation checksum false negatives from rounding
**What goes wrong:** BCA amounts displayed with 2 decimals (e.g. `" Rp1,234,567.89 "`); our parser integer-rounds each line, but footer is displayed as rounded sum — tiny cumulative drift passes the line-by-line parse but fails the checksum.
**Why it happens:** Integer normalization of each line loses sub-rupiah precision.
**How to avoid:** Read all amounts as `Number` (float) first, validate checksum in float space with epsilon tolerance (e.g. ±1 IDR total), then round to integer for persistence. In practice BCA IDR always renders as whole rupiah — but CSV fallback re-exports may carry decimals.
**Warning signs:** Checksum fails by 1-5 IDR on a large-volume statement. Trust and widen epsilon if real.

### Pitfall 4: SheetJS cellDates flag ambiguity
**What goes wrong:** `XLSX.read(buf, { cellDates: true })` converts date-cells to JS Date objects. BCA date column ("DD-Mon") is a STRING in the XLSX, not a true date cell. `cellDates: true` would do nothing for us on this column but MAY shift behavior on "Periode" metadata.
**Why it happens:** BCA stores the date as text (no locale-cell date format) because it's missing a year.
**How to avoid:** Use `sheet_to_json(sheet, { header: 1, raw: false, defval: "" })`. `raw: false` ensures all cells come back as display strings. Test with actual BCA sample.
**Warning signs:** Date column contains numbers like `45292` (Excel serial date) instead of `"28-Des"` → means cells are date-typed and you need `cellDates: true` + reformat; OR means you're reading the wrong column.

### Pitfall 5: Catch-all rule evaluated in wrong order
**What goes wrong:** R01 priority=20 is "lowest", so a naive `sort by priority desc` STILL evaluates it last — BUT if R01's priority were bumped, it could fire before a legitimate match.
**Why it happens:** Priority is a tunable, `isCatchAll` is a boolean invariant.
**How to avoid:** Split the rule set into non-catch-all and catch-all arrays BEFORE sort. Evaluate non-catch-all first (priority desc), then catch-all (priority desc). Unit test in `matchEngine.test.ts`: insert a catch-all with priority=200 and a non-catch-all with priority=50 against a line that matches both → non-catch-all should win.
**Warning signs:** Legitimate matches classified as Direct Sales (R01) when another rule should fire.

### Pitfall 6: FileReader.readAsText on XLSX → garbage
**What goes wrong:** Developer copies the Phase 71 `reader.readAsText(file)` pattern for the XLSX path. XLSX is a zip — text decoding corrupts it.
**Why it happens:** Phase 71 was CSV-only; XLSX requires `readAsArrayBuffer`.
**How to avoid:** Two separate file-load paths based on extension. CSV → `readAsText`. XLSX → `readAsArrayBuffer` → `XLSX.read(buffer, { type: "array" })`.
**Warning signs:** SheetJS throws `Unsupported file type` or returns empty sheets.

## Code Examples

### 1. SheetJS read-only parse of BCA layout

```typescript
// Source: https://docs.sheetjs.com/docs/api/parse-options  [CITED]
import * as XLSX from "xlsx";

export function loadBcaWorkbook(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  if (wb.SheetNames.length !== 1) {
    throw new Error(`Expected single-sheet BCA export, got ${wb.SheetNames.length} sheets`);
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // Array-of-arrays mode: row[col] by index, not header label
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,       // all cells as display strings (avoids Date object / number surprises)
    defval: "",       // empty cells → "" not undefined
    blankrows: true,  // preserve spacer rows so we can find footer
  });
}
```

### 2. SHA-256 file hash (copy from ReceiptUpload.tsx)

```typescript
// Source: src/components/expenses/ReceiptUpload.tsx:14-20  [VERIFIED: codebase grep]
export async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

### 3. Fuzzy similarity wrapper

```typescript
// Source: fastest-levenshtein README  [CITED: npmjs.com/package/fastest-levenshtein]
import { distance } from "fastest-levenshtein";

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

export function similarityScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const d = distance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - d / maxLen;  // 0..1, higher = more similar
}

// Usage: similarityScore(line.rawDescription, expense.description) >= 0.8 → "strong"
```

### 4. Rule evaluation with catch-all segregation

```typescript
// Source: derived from D-17b + SEED-RULES.json rule table  [ASSUMED — implementation detail to be finalized in plan]
interface EvalContext { rawDescription: string; direction: "debit" | "credit"; amountIdr: number; }

export function classifyLine(line: EvalContext, allRules: BankKeywordRule[]): BankKeywordRule | null {
  const catchAll = allRules.filter(r => r.isCatchAll);
  const normal = allRules.filter(r => !r.isCatchAll);
  // priority DESC, ruleCode ASC for determinism
  const order = (rules: BankKeywordRule[]) =>
    rules.sort((a, b) => b.priority - a.priority || a.ruleCode.localeCompare(b.ruleCode));
  for (const rule of order(normal)) {
    if (matches(line, rule)) return rule;
  }
  for (const rule of order(catchAll)) {
    if (matches(line, rule)) return rule;
  }
  return null;
}

function matches(line: EvalContext, rule: BankKeywordRule): boolean {
  // Direction check
  if (rule.direction !== "any" && rule.direction !== line.direction) return false;
  const desc = line.rawDescription.toLowerCase();
  // Counterparty (optional; any-match)
  if (rule.counterpartyPatterns && rule.counterpartyPatterns.length > 0) {
    const hit = rule.counterpartyPatterns.some(p => desc.includes(p.toLowerCase()));
    if (!hit) return false;
  }
  // Description patterns
  if (rule.descriptionPatterns && rule.descriptionPatterns.length > 0) {
    if (rule.descriptionPatternsMode === "all") {
      if (!rule.descriptionPatterns.every(p => desc.includes(p.toLowerCase()))) return false;
    } else if (rule.descriptionPatternsMode === "any") {
      if (!rule.descriptionPatterns.some(p => desc.includes(p.toLowerCase()))) return false;
    }
    // "hint" mode: not required; elevates confidence (handled by caller)
  }
  return true;
}
```

### 5. Statement dedup check (mutation)

```typescript
// Source: derived from D-04 + accounts:seedDefaults pattern  [ASSUMED]
export const createStatement = protectedMutation({
  roles: ["admin"],
  args: { fileHash: v.string(), /* ... */ lines: v.array(v.object({/* ... */})) },
  handler: async (ctx, args) => {
    // Primary dedup: file hash
    const dup = await ctx.db.query("bankStatements")
      .withIndex("by_fileHash", (q) => q.eq("fileHash", args.fileHash)).first();
    if (dup) {
      throw new ConvexError(`Already imported on ${new Date(dup.createdAt).toLocaleDateString()}`);
    }
    // Secondary dedup: account + period
    const period = await ctx.db.query("bankStatements")
      .withIndex("by_account_period", (q) =>
        q.eq("accountNumber", args.accountNumber)
         .eq("reportedPeriodStart", args.reportedPeriodStart))
      .first();
    if (period && period.reportedPeriodEnd === args.reportedPeriodEnd) {
      throw new ConvexError(`Period ${args.accountNumber}/${args.reportedPeriodStart}-${args.reportedPeriodEnd} already imported`);
    }
    const statementId = await ctx.db.insert("bankStatements", { /* header */ });
    for (const line of args.lines) {
      await ctx.db.insert("bankStatementLines", { ...line, statementId });
    }
    return statementId;
  },
});
```

## Runtime State Inventory

(Not applicable — P72 is a greenfield phase with no rename/refactor. No existing bank data to migrate.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `xlsx` (SheetJS) | BCA XLSX parser | ✗ (not yet installed) | — | Install via SheetJS CDN (not npm) |
| `fastest-levenshtein` | Fuzzy match | ✗ (not yet installed) | — | Hand-roll Levenshtein (~20 LOC) |
| `papaparse` | CSV fallback | ✓ | 5.5.3 | — |
| `convex` | Backend | ✓ | 1.31.7 | — |
| `convex-test` | Backend tests | ✓ | 0.0.41 | — |
| `vitest` | Test runner | ✓ | 4.0.18 | — |
| Web Crypto API | SHA-256 | ✓ | built-in | — |
| Convex `requireRole`/`protectedMutation` | Auth guards | ✓ | — | — |

**Missing dependencies with no fallback:** None — both missing libs have viable fallbacks.
**Missing dependencies with fallback:** `xlsx` install (SheetJS CDN recommended over npm); `fastest-levenshtein` (hand-roll acceptable but 2 KB library is negligible).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | BCA XLSX "Jumlah" column amounts are integer rupiah (no decimals in real exports) | Pitfall 3 | Low — checksum will catch any drift; fallback is float-tolerant validation |
| A2 | `accounts` table has a `by_name` index OR `.collect()` during seed is acceptable | Pattern 1 | Low — if index missing, add it in P72 (trivial). Seed runs once so `.collect()` is fine even at 54 accounts |
| A3 | Convex mutation atomic-transaction semantics hold across `ctx.db.insert` calls in a for-loop | Pattern 2 | None — Convex docs confirm; `bulkCreateExpenses` already relies on this |
| A4 | SheetJS CDN tarball URL stays stable and does not require auth | Installation | Medium — if CDN moves, reinstall from new URL. SheetJS has used this channel since 2023 |
| A5 | No existing production bank data to migrate (greenfield for P72) | Runtime State | Low — confirmed by MEMORY.md and ROADMAP status |
| A6 | `crypto.subtle` is available in all browsers the frontend targets (modern Vercel/React 19 deploy) | Code Example 2 | None — already used in production `ReceiptUpload.tsx` |

## Open Questions

1. **Account lookup key for rule seed — by `name` or by `code`?**
   - What we know: 72-SEED-RULES.json uses logical names like `revenue-direct-sales`, mapping to `accounts.name` like `"Revenue — Direct Sales / Transfers"`. `accounts.code` is 4-digit numeric (e.g., `4100`). Names change; codes don't.
   - What's unclear: Whether the 19 required accounts from `accountRefs` exist in the current CoA seed (54 accounts defined in `convex/accounts/mutations.ts`). Some like `"Revenue — Cafe Wholesale (Ruma 52)"` and `"Revenue — Cafe Wholesale (Thirdhome)"` are new and likely NOT in the default set.
   - Recommendation: Plan an "Accounts audit + extension" task before the rule-seed task. Either (a) extend `DEFAULT_ACCOUNTS` in `convex/accounts/mutations.ts` with the missing 19 entries, or (b) add a `bankKeywordRules/prerequisiteAccounts.ts` mini-seed that inserts missing CoA entries before rules. Option (a) is cleaner and aligns with `accounts:seedDefaults` being the single source of CoA truth.

2. **Does `accounts` table have a `by_name` index?**
   - What we know: `by_code` index exists. Schema at lines 1701-1722.
   - What's unclear: Whether `by_name` is defined. If not, `.collect()` scan during seed (run once, 54 rows) is fine.
   - Recommendation: Plan task should verify schema lines 1701-1722; if `by_name` missing, add it (low-risk schema change, no migration).

3. **Rule-match Layer B (record linkage) hit rate — how aggressively to match payroll?**
   - What we know: D-15 says payroll uses `users.bankAccountHolderName` + amount exact + date window. But most owner draws (B02) are ALSO by holder name → could over-match.
   - What's unclear: whether B02-classified lines should SKIP Layer B for payroll, or just surface both matches for P73 review.
   - Recommendation: B02's `related_party` flag is the signal — Layer B should skip the payroll check when the line has `related_party` in its flags. Note this in match engine spec.

4. **XLSX sample file location — where do we get test fixtures?**
   - What we know: CONTEXT.md references `D:\OneDrive\Documents\Malo Financials\2025\2511\Mutasi - BCA - 2511.xlsx` (outside repo for privacy).
   - What's unclear: Whether a synthetic / anonymized fixture gets committed for CI tests.
   - Recommendation: Plan includes a task to generate a minimal synthetic BCA-shaped XLSX fixture (`tests/fixtures/bca-sample-synthetic.xlsx` or programmatically generated via SheetJS write in a test setup hook) for reconciliation and parse tests. Real file never enters repo.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@4.0.18` + `convex-test@0.0.41` |
| Config file | `vitest.config.ts` (jsdom env, includes `convex/**/*.test.ts` and `src/**/*.test.ts`) |
| Quick run command | `npm run test -- --run <pattern>` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BANK-01 | Parser extracts metadata rows (account, holder, period) | unit | `npm run test -- parseBcaXlsx` | ❌ Wave 0 |
| BANK-01 | Parser extracts transaction rows with correct DD-Mon → epoch | unit | `npm run test -- parseBcaXlsx` | ❌ Wave 0 |
| BANK-01 | Year-rollover (Dec-Jan period) assigns correct year per line | unit | `npm run test -- yearRollover` | ❌ Wave 0 |
| BANK-01 | Reconciliation checksum: sum(debits)=Mutasi Debet, sum(credits)=Mutasi Kredit, opening+credits−debits=closing | unit | `npm run test -- reconciliation` | ❌ Wave 0 |
| BANK-01 | Reconciliation failure aborts import (no partial persistence) | integration (convex-test) | `npm run test -- mutations` | ❌ Wave 0 |
| BANK-01 | File hash dedup: re-upload same file hash → ConvexError | integration | `npm run test -- mutations` | ❌ Wave 0 |
| BANK-01 | Secondary dedup: `(accountNumber, periodStart, periodEnd)` composite → ConvexError | integration | `npm run test -- mutations` | ❌ Wave 0 |
| BANK-01 | CSV fallback produces identical ParsedStatement shape | unit | `npm run test -- parseBcaCsv` | ❌ Wave 0 |
| BANK-01 | Multi-sheet XLSX rejected with diagnostic | unit | `npm run test -- parseBcaXlsx` | ❌ Wave 0 |
| BANK-02 | Each of 26 seeded rules matches its canonical positive fixture | unit | `npm run test -- matchEngine` | ❌ Wave 0 |
| BANK-02 | Rules evaluated `priority DESC, ruleCode ASC` (e.g. priority-100 named counterparties beat priority-80 platforms) | unit | `npm run test -- matchEngine` | ❌ Wave 0 |
| BANK-02 | Catch-all (R01 isCatchAll=true) evaluated LAST regardless of priority | unit | `npm run test -- matchEngine` | ❌ Wave 0 |
| BANK-02 | Direction-sensitive: OVO CREDIT → R03, OVO DEBIT → O04 | unit | `npm run test -- matchEngine` | ❌ Wave 0 |
| BANK-02 | `counterparty_and_keyword` match requires BOTH (C03 Pierre production vs O02 Pierre shipping) | unit | `npm run test -- matchEngine` | ❌ Wave 0 |
| BANK-02 | `descriptionPatternsMode: "hint"` raises confidence but doesn't gate match | unit | `npm run test -- matchEngine` | ❌ Wave 0 |
| BANK-02 | Fuzzy similarity ≥ 0.8 classifies linked record as "strong" | unit | `npm run test -- fuzzyMatch` | ❌ Wave 0 |
| BANK-02 | Record linkage: amount+date exact+description fuzzy matches real expense | integration | `npm run test -- matchEngine` | ❌ Wave 0 |
| BANK-02 | Payroll match via `users.bankAccountHolderName` (skip for `related_party` flag lines) | integration | `npm run test -- matchEngine` | ❌ Wave 0 |
| BANK-02 | `bankKeywordRules:seedDefaults` — all 26 rules persist with resolved account IDs | integration | `npm run test -- seed` | ❌ Wave 0 |
| BANK-02 | Seed fails loudly if any account ref cannot be resolved | integration | `npm run test -- seed` | ❌ Wave 0 |
| BANK-02 | Seed is idempotent (re-run = "updated" not duplicate) | integration | `npm run test -- seed` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test -- --run` (scoped to changed files — e.g. `matchEngine` or `parseBcaXlsx`)
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full suite green + `npm run build` + `npm run type-check` before `/gsd-verify-work`

### Wave 0 Gaps

All test files are new (greenfield phase). Required:

- [ ] `src/lib/bankStatement/__tests__/parseBcaXlsx.test.ts` — BANK-01 parser unit tests
- [ ] `src/lib/bankStatement/__tests__/parseBcaCsv.test.ts` — BANK-01 CSV fallback tests
- [ ] `src/lib/bankStatement/__tests__/reconciliation.test.ts` — BANK-01 checksum tests
- [ ] `src/lib/bankStatement/__tests__/yearRollover.test.ts` — BANK-01 Dec-Jan edge
- [ ] `src/lib/bankStatement/__tests__/fuzzyMatch.test.ts` — BANK-02 similarity tests
- [ ] `convex/bankStatements/__tests__/matchEngine.test.ts` — BANK-02 rule eval + 26 positive fixtures
- [ ] `convex/bankStatements/__tests__/mutations.test.ts` — BANK-01/02 convex-test integration (dedup, full ingest)
- [ ] `convex/bankKeywordRules/__tests__/seed.test.ts` — BANK-02 seed idempotency + account-ref resolution
- [ ] `tests/fixtures/bca-sample-synthetic.xlsx` OR programmatic generator — test input (no real PII in repo)

Framework install: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz && npm install --save fastest-levenshtein`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing PIN+session via `requireRole(ctx, token, ["admin"])` — reuse |
| V3 Session Management | yes | Existing session tokens; no new patterns |
| V4 Access Control | yes | **Admin-only** on all new mutations AND queries. P72 data is financial — even read access must be gated (D-19) |
| V5 Input Validation | yes | Convex `v.*` validators on every mutation arg; parser-side: strict column-index + regex for metadata rows; abort on unexpected shape |
| V6 Cryptography | yes | SHA-256 via `crypto.subtle.digest` (no hand-rolled); integrity only, not confidentiality |
| V12 File & Resource | yes | Upload size limit (recommend 10 MB max for bank XLSX; typical real statement is ~50 KB); extension+magic-byte validation |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Zip bomb via crafted XLSX | DoS | Reject file if raw size > 10 MB BEFORE passing to SheetJS; reject if parsed sheet row count > 5000 |
| Prototype pollution in XLSX parser (CVE-2023-30533) | Tampering | Use `xlsx@0.20.3+` from SheetJS CDN (not npm 0.18.5); ADD to package-lock via URL dependency |
| ReDoS in BCA metadata regexes | DoS | All metadata regexes in parser must be non-catastrophic (no nested quantifiers; use bounded `{0,200}` for description extraction) |
| XSS via `rawDescription` rendered in review table | Tampering | React default-escapes. Forbid `dangerouslySetInnerHTML` on any bank statement field. Add ESLint rule or code-review checklist item |
| CSRF on admin mutations | Spoofing | Existing Convex token auth (server-verified session token) — N/A for CSRF in single-origin React app |
| Unauthorized read of financial data | Info disclosure | ALL queries (`listStatements`, `getStatement`, `listLines`, `listRules`) use `requireRole(ctx, token, ["admin"])` or `protectedQuery({ roles: ["admin"] })` — not just mutations |
| Tampering with imported statement | Tampering | File hash + immutable header (D-01 never patched post-insert). P73 only mutates line-level state, never header totals |
| PII leakage (account holder name, account number in logs) | Info disclosure | `accountNumber` + `accountHolder` are PII. Never log to console/Convex logs on error paths. Mask in error messages: `"account ****1234"` |

### Audit Trail Fields (required on `bankStatements`)

Per CONTEXT.md D-01 and ASVS V7:
- `uploadedBy: v.id("users")` — who imported
- `createdAt: v.number()` — when
- `fileHash: v.string()` — integrity anchor

Plan should ensure these three fields are marked `NOT optional` on the header (not on lines — lines inherit via `statementId`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Install `xlsx` from npm | Install `xlsx` from SheetJS CDN tarball URL | 2023 (CVE-2023-30533) | MUST use CDN for security; documented on SheetJS installation guide |
| Regex-heavy CSV parser | Papa Parse for CSV, SheetJS for XLSX | long-standing | Specialized libs catch edge cases hand-roll misses |
| Custom Levenshtein | `fastest-levenshtein` | 2019+ | Standardized; zero deps; well-benchmarked |

**Deprecated/outdated:**
- `xlsx@0.18.5` on npm — known-vulnerable; SheetJS does not patch via npm registry
- `js-levenshtein` (legacy) — superseded by `fastest-levenshtein` (same algo, tighter impl, more downloads)

## Sources

### Primary (HIGH confidence)
- `convex/accounts/mutations.ts:114-156` — `seedDefaults` upsert pattern `[VERIFIED: codebase]`
- `convex/expenses/bulkMutations.ts:38-170` — parent-child insert in single atomic mutation `[VERIFIED: codebase]`
- `convex/lib/journalEngine.ts` — `createJournalEntryWithLines` (used by P73) `[VERIFIED: codebase]`
- `convex/schema.ts:1833-1876` — `journalEntries` + `journalEntryLines` reference structure `[VERIFIED: codebase]`
- `convex/schema.ts:1092-1158` — `externalRevenue` + `externalRevenueItems` `matchConfidence` pattern `[VERIFIED: codebase]`
- `src/components/expenses/ReceiptUpload.tsx:14-20` — `computeSha256` reusable helper `[VERIFIED: codebase]`
- `src/pages/HistoricalImportPage.tsx:83-89` — WizardState union to clone `[VERIFIED: codebase]`
- `src/lib/csvImportValidation.ts` — Papa Parse pattern for CSV fallback `[VERIFIED: codebase]`
- `vitest.config.ts` — test env (jsdom, convex-test inlined) `[VERIFIED: codebase]`

### Secondary (MEDIUM-HIGH confidence)
- `https://docs.sheetjs.com/docs/getting-started/installation/nodejs` — SheetJS CDN install `[CITED]`
- `https://docs.sheetjs.com/docs/api/parse-options` — `sheet_to_json({header:1, raw:false})` usage `[CITED]`
- `https://github.com/ka-weihe/fastest-levenshtein` — API + zero-dep claim `[CITED]`
- SheetJS Git issue #2961 — npm freeze at 0.18.5 confirmation `[CITED]`
- CVE-2023-30533 prototype pollution — fixed in 0.19.3 `[CITED: cdn.sheetjs.com/advisories/CVE-2023-30533]`
- CVE-2024-22363 ReDoS — fixed in 0.20.2 `[CITED]`

### Tertiary (LOW confidence — assumption-flagged above)
- Convex mutation arg size limit (8 MB) — from general Convex docs knowledge `[ASSUMED]` — verify via `https://docs.convex.dev/functions/limits` if needed
- BCA exports always use integer rupiah — from user sample `[ASSUMED]` — parser designed to tolerate decimals anyway

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — libraries verified via npm registry + SheetJS docs
- Architecture: HIGH — all patterns sourced from in-repo code with line references
- Pitfalls: MEDIUM-HIGH — pitfalls 1, 2, 5, 6 verified; pitfall 3 (rounding) is defensive/speculative
- Seed pattern: HIGH — `accounts:seedDefaults` is the direct template

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days; SheetJS CDN URL is stable, in-repo patterns stable)

## RESEARCH COMPLETE
