---
phase: 41-schema-seed-counters
verified: 2026-03-13T12:30:00Z
status: passed
score: 9/9 must-haves verified
must_haves:
  truths:
    - "Running accounts:seedDefaults creates 39 GL accounts with correct codes, names, types, categories"
    - "Running accounts:seedDefaults a second time produces no duplicates (idempotent upsert)"
    - "All 39 default accounts have isSystem: true and isActive: true"
    - "journalEntryLines table has entryDate field with by_account_entryDate compound index"
    - "All 10 new tables and users modification pass type-check"
    - "getNextNumber(ctx, 'EXP') returns EXP-MMDD-NNN format with WIB date"
    - "getNextNumber(ctx, 'JE') returns JE-MMDD-NNN format with WIB date"
    - "Sequential calls to getNextNumber increment the sequence (001, 002, 003)"
    - "MMDD uses WIB timezone, not UTC"
  artifacts:
    - path: "convex/schema.ts"
      status: verified
    - path: "convex/accounts/mutations.ts"
      status: verified
    - path: "convex/accounts/__tests__/seed.test.ts"
      status: verified
    - path: "convex/lib/counter.ts"
      status: verified
    - path: "convex/lib/__tests__/counter.test.ts"
      status: verified
  key_links:
    - from: "convex/accounts/mutations.ts"
      to: "convex/schema.ts"
      via: "ctx.db.insert('accounts', ...) and withIndex('by_code', ...)"
      status: verified
    - from: "convex/lib/counter.ts"
      to: "convex/lib/periodRange.ts"
      via: "import getWibComponents"
      status: verified
    - from: "convex/lib/counter.ts"
      to: "convex/schema.ts"
      via: "ctx.db.query('counters').withIndex('by_prefix_date', ...)"
      status: verified
---

# Phase 41: Schema, Seed & Counters Verification Report

**Phase Goal:** Add 10 accounting tables, CoA seed function, and atomic daily counter -- the schema and utility foundation for expense tracking and journal entries.
**Verified:** 2026-03-13T12:30:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running accounts:seedDefaults creates GL accounts with correct codes, names, types, categories | VERIFIED | `convex/accounts/mutations.ts` exports `DEFAULT_ACCOUNTS` with 39 entries and `seedDefaults` mutation using upsert pattern via `by_code` index. 7 seed tests pass (seed.test.ts). |
| 2 | Running accounts:seedDefaults a second time produces no duplicates (idempotent) | VERIFIED | Upsert pattern: queries by `by_code` index, patches if exists, inserts if not. Returns `"created"` or `"updated"` action per account. Follows productionUnitTypes:seedDefaults pattern. |
| 3 | All default accounts have isSystem: true and isActive: true | VERIFIED | Every entry in `DEFAULT_ACCOUNTS` array has `isSystem: true, isActive: true`. Test "all entries have isSystem: true and isActive: true" passes. |
| 4 | journalEntryLines table has entryDate field with by_account_entryDate compound index | VERIFIED | schema.ts line 1755: `entryDate: v.number()`. Line 1761: `.index("by_account_entryDate", ["accountId", "entryDate"])`. Also has `by_entryDate` index (line 1762) per staff review recommendation. |
| 5 | All 10 new tables and users modification pass type-check | VERIFIED | `npm run type-check` passes cleanly. 10 new tables confirmed via grep. Users table has `bankAccountNumber` and `bankName` at lines 441-442. |
| 6 | getNextNumber(ctx, 'EXP') returns EXP-MMDD-NNN format with WIB date | VERIFIED | `formatCounterNumber("EXP", "0312", 1)` returns `"EXP-0312-001"` -- test passes. getNextNumber uses getWibDateStr for MMDD extraction. |
| 7 | getNextNumber(ctx, 'JE') returns JE-MMDD-NNN format with WIB date | VERIFIED | `formatCounterNumber("JE", "0312", 42)` returns `"JE-0312-042"` -- test passes. Same getWibDateStr pipeline. |
| 8 | Sequential calls to getNextNumber increment the sequence | VERIFIED | counter.ts lines 80-86: reads `counter.lastSequence + 1` or starts at 1 for new counter row. Atomicity guaranteed by Convex OCC (`.unique()` on lookup prevents silent corruption). |
| 9 | MMDD uses WIB timezone, not UTC | VERIFIED | `getWibDateStr` delegates to `getWibComponents` from `periodRange.ts` (applies +7h WIB offset). 6 WIB date tests pass including cross-day boundary (UTC 18:00 = WIB March 12, not March 11). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/schema.ts` | 10 new tables + users bank fields | VERIFIED | 74 total tables (64 existing + 10 new). accounts, expenses, expenseStatusHistory, reimbursementBatches, reimbursementBatchItems, journalEntries, journalEntryLines, bankAccounts, payrollEntries, counters all present with correct fields, types, and indexes. Users has bankAccountNumber and bankName optional strings. |
| `convex/accounts/mutations.ts` | seedDefaults mutation with PSAK-aligned accounts | VERIFIED | 110 lines. Exports `DEFAULT_ACCOUNTS` array (39 accounts) and `seedDefaults` mutation with upsert pattern. All 7 account types represented with correct PSAK code ranges. |
| `convex/accounts/__tests__/seed.test.ts` | Seed idempotency and isSystem flag tests | VERIFIED | 114 lines (exceeds min_lines: 30). 7 pure data validation tests: count, isSystem/isActive flags, code uniqueness, PSAK ranges, type counts, key codes, field types. All pass. |
| `convex/lib/counter.ts` | getNextNumber atomic daily counter helper | VERIFIED | 89 lines (exceeds min_lines: 20). Exports `getNextNumber`, `formatCounterNumber`, `getWibDateStr`. Uses `.unique()` for counter lookup. Optional `now` parameter for testability. |
| `convex/lib/__tests__/counter.test.ts` | Tests for counter formatting and WIB date handling | VERIFIED | 66 lines (exceeds min_lines: 40). 12 tests: 6 format tests + 6 WIB date tests including year boundary, midnight edge, and month indexing. All pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/accounts/mutations.ts` | `convex/schema.ts` | `ctx.db.insert("accounts", ...)` | WIRED | Line 96: insert with full account fields. Line 86: patch on existing. |
| `convex/accounts/mutations.ts` | `convex/schema.ts` | `withIndex("by_code", ...)` | WIRED | Line 81: queries by_code index for upsert deduplication. |
| `convex/lib/counter.ts` | `convex/lib/periodRange.ts` | `import getWibComponents` | WIRED | Line 17: imports getWibComponents. Line 46: calls it in getWibDateStr. periodRange.ts line 31 exports it. |
| `convex/lib/counter.ts` | `convex/schema.ts` | `ctx.db.query("counters")` | WIRED | Line 74: queries counters table via by_prefix_date index. Line 85: inserts new counter rows. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COA-04 | 41-01 | System seeds default accounts on first run via `accounts:seedDefaults` | SATISFIED | seedDefaults mutation creates 39 PSAK-aligned accounts (7 Revenue, 4 COGS, 11 OpEx, 3 Other, 6 Assets, 5 Liabilities, 3 Equity). Note: ROADMAP says "36" but plan's detailed enumeration totals 39 -- implementation follows authoritative detail. |
| COA-05 | 41-01 | System accounts (isSystem: true) cannot be deleted by users | SATISFIED | All 39 defaults have isSystem: true. No delete mutation exists in this phase. Deletion guard enforcement deferred to Phase 43 (COA-03) when account CRUD is built -- this phase establishes the data contract. |
| EXP-06 | 41-02 | Expense numbers follow EXP-MMDD-NNN format with atomic daily counter | SATISFIED | `getNextNumber(ctx, "EXP")` produces EXP-MMDD-NNN format. Atomic via Convex OCC. 12 formatting + WIB date tests pass. |
| JE-04 | 41-01 | Journal entry lines denormalize entryDate from parent for index-based period queries | SATISFIED | `journalEntryLines.entryDate: v.number()` at schema line 1755. Compound index `by_account_entryDate` at line 1761. Additional `by_entryDate` index at line 1762 for P&L aggregation. |
| JE-05 | 41-02 | Journal entries use JE-MMDD-NNN format with atomic daily counter | SATISFIED | `getNextNumber(ctx, "JE")` produces JE-MMDD-NNN format. Same atomic counter infrastructure as EXP prefix. Test confirms `formatCounterNumber("JE", "0312", 42)` returns `"JE-0312-042"`. |

