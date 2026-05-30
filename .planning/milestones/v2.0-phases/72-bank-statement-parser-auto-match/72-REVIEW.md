---
phase: 72-bank-statement-parser-auto-match
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - convex/accounts/__tests__/seed.test.ts
  - convex/accounts/mutations.ts
  - convex/bankKeywordRules/__tests__/seed.test.ts
  - convex/bankKeywordRules/defaultRules.ts
  - convex/bankKeywordRules/mutations.ts
  - convex/bankKeywordRules/queries.ts
  - convex/bankStatements/__tests__/matchEngine.test.ts
  - convex/bankStatements/__tests__/mutations.test.ts
  - convex/bankStatements/matchEngine.ts
  - convex/bankStatements/mutations.ts
  - convex/bankStatements/queries.ts
  - convex/lib/auth.ts
  - convex/lib/indonesianDate.ts
  - convex/lib/journalEngine.ts
  - convex/schema.ts
  - package.json
  - src/App.tsx
  - src/components/bankReconciliation/RuleFormDialog.tsx
  - src/components/bankReconciliation/StatementHistoryList.tsx
  - src/components/bankReconciliation/StatementReviewTable.tsx
  - src/components/bankReconciliation/StatementUploadStep.tsx
  - src/components/layout/Header.tsx
  - src/hooks/convex/useBankReconciliation.ts
  - src/lib/bankStatement/__tests__/fuzzyMatch.test.ts
  - src/lib/bankStatement/__tests__/parseBcaCsv.test.ts
  - src/lib/bankStatement/__tests__/parseBcaXlsx.test.ts
  - src/lib/bankStatement/__tests__/reconciliation.test.ts
  - src/lib/bankStatement/__tests__/yearRollover.test.ts
  - src/lib/bankStatement/_parseBcaRows.ts
  - src/lib/bankStatement/fileHash.ts
  - src/lib/bankStatement/fuzzyMatch.ts
  - src/lib/bankStatement/parseBcaCsv.ts
  - src/lib/bankStatement/parseBcaXlsx.ts
  - src/lib/bankStatement/reconciliation.ts
  - src/lib/bankStatement/types.ts
  - src/pages/BankReconciliationPage.tsx
  - src/pages/BankRulesManager.tsx
  - tests/fixtures/bca-sample-synthetic.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 72: Code Review Report

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 72 delivers the BCA bank statement ingestion pipeline, classifier (Layer A rules), record linkage (Layer B), and read-only review UI. The implementation respects the core phase boundaries:

- **D-20 verified:** no `createJournalEntryWithLines` call anywhere under `convex/bankStatements/`; no schema posting; the unit test explicitly asserts zero `journalEntries` inserted.
- **D-25/D-26 verified:** `StatementReviewTable` has no edit/override/manual-match controls; `BankReconciliationPage` exposes upload → review → complete only.
- **`"bank_statement"` literal** present in `JournalSourceType` union.
- **Admin gates:** every mutation (`createFromParsedStatement`, `seedDefaults`, `create`, `update`, `deactivate`) and every query (`listStatements`, `getStatement`, `listLines`, rule `list`/`getById`) enforces admin auth. Tests cover both positive and negative (kitchen role) paths.
- **T-72-25 (file size):** 10 MB cap enforced client-side before the parser is invoked.
- **T-72-26 (zip bomb / row count):** 5000-row cap in both parser (`MAX_ROWS`) and server mutation (`MAX_LINES`).
- **T-72-31 (XSS):** no `dangerouslySetInnerHTML` usage anywhere in bank reconciliation components.
- **Convex index usage:** range bounds live inside `.withIndex()` for all Layer B scans (`by_amount_date_submitter`, `by_amount_transactionDate`, `by_amount_createdAt`, `by_amount_period`).

One critical cross-directory import breaks the "convex-only runtime bundle" invariant and risks production failure. Several correctness/quality warnings are also noted.

## Critical Issues

### CR-01: Convex function imports from `src/` — cross-directory import risks bundler breakage

