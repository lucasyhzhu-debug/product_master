# Staff Review: Phase 42 Plan -- Journal Engine

**Date:** 2026-03-13
**Reviewer:** Staff Engineer Agent
**Artifact:** .planning/phases/42-journal-engine/42-01-PLAN.md
**Verdict:** APPROVED WITH CONDITIONS

## Summary

The Phase 42 plan is well-structured, narrowly scoped, and faithfully implements the PRD's journal engine requirements (JE-01, JE-02, JE-03, JE-06). The TDD approach with pure function extraction for testability is the correct pattern. However, there is a meaningful type mismatch between the plan's `JournalSourceType` and the actual schema `sourceType` union, the `buildReversedLines` export is missing from the artifacts checklist, and the test strategy for the ctx-dependent functions (`createJournalEntryWithLines`, `createReversalEntry`) is thin -- relying entirely on pure function tests and grep audits without any integration-level coverage of the actual database-writing code paths.

## Critical Issues

### C1: JournalSourceType excludes "manual" but schema includes it

**Location:** Plan lines 245-251 (type definition), Schema lines 1731-1739

The plan defines `JournalSourceType` as a 6-member union excluding `"manual"`. But the actual deployed schema (confirmed in `convex/schema.ts` line 1738) includes `v.literal("manual")` as a valid `sourceType`. This means `createJournalEntryWithLines` will refuse to create manual journal entries even though the schema supports them.

The plan's rationale (lines from CONTEXT.md: "manual exists in schema but no UI or mutation this phase") is understandable for deferral, but the type should not actively *prevent* downstream use. If Phase 43+ or a future manual-JE feature tries to call `createJournalEntryWithLines` with `sourceType: "manual"`, it will get a TypeScript compilation error.

**Fix:** Include `"manual"` in `JournalSourceType`. The type should match the schema's union exactly. Omitting it from the type while including it in the schema creates a false constraint that will require a code change in `journalEngine.ts` when manual JE support is added later. The whole point of JE-06 (single creation helper) is that *all* JE creation goes through this function -- including future manual entries.

### C2: No integration tests for createJournalEntryWithLines or createReversalEntry

**Location:** Plan Task 1 (lines 167-291), Task 2 (lines 293-380)

The plan tests only pure functions (`validateJournalLines`, `buildDebitLine`, `buildCreditLine`, `buildReversedLines`) via Vitest unit tests. The two async functions that actually write to the database (`createJournalEntryWithLines` and `createReversalEntry`) have zero test coverage. The plan acknowledges convex-test exists (RESEARCH.md line 79) but defers integration tests.

For a financial integrity layer that downstream phases 44-47 depend on, this is insufficient. Key untested behaviors:
- Entry number generation via `getNextNumber` (counter integration)
- `entryDate` denormalization actually being written to `journalEntryLines`
- `isReversed` and `reversedByEntryId` actually being set on the original entry
- `createReversalEntry` actually fetching original lines and delegating to `createJournalEntryWithLines`
- Error path when original entry is not found

These are not exotic edge cases -- they are the core contract of the module.

**Fix:** Add at least 4-5 convex-test integration tests covering:
1. Happy path: `createJournalEntryWithLines` creates header + lines with correct denormalized `entryDate`
2. Entry number: Returned entry has a JE-MMDD-NNN formatted `entryNumber`
3. Reversal happy path: `createReversalEntry` creates reversal entry, marks original `isReversed: true`
4. Reversal date: Reversal entry has same `date` as original (not `Date.now()`)
5. Double reversal: `createReversalEntry` on already-reversed entry throws

If convex-test setup is prohibitive, document this as a known gap and add the tests as a follow-up task before Phase 44 begins.

## Important Improvements

### I1: buildReversedLines missing from exports artifact list

**Location:** Plan line 32 (exports array)

