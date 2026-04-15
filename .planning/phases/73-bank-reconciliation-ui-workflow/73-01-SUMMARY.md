---
phase: 73
plan: 01
subsystem: bank-reconciliation
tags: [backend, schema, mutations, journal-engine, tdd]
requires:
  - convex/lib/journalEngine.ts::createJournalEntryWithLines
  - convex/lib/auth.ts::requireRole
  - convex/bankStatements/matchEngine.ts
provides:
  - convex/bankStatements/mutations.ts::manualMatch
  - convex/bankStatements/mutations.ts::unmatch
  - convex/bankStatements/mutations.ts::confirmLine
  - convex/bankStatements/mutations.ts::batchConfirmExactTier
  - convex/lib/journalEngine.ts::JournalSourceType (bank_statement_reversal)
  - convex/schema.ts::bankStatementLines.{confirmedAt,confirmedBy,confirmedJournalEntryId,reversedAt,reversedBy,reversalJournalEntryId,createdExpenseId,createdRevenueId,createdReimbursementId}
affects:
  - convex/bankStatements/queries.ts (widened to manager+admin)
  - convex/schema.ts (9 new optional fields + 1 sourceType literal)
tech-stack:
  added: []
  patterns:
    - Direct createJournalEntryWithLines call for reversal (bypasses NON_REVERSIBLE_TYPES)
    - Post-write consistency re-query (C3 TOCTOU defense)
key-files:
  created:
    - convex/bankStatements/__tests__/reconcileHelpers.ts
    - convex/bankStatements/__tests__/manualMatch.test.ts
    - convex/bankStatements/__tests__/unmatch.test.ts
    - convex/bankStatements/__tests__/confirmLine.test.ts
    - convex/bankStatements/__tests__/batchConfirm.test.ts
  modified:
    - convex/schema.ts
    - convex/lib/journalEngine.ts
    - convex/bankStatements/queries.ts
    - convex/bankStatements/mutations.ts
decisions:
  - Reversal JE uses direct createJournalEntryWithLines call with sourceType='bank_statement_reversal', not createReversalEntry (RESEARCH Pitfall 1)
  - D-04 1:1 cardinality enforced via by_matched index with pre-write guard + post-write consistency re-query (C3 from staff review)
  - 9 D-25 audit fields all optional (backfill-free migration)
  - Permission-widening header-comment updated to reflect D-23 (manager+admin for statement/line reads; rule CRUD stays admin-only)
metrics:
  tasks: 3
  files_created: 5
  files_modified: 4
  tests_added: 24
  tests_passing: 24
  duration: ~10 min
  completed: 2026-04-15
---

# Phase 73 Plan 01: Backend foundation — schema, widened queries, reconciliation mutations

JWT-free reconciliation write contract: four new mutations (`manualMatch`, `unmatch`, `confirmLine`, `batchConfirmExactTier`) backed by 24 passing Wave 0 tests, plus schema D-25 audit fields on `bankStatementLines` and the D-26 `bank_statement_reversal` journal source-type literal. Existing Phase 72 read queries widened from admin-only to manager+admin per D-23.

## What Ships

### Schema (D-25 / D-26)

`convex/schema.ts`:

- **`bankStatementLines`** gains 9 optional audit fields:
  - `confirmedAt`, `confirmedBy`, `confirmedJournalEntryId` (who posted + when + link to JE)
  - `reversedAt`, `reversedBy`, `reversalJournalEntryId` (who unmatched-confirmed + when + link to reversal JE)
  - `createdExpenseId`, `createdRevenueId`, `createdReimbursementId` (distinguish inline-created records for future delete-and-unlink workflows)
- **`journalEntries.sourceType`** union gains `v.literal("bank_statement_reversal")`

`convex/lib/journalEngine.ts`:

- `JournalSourceType` union extended with `"bank_statement_reversal"`
- `NON_REVERSIBLE_TYPES` **unchanged** — keeps `"bank_statement"` in the guard; reversal uses direct call to `createJournalEntryWithLines` with the new sourceType (RESEARCH Pitfall 1)
- `VALID_VOID_PAIRS` unchanged — reversal is a fresh JE, not routed through void pairing