**File:** `convex/bankStatements/matchEngine.ts:24`
**Issue:** `matchEngine.ts` (a Convex function module) imports `similarityScore` from `../../src/lib/bankStatement/fuzzyMatch`. The Convex deployer only bundles files under `convex/`; imports pointing outside that tree are fragile and have historically produced silent runtime failures in this codebase (CLAUDE.md Common Pitfall #8: "No dynamic imports in Convex — Static imports only. Dynamic `import()` works locally but fails silently in production (204 No Content)"). Static cross-directory imports may resolve during `convex dev` / `vitest` (where `src/` is reachable via relative path) yet break at `npx convex deploy` time because the esbuild entry set is rooted at `convex/`. Independently, if it compiles, `src/lib/bankStatement/fuzzyMatch.ts` depends on `fastest-levenshtein` which is fine in Convex, but `src/` may pull in other browser-only code transitively in the future. A grep confirms this is the ONLY such cross-import in the entire `convex/` tree.
**Fix:** Move `normalize` + `similarityScore` into `convex/lib/fuzzyMatch.ts` (Convex-side source of truth), and have the frontend re-export or re-import from there. The CONTEXT decision (`convex/lib/indonesianDate.ts` already lives convex-side and is re-exported by the frontend parser) is the authoritative pattern.

```ts
// convex/lib/fuzzyMatch.ts
import { distance } from "fastest-levenshtein";
export function normalize(s: string): string { /* same body */ }
export function similarityScore(a: string, b: string): number { /* same body */ }
```

```ts
// convex/bankStatements/matchEngine.ts
import { similarityScore } from "../lib/fuzzyMatch";
```

```ts
// src/lib/bankStatement/fuzzyMatch.ts — re-export for the frontend
export { normalize, similarityScore } from "../../../convex/lib/fuzzyMatch";
```

## Warnings

### WR-01: Layer B has no direction filter — credit lines can match expense records (and vice versa)

**File:** `convex/bankStatements/matchEngine.ts:231-342`
**Issue:** `findLinkedRecord` scans `expenses`, `externalRevenue`, `reimbursementBatches`, `payrollEntries` in sequence filtered only by `amount + date + fuzzy`. There is no filter on `line.direction`. A **credit** bank line (money in) can match an `expenses` row of the same amount within ±3 days — producing `matchedType: "expense"` with `matchMethod: "linked_to_record"` on an incoming payment. Symmetric: a **debit** bank line can match an `externalRevenue` record. Both violate double-entry semantics (expenses are money out, revenue is money in) and will propagate nonsense linkages to P73's reconciliation UI. `buildStatement` in mutations.test.ts even includes a 500K credit and a 250K credit — if similar-amount expenses exist in a real tenant DB, the result is deterministic mis-linkage.
**Fix:** Gate each scan on direction:
```ts
// expenses, reimbursements, payroll → debit lines only
if (line.direction === "debit") { /* expenses scan */ }
// externalRevenue → credit lines only
if (line.direction === "credit") { /* revenue scan */ }
```
Add regression tests in `matchEngine.test.ts` asserting a credit line does NOT produce a `matchedType:"expense"` result even when amount+date align.

### WR-02: `bankStatementLines.matchMethod` union in the UI is broader than the writer ever produces

**File:** `src/components/bankReconciliation/StatementReviewTable.tsx:34` and `convex/schema.ts:1943-1949`
**Issue:** Schema union includes `"keyword" | "exact_match" | "counterparty" | "linked_to_record" | "unmatched"`. The mutation (`mutations.ts:191-195`) only ever writes `"keyword" | "linked_to_record" | "unmatched"`. The UI type re-declares the full union but the three dead values (`"exact_match"`, `"counterparty"`) are never produced. Either the writer should distinguish (e.g. use `"exact_match"` when `confidence === "exact"` from a rule) or the schema should be narrowed. Leaving them unused is a documentation/implementation drift that will confuse P73.
**Fix:** Narrow the schema to the three values actually written, or amend the writer to populate the richer values (preferred — the distinction feeds P73 UI badges). At minimum add a code comment in `schema.ts` noting the unused literals.

### WR-03: `classifyLine` direction check runs BEFORE the `catch_all` dispatch, but the function still falls through a large switch for catch-all

**File:** `convex/bankStatements/matchEngine.ts:149-155`
**Issue:** For `matchType === "catch_all"`, the `matches()` function returns `{ matched: true, hintHit: descMode === "hint" && anySubstring(desc, descPatterns) }`. But the R01 seed rule has `direction: "credit"` and `matchType: "catch_all"` — meaning a debit line whose direction doesn't match R01 will correctly be skipped at line 84. Good. However, a catch_all rule with `direction: "any"` would unconditionally match EVERY line regardless of amount/content. This is exactly the design, but an admin creating a second catch_all via CRUD with `direction: "any"` would silently become a global terminal rule that shadows every other catch_all evaluated after it (alphabetically by ruleCode). The data-integrity test enforces "exactly one catch_all = R01" at seed time, but the `create` mutation does NOT enforce "at most one active catch_all rule across the table."
**Fix:** In `bankKeywordRules/mutations.ts::create` (and optionally `update`), when `isCatchAll === true`, reject if another active catch-all already exists:
```ts
if (args.isCatchAll) {
  const otherCatchAll = await ctx.db.query("bankKeywordRules")
    .withIndex("by_isCatchAll", q => q.eq("isCatchAll", true))
    .filter(q => q.eq(q.field("isActive"), true))
    .first();
  if (otherCatchAll) throw new ConvexError(`Another active catch-all rule already exists: ${otherCatchAll.ruleCode}`);
}
```

### WR-04: Server reconciliation check uses `!==` on floats without epsilon

**File:** `convex/bankStatements/mutations.ts:113-128`
**Issue:** The server reconciliation validator does `if (computedDebit !== args.header.reportedDebitTotal) throw`. Values arrive as numbers through the Convex validator — if any upstream client happens to submit non-integer amounts (CSV re-export with 2 decimals, per `72-RESEARCH.md` Pitfall 3), JS float arithmetic `50000.01 + 10000.02` can land on `60000.02999...4` and fail a naive `!==`. The parser rounds to integer via `Math.round` in `_parseBcaRows.ts::parseAmount`, so in the XLSX happy path this is safe. But validators only check types, not integer-ness — the mutation trusts client integers. A malformed client that sends fractional amounts would be rejected with "Reconciliation failed" even if the reported totals match the rounded sum.
**Fix:** Either narrow `amountIdr` to integer in the validator (`v.number()` with a handler pre-check that `Number.isInteger(ln.amountIdr)`), or apply epsilon tolerance in the check:
```ts
if (!Number.isInteger(ln.amountIdr)) throw new ConvexError(`Row ${ln.rowIndex}: amount must be integer IDR`);
```

### WR-05: `BankReconciliationPage` fetches `api.accounts.queries.list` without role gate guardrail

**File:** `src/pages/BankReconciliationPage.tsx:96`
**Issue:** `useQuery(api.accounts.queries.list, {})` runs unconditionally on render — there's no `"skip"` guard for unauthenticated state. The route is wrapped in `<ProtectedRoute allowedRoles={["admin"]}>` so the component won't render for non-admins, and `accounts.queries.list` is likely public anyway (check with accounts/queries.ts). But the other useQuery calls in this same file conditionally skip via `user?.token`. Inconsistency makes it harder to audit and, if accounts ever becomes auth-gated, will throw unhandled errors. Also, the query argument `{}` doesn't match the typical `{ token }` pattern used elsewhere in this file for defense-in-depth.
**Fix:** Mirror the pattern used for the other hooks:
```ts
const { user } = useAuth();
const allAccounts = useQuery(
  api.accounts.queries.list,
  user?.token ? {} : "skip",
);
```
Plus verify `accounts.queries.list` either gates on admin/manager or documents public-read intent.

## Info

### IN-01: `parseBcaXlsx.ts` re-exports parser utilities from an unexpected module boundary

**File:** `src/lib/bankStatement/parseBcaXlsx.ts:23-24`
**Issue:** `parseBcaXlsx.ts` re-exports `ReconciliationError`, `parseIndonesianDate`, and `resolveYearForRollover`. These are public surface of `types.ts` and `convex/lib/indonesianDate.ts` respectively; consumers import from those authoritative paths. The re-export adds a second name to the module graph with no clear caller benefit (and the comment even admits "callers only need to import from parseBcaXlsx to handle reconciliation failures" — but `types.ts` already exports `ReconciliationError`).
**Fix:** Delete the re-exports; callers use `@/lib/bankStatement/types` and `convex/lib/indonesianDate` directly (the `StatementUploadStep` already imports from `types`).

### IN-02: `RE_COUNTERPARTY` regex allows up to 11 tokens — bound mentioned as 10 in comment

**File:** `src/lib/bankStatement/_parseBcaRows.ts:47`
**Issue:** Comment says "Bounded quantifier cap 10" but `{1,10}` means 1 to 10 additional tokens → 2 to 11 total tokens matched. Harmless (ReDoS safety intact because the bound is polynomial) but the comment is off-by-one.
**Fix:** Update comment to "trailing run of 2..11 capitalized words, cap 10 additional tokens" or change `{1,10}` → `{1,9}` to truly cap at 10.

### IN-03: `BankReconciliationPage.formatDate` is duplicated in 3 files

**File:** `src/pages/BankReconciliationPage.tsx:74-77`, `src/components/bankReconciliation/StatementHistoryList.tsx:38-41`, `src/components/bankReconciliation/StatementReviewTable.tsx:73-79`
**Issue:** Same `DD/MM/YYYY` UTC-based formatter reimplemented three times. The project has a `src/lib/dateUtils.ts` with WIB-aware formatters — bank statement dates are stored as UTC midnight so the UTC formatter is intentional, but the duplication is a maintenance hazard.
**Fix:** Extract to `src/lib/bankStatement/formatters.ts` and import:
```ts
export function formatStatementDate(ms: number): string { /* single impl */ }
```

### IN-04: `StatementReviewTable.tsx:108` renders raw Convex ID tail on account-not-found fallback

**File:** `src/components/bankReconciliation/StatementReviewTable.tsx:108`
**Issue:** When `accountsById?.get(id)` misses (e.g., stale cache between mutation + query), code renders `String(id).slice(-6)` — a short, opaque string that will confuse users. Should at least label it ("unknown #abc123") or fall back to "—".
**Fix:**
```ts
if (!doc) return `unknown #${String(id).slice(-6)}`;
```

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
