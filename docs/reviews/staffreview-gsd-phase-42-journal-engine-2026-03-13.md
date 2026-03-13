# Staff Review: Phase 42 - Journal Engine

**Reviewer:** Senior Engineer (Staff Review)
**Date:** 2026-03-13
**Branch:** `gsd/phase-42-journal-engine`
**Base:** `ff75694` (origin/main)
**Head:** `5d4ff82`
**Changed files:** `convex/lib/journalEngine.ts` (327 lines), `convex/lib/__tests__/journalEngine.test.ts` (258 lines)

---

## Summary

Phase 42 delivers exactly what was planned: a double-entry journal engine consisting of two async ctx-dependent functions (`createJournalEntryWithLines`, `createReversalEntry`) and five pure functions (`validateJournalLines`, `validateVoidPairing`, `buildDebitLine`, `buildCreditLine`, `buildReversedLines`) in a single 327-line file. The implementation has high plan fidelity -- every must-have truth from the plan is satisfied, the file structure matches the specified layout, all exports are present, and the grep audits confirm no journal insert leakage outside the engine. The 27 unit tests cover the pure validation path thoroughly.

The code quality is high. Comments reference the specific requirement IDs (JE-01 through JE-06), validation ordering is correct (negative before integer), the reversal correctly uses `original.date` instead of `Date.now()`, and type safety is maintained throughout using `MutationCtx` and `Id<>` generics rather than `any`. There are no critical issues that would block merge. There are a few improvements worth considering before downstream phases start consuming this engine.

---

## Critical Issues (must fix before merge)

None.

---

## Improvements (should fix, important)

### I1: No integration tests for ctx-dependent functions

The plan explicitly acknowledges this as a deferral: "Integration tests for ctx-dependent functions deferred -- pure function extraction covers critical validation logic. Full integration coverage should be added before Phase 44 begins." While the pure function tests are thorough, the two most important functions (`createJournalEntryWithLines` and `createReversalEntry`) have zero test coverage. These functions contain critical logic:

- `createJournalEntryWithLines`: generates entry numbers, inserts headers, inserts lines with denormalized dates
- `createReversalEntry`: fetches original, guards already-reversed, fetches lines, calls createJournalEntryWithLines, patches original

The project already uses `convex-test` (version ^0.0.41 per RESEARCH.md) and has 709+ existing tests. Adding 5-8 integration tests via `convex-test` would cover the happy path and the key error paths (entry not found, already reversed, no lines) before Phases 44-47 start depending on this engine. The risk is that a subtle bug in the insert or patch logic (e.g., missing a required schema field) would only be caught at runtime when downstream phases first use the engine.

**Recommendation:** Add integration tests before starting Phase 44. This was already planned; flagging to ensure it does not slip.

### I2: `JournalSourceType` includes "manual" but `createJournalEntryWithLines` accepts it

The `JournalSourceType` type includes `"manual"` to match the schema, which is correct for type completeness. However, `createJournalEntryWithLines` accepts `JournalSourceType` as `params.sourceType` without any guard against `"manual"`. This means any downstream caller could accidentally create a `sourceType: "manual"` entry through the engine, even though no Phase 42 mutation does so and manual entries are not reversible via `createReversalEntry`.

This is a latent risk: if Phase 47 (manual entries) introduces a different creation pattern or if a developer mistakenly passes `"manual"` to the engine from an automated flow, the entry would be created but would be irreversible through the standard void path.

**Recommendation:** Document this explicitly in the function's JSDoc, or consider splitting the type into `AutomatedJournalSourceType` (without "manual") for `createJournalEntryWithLines` and keeping `JournalSourceType` for the schema-matching superset. Low urgency since Phase 47 will handle manual entries explicitly.

### I3: `validateVoidPairing` uses `string` parameters instead of typed parameters

`validateVoidPairing(originalSourceType: string, voidSourceType: string)` accepts raw strings. While this works for the current pure-function testing pattern (mock values), it means callers can pass arbitrary strings without compile-time safety. In `createReversalEntry`, the `sourceType` parameter is already correctly typed as `"expense_void" | "reimbursement_void" | "payroll_void"`, but `original.sourceType` flows in as `string` from the schema union. The pure function itself has no type narrowing.

**Recommendation:** Type the parameters as `JournalSourceType` and the void subset type respectively. This would catch misuse at compile time rather than runtime. Low priority since `createReversalEntry` already constrains the types at its boundary.

---

## Refinements (nice to have)

### R1: `buildDebitLine` and `buildCreditLine` do not validate their `amount` parameter

These convenience builders accept any `number` as `amount`, including negatives, zero, and fractional values. The downstream `validateJournalLines` will catch these at entry creation time, but it creates a confusing developer experience: you can build a line with `buildDebitLine(accId, -50000)` and only get the error when submitting the entry.

**Recommendation:** Consider adding a simple guard (`if (amount <= 0) throw`) or at minimum document that validation happens at submission, not at line construction. Very low priority.

### R2: `NON_REVERSIBLE_TYPES` and `VALID_VOID_PAIRS` are recreated on every call

These constants are declared inside `validateVoidPairing`. Since the function is pure and these values never change, they could be module-level constants. This is a micro-optimization with negligible performance impact for this use case.

### R3: Minor grammar in error message