### Permissions (D-23)

`convex/bankStatements/queries.ts`:

All four existing Phase 72 queries widened from `["admin"]` to `["manager", "admin"]`:

- `listStatements`
- `getStatement`
- `findByFileHash`
- `listLines`

Rule CRUD (`bankKeywordRules` queries/mutations) stays admin-only per P72 D-19.

### Mutations (`convex/bankStatements/mutations.ts`)

1. **`manualMatch(token, lineId, matchedType, matchedId)`** — Links a bank line to an expense/revenue/reimbursement/payroll record. Enforces:
   - Line exists, not already confirmed
   - Target record exists (`ctx.db.get`)
   - Pre-write cross-link guard (`by_matched` index, D-04 1:1)
   - **C3 TOCTOU defense:** post-write re-query of `by_matched`; throws `Concurrent match detected; retry` if `>1` row linked (Convex mutation atomicity rolls back the patch)

2. **`unmatch(token, lineId)`** — Clears link fields, recomputes status (`originalCategory` present → `"suggested"`, else `"unmatched"`). For a previously-confirmed line:
   - Loads original JE + lines
   - Builds reversed lines via `buildReversedLines` (swaps DR/CR)
   - Posts new JE via `createJournalEntryWithLines` with `sourceType: "bank_statement_reversal"` and `date: original.date` (JE-03 — preserves accounting period)
   - Patches line's reversal audit fields + marks original JE `isReversed=true`
   - Rejects double-unmatch (guard on `reversalJournalEntryId` already set)

3. **`confirmLine(token, lineId)`** — Posts 2-line balanced JE via `createJournalEntryWithLines` with `sourceType: "bank_statement"`, `sourceId: lineId`. Guards: missing JE accounts, already-confirmed.

4. **`batchConfirmExactTier(token, statementId)`** — Scans `by_statement_status` for `status IN ('auto_matched','suggested')`, filters to `confidence === "exact"` with both JE accounts present. Returns `{ posted, skipped, totalAmountIdr }`. Convex mutation atomicity: any throw rolls back the entire batch (no partial state).

### Tests (Wave 0 — all GREEN)

`convex/bankStatements/__tests__/`:

- **`reconcileHelpers.ts`** — `seedReconcileFixture(t)` returning 4 tokens (admin/manager/kitchen/order_staff) + statement + 3 lines (unmatched / suggested / pre-confirmed-with-JE) + candidate records (expense, alt-expense, revenue, reimbursement) + accounts.
- **`manualMatch.test.ts`** — 8 tests: manager+admin happy paths, kitchen/order_staff rejection, non-existent target, confirmed-line reject, cross-link guard, C3 TOCTOU (sequential + post-write consistency).
- **`unmatch.test.ts`** — 6 tests: suggested-line clear, originalCategory → suggested status, confirmed-line reversal JE with swapped DR/CR, reversal date = original date (JE-03), kitchen reject, double-unmatch reject.
- **`confirmLine.test.ts`** — 5 tests: balanced 2-line JE post, missing jeDebitAccountId/jeCreditAccountId guards, already-confirmed guard, kitchen reject.
- **`batchConfirm.test.ts`** — 5 tests: exact-tier post, skipped count, idempotent empty run, atomicity rollback on throw, kitchen reject.

**Result:** 24/24 tests pass.

## Verification

```
npm run type-check  ✓ 0 errors
npm run build       ✓ built in 19.55s
npm run test -- --run convex/bankStatements/__tests__/manualMatch.test.ts \
                         convex/bankStatements/__tests__/unmatch.test.ts \
                         convex/bankStatements/__tests__/confirmLine.test.ts \
                         convex/bankStatements/__tests__/batchConfirm.test.ts
                    ✓ 24 passed (24)
```

Acceptance-criteria grep results:

| Check | Result |
|-------|--------|
| `confirmedJournalEntryId` in schema.ts | 1 match |
| `reversalJournalEntryId` in schema.ts | 1 match |
| `createdExpenseId` in schema.ts | 1 match |
| `bank_statement_reversal` in schema.ts | 1 match |
| `bank_statement_reversal` in journalEngine.ts | 1 match |
| `"bank_statement"` still in NON_REVERSIBLE_TYPES | present (unchanged) |
| `["admin"]` in queries.ts | 0 matches |
| `["manager", "admin"]` in queries.ts | 4 matches |
| `export const manualMatch/unmatch/confirmLine/batchConfirmExactTier` in mutations.ts | 1 each |
| `sourceType: "bank_statement_reversal"` in mutations.ts | 2 matches (unmatch code + comment) |
| `createReversalEntry` in mutations.ts | 0 matches |
| `matchedCount` in Phase 73 section of mutations.ts | 0 matches |
| `Concurrent match detected` in mutations.ts | 2 matches |

## Deviations from Plan

### Environment deviation

**node_modules not populated in worktree.** Per CLAUDE.md MEMORY notes on lessons_phase_72_triple_review: "worktree executors don't populate main tree's node_modules." First `npm run test` run silently failed because convex-test's `import.meta.glob("../../../convex/**/*.*s")` resolved from the main tree's `node_modules/convex-test/...`, scanning main tree's `convex/bankStatements/mutations.ts` which does not contain the new exports.

**Fix applied:** Ran `npm install --prefer-offline` in the worktree (53s, 465 packages). Tests then resolved correctly and all 24 pass. No code changes — this is a worktree setup fix, not a plan deviation.

### Test fixture refinement (not a Rule 1-3 deviation)

During the GREEN cycle, two manualMatch tests needed minor adjustment because the shared fixture pre-links `matchedLineId → expenseId` and `confirmedLineId → altExpenseId`:

- Test "allows manager to link an unmatched line to an expense" switched from `expenseId` (already taken) to `reimbursementId` (free) for the unmatched-line target.
- Test "TOCTOU sequential guard" seeds a fresh expense in-test rather than relying on a fixture target that was already linked.

The mutation code itself was not changed; these are test refinements that accurately exercise the pre-write cross-link guard behavior.

No Rule 1-3 auto-fixes triggered. No Rule 4 architectural changes needed. Plan executed as written.

## Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 0 | Sync plans to worktree | `748a21ca` | 10 planning docs |
| 1 | Task 1 — Schema + widen queries + journalEngine | `f44f990e` | schema.ts, journalEngine.ts, queries.ts |
| 2 | Task 2 — Wave 0 test stubs (RED) | `b8a69a93` | 4 test files + reconcileHelpers.ts |
| 3 | Task 3 — Implement 4 mutations (GREEN) | `e8b53157` | mutations.ts + 2 test refinements |

## Downstream Contracts

Plan 02 (Wave 1b — still to execute) extends `mutations.ts` with `createFromOverride` on `bankKeywordRules` and inline-create mutations. Plan 03/04/05 (Wave 2) consume the hook surface:

- Frontend can call `api.bankStatements.mutations.manualMatch` / `unmatch` / `confirmLine` / `batchConfirmExactTier` as manager+admin.
- Frontend can read `api.bankStatements.queries.listLines` / `getStatement` / `listStatements` / `findByFileHash` as manager+admin.
- Any line with `confirmedJournalEntryId` links to the posted JE; `reversalJournalEntryId` links to the reversal JE.

## Known Stubs

None. All ship-ready mutations with full test coverage.

## Self-Check: PASSED

Verified files exist:
- `convex/schema.ts` — modified (D-25/D-26)
- `convex/lib/journalEngine.ts` — modified (JournalSourceType extended)
- `convex/bankStatements/queries.ts` — modified (widened permissions)
- `convex/bankStatements/mutations.ts` — 4 new exports
- `convex/bankStatements/__tests__/reconcileHelpers.ts` — created
- `convex/bankStatements/__tests__/manualMatch.test.ts` — created
- `convex/bankStatements/__tests__/unmatch.test.ts` — created
- `convex/bankStatements/__tests__/confirmLine.test.ts` — created
- `convex/bankStatements/__tests__/batchConfirm.test.ts` — created

Verified commits exist:
- `748a21ca` — plan sync
- `f44f990e` — Task 1
- `b8a69a93` — Task 2
- `e8b53157` — Task 3