The plan's `must_haves.artifacts[0].exports` lists 8 items but omits `buildReversedLines`. Yet `buildReversedLines` is:
- Defined as an exported pure function (line 278)
- Tested in Task 1 (lines 185, 210-211)
- Called by `createReversalEntry` (line 344)
- Imported in the test file (line 194)

This means the verification step checking exports will either miss it or incorrectly flag it.

**Fix:** Add `"buildReversedLines"` to the exports array in `must_haves.artifacts[0].exports`.

### I2: Reversal sourceId inheritance may be incorrect for some void patterns

**Location:** Plan line 344, RESEARCH.md Open Question 2

The plan has `createReversalEntry` pass `sourceId: original.sourceId` to `createJournalEntryWithLines`. But the PRD (Section 4) shows the following void patterns:
- **Expense void:** `sourceType: "expense_void"`, `sourceId: expense._id` -- matches original approval entry's sourceId (both reference the expense)
- **Reimbursement void:** `sourceType: "reimbursement_void"`, `sourceId: batch._id` -- matches original reimbursement entry's sourceId (both reference the batch)

So inheritance works for all current patterns. However, the `createReversalEntry` signature (line 331) does not allow the caller to override `sourceId` if needed in the future. This is a minor extensibility concern.

**Recommendation:** Accept as-is for v1.7 but add a code comment noting that `sourceId` is inherited from original. If a downstream phase needs a different sourceId, they can call `createJournalEntryWithLines` directly with reversed lines (which is already noted in RESEARCH.md).

### I3: createReversalEntry should validate the original's sourceType matches the reversal sourceType

**Location:** Plan lines 331-352

`createReversalEntry` accepts `sourceType: "expense_void" | "reimbursement_void" | "payroll_void"` but does not validate that it corresponds to the original entry's sourceType. For example, nothing prevents calling `createReversalEntry(ctx, expenseJournalEntryId, "payroll_void", userId)` -- the function would happily create a "payroll_void" reversal of an "expense_approval" entry. This is a data integrity concern.

**Recommendation:** Add a guard that validates the reversal sourceType is the logical void pair of the original's sourceType. For example:
- `expense_approval` can only be reversed by `expense_void`
- `reimbursement` can only be reversed by `reimbursement_void`
- `payroll` can only be reversed by `payroll_void`

This prevents mispairing at the engine level rather than relying on each downstream consumer to pass the correct void type.

## Refinements

### R1: Floating-point sum comparison for large IDR amounts

**Location:** Plan line 270, RESEARCH.md lines 292-296