Line 139: `Cannot reverse a expense_void entry` -- should be `Cannot reverse an expense_void entry` (article "an" before vowel sound). The test on line 167 asserts this exact string, so both would need updating.

### R4: RESEARCH.md and PLAN.md have a minor discrepancy on `JournalSourceType`

RESEARCH.md's code example (line 346-353) shows `JournalSourceType` excluding "manual" with a comment "excludes 'manual' -- no mutation this phase". The PLAN.md explicitly includes "manual" with a comment "included to match schema". The implementation follows the PLAN (correct behavior -- matching the schema is the right choice). The RESEARCH.md example is outdated relative to the final plan decision. No action needed since RESEARCH docs are point-in-time, but worth noting for future reference.

---

## Test Coverage Assessment

### What is covered (27 tests across 5 describe blocks):

| Block | Tests | Coverage |
|-------|-------|----------|
| `validateJournalLines` | 14 | Balanced, imbalanced, single line, empty, both-sided, zero-zero, negative debit, negative credit, fractional negative (ordering), fractional debit, fractional credit, multi-line, large amounts, line-indexed errors |
| `validateVoidPairing` | 6 | All 3 valid pairings, mismatched pairing, manual rejection, double-void rejection |
| `buildDebitLine` | 2 | With and without description |
| `buildCreditLine` | 2 | With and without description |
| `buildReversedLines` | 3 | Swap amounts, preserve accountId/description, preserve undefined description |

### What is NOT covered:

| Gap | Risk | Mitigation |
|-----|------|------------|
| `createJournalEntryWithLines` happy path | Medium -- untested DB insert pattern | Type-checking against schema provides compile-time safety; integration tests planned before Phase 44 |
| `createJournalEntryWithLines` calls `getNextNumber` | Low -- counter helper has its own tests | Indirect confidence from counter.ts test suite |
| `createReversalEntry` happy path | Medium -- full reversal flow untested | Code structure is straightforward; delegates to tested pure functions |
| `createReversalEntry` error paths (not found, already reversed, no lines) | Medium -- guards are simple but untested | These are 1-2 line guards; risk of regression is low |
| `createReversalEntry` patches original entry | Low -- single `ctx.db.patch` call | Schema types enforce field correctness |
| Edge case: extremely long description in reversal | Negligible | No length limit in schema |

**Assessment:** The pure function coverage is excellent and thorough. The gap in integration testing for the two async functions is acknowledged in the plan and is acceptable for merge, provided integration tests are added before Phase 44 begins consuming the engine. The 27 tests provide high confidence in the validation and builder logic, which is where the most complex logic lives.

---

## Downstream Readiness

### Phase 43: Chart of Accounts Management
No dependency on journal engine functions. Phase 43 manages the `accounts` table (CRUD). The `accountId: Id<"accounts">` reference in `JournalLine` means Phase 43 must exist (accounts must be seeded) before journal entries can be created. Phase 41 already seeds 39 PSAK accounts, so this dependency is met. **Ready.**

### Phase 44: Expense Submission
Will call `createJournalEntryWithLines` with `sourceType: "expense_approval"`. The interface is clean: pass `date`, `description`, `sourceType`, `sourceId`, `createdBy`, and `lines[]`. The `buildDebitLine`/`buildCreditLine` convenience builders reduce boilerplate. **Ready.**

### Phase 45: Expense Approval / Void
Will call both `createJournalEntryWithLines` (for approval JE) and `createReversalEntry` (for void). The void pairing `expense_approval -> expense_void` is validated. `sourceId` passthrough maintains index queryability. **Ready.**

### Phase 46: Payroll
Will call `createJournalEntryWithLines` with `sourceType: "payroll"` and `createReversalEntry` with `"payroll_void"`. **Ready.**

### Phase 47: Manual Journal Entries
The `"manual"` sourceType is included in `JournalSourceType` and accepted by `createJournalEntryWithLines`. Manual entries created through the engine will pass all validation. They cannot be reversed via `createReversalEntry` (explicitly guarded), which matches the design intent (manual corrections create opposite entries directly). **Ready, with the caveat noted in I2.**

### Cross-cutting concern: Immutability enforcement
The grep audit confirms no `ctx.db.insert("journalEntries")` or `ctx.db.insert("journalEntryLines")` exists outside `journalEngine.ts`. This invariant must be maintained as Phases 44-47 are implemented. **Recommendation:** Add a CI grep check or lint rule to enforce this invariant going forward.

---

## Overall Assessment

**CONDITIONAL PASS** -- merge is safe, but integration tests must be added before Phase 44 begins.

The implementation is faithful to the plan, architecturally sound, well-documented with requirement ID references, and correctly structured for downstream consumption. The pure function test coverage is thorough. The only material gap is the absence of integration tests for the two async functions, which the team has already acknowledged and planned to address. The code is clean, minimal, and avoids over-engineering -- there is no scope creep beyond what was planned.

| Dimension | Rating |
|-----------|--------|
| Plan fidelity | Excellent -- 17/17 must-haves, zero deviations |
| Code quality | High -- typed, documented, follows project patterns |
| Test adequacy | Good for pure functions, gap in integration tests |
| Downstream readiness | Excellent -- clean interface for all 5 downstream phases |
| Scope discipline | Excellent -- no scope creep, no over-engineering |

---

*Review completed: 2026-03-13*
*Reviewer: Staff Engineer (automated review)*