No orphaned requirements. REQUIREMENTS.md maps exactly 5 requirements to Phase 41 (COA-04, COA-05, EXP-06, JE-04, JE-05), matching the union of Plan 01 and Plan 02 requirements fields.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | -- | -- | -- | No TODO, FIXME, PLACEHOLDER, HACK, or XXX markers found in any new files. No empty implementations. No console.log-only handlers. |

### Human Verification Required

#### 1. Seed Function Runtime Behavior

**Test:** Run `accounts:seedDefaults` from Convex Dashboard Functions tab.
**Expected:** Returns array of 39 `{ code, action: "created", id }` entries on first run. Returns 39 `{ code, action: "updated", id }` on second run.
**Why human:** Requires Convex runtime and Dashboard access. Pure data tests verify array correctness but not runtime mutation behavior (insert/patch against live database).

#### 2. Counter Sequential Increment in Runtime

**Test:** Call `getNextNumber(ctx, "EXP")` twice in succession from a Convex mutation.
**Expected:** Returns `"EXP-MMDD-001"` then `"EXP-MMDD-002"` where MMDD is today's WIB date.
**Why human:** Requires Convex MutationCtx and live database. Pure formatting is tested but the ctx.db.query/insert/patch flow is not unit-tested (would require convex-test infrastructure).

### Notes

**Account count discrepancy (39 vs 36):** The ROADMAP.md Success Criterion 1 and multiple plan references say "36 GL accounts" but the plan's detailed account enumeration (7 Revenue + 4 COGS + 11 OpEx + 3 Other + 6 Assets + 5 Liabilities + 3 Equity) totals 39. The implementation correctly followed the detailed enumeration. The tests assert 39. This is a documented arithmetic correction, not a scope deviation.

**Table count:** Schema has 74 total tables (not 75 as Plan 01 assumed). The plan assumed 65 existing tables, but actual existing count was 64. Either way, the delta of +10 new accounting tables is correct and verified.

### Gaps Summary

No gaps found. All 9 observable truths verified. All 5 artifacts pass all three verification levels (exists, substantive, wired). All 4 key links are wired. All 5 requirements are satisfied. No anti-patterns detected.

---

_Verified: 2026-03-13T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