The plan uses exact equality (`!==`) for the debit/credit sum comparison and notes that IDR amounts are whole numbers. This is correct. However, if a caller passes `30000.0 + 20000.0` as two debit lines and `50000` as a credit line, JavaScript integer addition is exact for values up to `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). Since IDR amounts will be in the millions at most, this is safe.

**Recommendation:** Add a brief comment in the code documenting that exact equality is safe because IDR amounts are integers and well within safe integer range. No code change needed.

### R2: Error messages could include line index for debugging

**Location:** Plan lines 264-270

When validation fails on a specific line (e.g., "both debit and credit nonzero"), the error message does not identify which line caused the failure. In a multi-line entry (e.g., payroll split across multiple accounts), this makes debugging harder.

**Recommendation:** Include the line index in line-level error messages, e.g., `"Journal entry line 3 must have either debit or credit, not both"`. This is a minor UX improvement for developers debugging failed mutations.

### R3: Test for buildReversedLines preserving undefined description

**Location:** Plan lines 185, 278-279

`buildReversedLines` maps lines including `description: line.description`. If a line has no `description` field (undefined), the output should also have `description: undefined`. This is important because including an explicit `undefined` vs not having the property at all can behave differently in some contexts.

**Recommendation:** Add a test case where some original lines have no `description` and verify the reversed lines also lack it. Minor but useful.

### R4: Plan min_lines estimate may be too low

**Location:** Plan line 33 (`min_lines: 90`)

The plan specifies 90 minimum lines for `journalEngine.ts`. Based on the detailed implementation requirements (type definitions ~20 lines, validateJournalLines ~25 lines, buildDebitLine/buildCreditLine ~10 lines, buildReversedLines ~5 lines, createJournalEntryWithLines ~25 lines, createReversalEntry ~30 lines, imports ~5 lines), the actual file will likely be 120-140 lines. The min_lines constraint is conservative, which is fine -- but worth noting.

**Status:** No action needed, just awareness.

### R5: Plan says 16 tests in task 1 but test groups only list ~16

**Location:** Plan line 290 (done condition says "All 16 validation and builder tests")

The test groups explicitly list: 10 (validateJournalLines) + 2 (buildDebitLine) + 2 (buildCreditLine) + 2 (buildReversedLines) = 16. This matches. The count is correct.

**Status:** No issue.

## PRD Fidelity Checklist

| PRD Requirement | Plan Coverage | Status |
|----------------|---------------|--------|
| JE-01: Double-entry integrity | `validateJournalLines` enforces debits = credits, min 2 lines, single-sided, no negatives | Covered |
| JE-02: Immutability (no update mutation) | No update/patch exists; only reversal marking | Covered |
| JE-03: Reversal same-period dating | `createReversalEntry` uses `original.date` not `Date.now()` | Covered |
| JE-04: entryDate denormalization | Helper auto-sets `entryDate: params.date` on all lines | Covered (was Phase 41 schema) |
| JE-05: JE-MMDD-NNN counter format | `getNextNumber(ctx, "JE")` from Phase 41 counter.ts | Covered (Phase 41) |
| JE-06: Single creation helper | All inserts go through `createJournalEntryWithLines`, grep audits verify | Covered |

**Scope creep:** None detected. The plan stays tightly within JE-01/02/03/06 boundaries.

**Missing from PRD but in plan:** `buildDebitLine`, `buildCreditLine`, `buildReversedLines` convenience functions -- these are within Claude's Discretion scope and add value. Acceptable additions.

## Downstream Impact Assessment

| Consumer Phase | Dependency | Risk |
|---------------|------------|------|
| Phase 44 (Expense Submission) | None direct -- no JE creation at submission | Low |
| Phase 45 (Expense Approval) | `createJournalEntryWithLines` for approval JE, `createReversalEntry` for void | Medium -- C1 (manual type) won't affect, but C2 (no integration tests) means bugs found at Phase 45 will be attributed to Phase 42 |
| Phase 46 (Reimbursement) | `createJournalEntryWithLines` for reimbursement JE, `createReversalEntry` for batch void | Medium -- same as Phase 45 |
| Phase 47 (Payroll) | `createJournalEntryWithLines` for payroll JE, `createReversalEntry` for payroll void | Medium -- same |
| Phase 49 (P&L Integration) | Reads `journalEntryLines` by `by_account_entryDate` index -- depends on correct `entryDate` denormalization | Medium -- if C2 is not addressed, denormalization correctness is untested |

## Verdict

**APPROVED WITH CONDITIONS**

The plan is architecturally sound, well-scoped, and follows established codebase patterns. The TDD approach and pure function extraction are exemplary. However, two conditions must be met before implementation:

1. **C1 (Critical): Include `"manual"` in `JournalSourceType`** to match the schema union. The type should not be artificially narrower than the schema it writes to, especially for the single creation helper that JE-06 mandates all JE creation goes through.

2. **C2 (Critical): Add integration tests or document as accepted risk.** Either add 4-5 convex-test integration tests for the database-writing functions, or explicitly document this as a known coverage gap with a follow-up task before Phase 44. A financial integrity layer with zero test coverage on its primary code paths is a significant risk.

Additionally:
- **I1:** Add `buildReversedLines` to the exports artifact list.
- **I3:** Consider adding sourceType pairing validation in `createReversalEntry` (recommended but not blocking).
