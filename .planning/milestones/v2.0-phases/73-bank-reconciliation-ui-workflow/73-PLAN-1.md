---
phase: 73
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/schema.ts
  - convex/lib/journalEngine.ts
  - convex/bankStatements/queries.ts
  - convex/bankStatements/mutations.ts
  - convex/bankStatements/reconcileHelpers.ts
  - convex/bankKeywordRules/queries.ts
  - convex/bankKeywordRules/mutations.ts
  - convex/bankStatements/__tests__/mutations.test.ts
  - convex/bankStatements/__tests__/queries.test.ts
  - convex/bankKeywordRules/__tests__/mutations.test.ts
autonomous: true
requirements: [BANK-03, BANK-04]
tags: [bank-reconciliation, backend, schema, journal-engine]

must_haves:
  truths:
    - "Manager (not just admin) can invoke reconciliation queries and mutations"
    - "Manual match sets matchedType/matchedId, status=suggested, isAutoMatched=false"
    - "Unmatch of a confirmed line posts a reversal JE (swapped DR/CR) and retains the original"
    - "Confirm posts a balanced 2-line JE with sourceType=bank_statement and patches audit fields"
    - "Batch confirm is all-or-nothing — validates every line before the first insert"
    - "CapEx-flagged lines are rejected by confirmLine (must route through Asset Register)"
    - "createFromOverride mutation accepts manager role; existing rule `create` still rejects manager"
    - "getStatementProgress returns counts by status + matched/total/percent, reactive via by_statement_status index"
    - "getRevenueGap returns per-channel Bank CR vs ExternalRevenue diffs plus synthetic (unallocated) row"
  artifacts:
    - path: convex/schema.ts
      provides: "bankStatementLines audit fields (confirmedAt, confirmedBy, confirmedJournalEntryId, reversedAt, reversedBy, reversalJournalEntryId, createdExpenseId, createdRevenueId, createdReimbursementId); journalEntries.sourceType includes bank_statement_reversal literal"
      contains: "confirmedJournalEntryId"
    - path: convex/bankStatements/mutations.ts
      provides: "manualMatch, unmatch, confirmLine, batchConfirm mutations"
      exports: ["manualMatch", "unmatch", "confirmLine", "batchConfirm"]
    - path: convex/bankStatements/queries.ts
      provides: "getStatementProgress, getRevenueGap queries; existing queries widened to manager+admin"
      exports: ["getStatementProgress", "getRevenueGap"]
    - path: convex/bankStatements/reconcileHelpers.ts
      provides: "Pure helpers: recomputeStatus(line), extractReversalLines(originalLines)"
    - path: convex/bankKeywordRules/mutations.ts
      provides: "createFromOverride mutation (manager+admin)"
      exports: ["createFromOverride"]
    - path: convex/lib/journalEngine.ts
      provides: "NON_REVERSIBLE_TYPES includes bank_statement_reversal"
  key_links:
    - from: "convex/bankStatements/mutations.ts unmatch"
      to: "convex/lib/journalEngine.ts createJournalEntryWithLines + buildReversedLines"
      via: "direct function call, NOT createReversalEntry (bank_statement is on NON_REVERSIBLE_TYPES)"
      pattern: "createJournalEntryWithLines.*sourceType.*bank_statement_reversal"
    - from: "convex/bankStatements/mutations.ts confirmLine"
      to: "convex/lib/journalEngine.ts createJournalEntryWithLines"
      via: "2-line JE with jeDebitAccountId/jeCreditAccountId"
      pattern: "sourceType.*bank_statement"
    - from: "convex/bankStatements/queries.ts getStatementProgress"
      to: "bankStatementLines.by_statement_status index"
      via: "withIndex per status bucket"
      pattern: "by_statement_status"
---

<objective>
Extend Phase 72 bank reconciliation schema and backend so managers (not just admins) can manually match/unmatch bank lines, post journal entries on confirm, reverse JEs on unmatch, create rules from category overrides, and pull per-statement progress + per-channel revenue gap aggregates.

Purpose: BANK-03 (manual match/unmatch) and BANK-04 (per-statement counts) require new mutations, queries, schema audit fields, and permission widening. Every downstream UI plan depends on these contracts existing.

Output: Migrated schema with D-25/D-26 additions, 4 new reconciliation mutations + 2 new queries + 1 new rule mutation, permission widening on all P72 queries, Wave 0 test scaffolds covering every new behavior.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-RESEARCH.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-VALIDATION.md
@.planning/phases/72-bank-statement-parser-auto-match/72-CONTEXT.md
@convex/schema.ts
@convex/lib/journalEngine.ts
@convex/lib/auth.ts
@convex/lib/periodRange.ts
@convex/bankStatements/mutations.ts
@convex/bankStatements/queries.ts
@convex/bankKeywordRules/mutations.ts
@convex/bankStatements/__tests__

<interfaces>
From convex/lib/journalEngine.ts (existing):
```typescript
export const NON_REVERSIBLE_TYPES: readonly string[] = [
  "manual", "expense_void", "reimbursement_void", "payroll_void",
  "depreciation_void", "asset_acquisition", "bank_statement",
]; // P73 appends "bank_statement_reversal"

export function buildReversedLines(lines: JournalLine[]): JournalLine[];

export async function createJournalEntryWithLines(ctx, {
  date: number,
  description: string,
  sourceType: "bank_statement" | "bank_statement_reversal" | ..., // P73 adds the second
  sourceId?: string,
  createdBy: Id<"users">,
  lines: Array<{ accountId: Id<"accounts">, debitAmount: number, creditAmount: number, description?: string }>,
}): Promise<Id<"journalEntries">>;
```

From convex/schema.ts bankStatementLines (existing, P72):
```typescript
// Relevant fields:
statementId: Id<"bankStatements">
date: number
amountIdr: number
direction: "debit" | "credit"
rawDescription: string
linkedChannel?: string
parsedCounterparty?: string
confidence: "exact" | "strong" | "suggested" | "none"
status: "unmatched" | "auto_matched" | "suggested" | "confirmed"
matchedType?: "expense" | "revenue" | "reimbursement" | "payroll"
matchedId?: string
matchMethod?: "rule_only" | "linked_to_record" | ...
isAutoMatched?: boolean
originalCategory?: ... // Layer A rule classification (preserved on unmatch)
overrideCategoryAccountId?: Id<"accounts">
jeDebitAccountId?: Id<"accounts">
jeCreditAccountId?: Id<"accounts">
flags?: string[] // includes "capex_needs_asset_register"
// P73 adds (D-25):
confirmedAt?: number
confirmedBy?: Id<"users">
confirmedJournalEntryId?: Id<"journalEntries">
reversedAt?: number
reversedBy?: Id<"users">
reversalJournalEntryId?: Id<"journalEntries">
createdExpenseId?: Id<"expenses">
createdRevenueId?: Id<"externalRevenue">
createdReimbursementId?: Id<"reimbursementBatches">

// Existing indexes: by_statement, by_statement_status, by_matched, by_date
// P73 may add: by_channel_date (["linkedChannel", "date"]) — optional optimization
```

From convex/lib/auth.ts:
```typescript
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  token: string,
  roles: Array<"admin" | "manager" | "order_staff" | "kitchen">,
): Promise<{ _id: Id<"users">, name: string, role: string, ... }>;
```

From convex/bankStatements/queries.ts (existing — MUST widen role):
```typescript
listStatements, getStatement, listLines, getStatementStats
// All currently: requireRole(ctx, args.token, ["admin"])
// P73: widen to ["manager", "admin"]
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Schema additions + journal engine guard + Wave 0 test scaffolds</name>
  <files>
    convex/schema.ts,
    convex/lib/journalEngine.ts,
    convex/bankStatements/__tests__/mutations.test.ts,
    convex/bankStatements/__tests__/queries.test.ts,
    convex/bankKeywordRules/__tests__/mutations.test.ts
  </files>
  <read_first>
    convex/schema.ts (bankStatementLines table + journalEntries.sourceType union — around lines 1845-1991),
    convex/lib/journalEngine.ts (NON_REVERSIBLE_TYPES list lines 66-75, createJournalEntryWithLines signature, buildReversedLines helper),
    convex/bankStatements/__tests__ (existing P72 test files to mirror setup),
    convex/bankKeywordRules/mutations.ts (existing create/seed pattern for role-gate test context),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-25 and D-26 (exact field list + literal)
  </read_first>
  <behavior>
    - schema.ts: bankStatementLines adds 9 optional fields (confirmedAt, confirmedBy, confirmedJournalEntryId, reversedAt, reversedBy, reversalJournalEntryId, createdExpenseId, createdRevenueId, createdReimbursementId). journalEntries.sourceType union adds "bank_statement_reversal" literal. Optionally add index `by_channel_date` on bankStatementLines (["linkedChannel", "date"]) — include it; research Pattern 6 says low cost, covers D-14 query growth.
    - journalEngine.ts: NON_REVERSIBLE_TYPES array includes "bank_statement_reversal" so a reversal cannot itself be reversed via the engine's helper. Keep "bank_statement" also in the list (P73 bypasses the engine helper deliberately per Pitfall 1).
    - Wave 0 tests are stubs with `test.todo` OR real failing tests — each describes one behavior from the must_haves list. Files compile, run, and have pending assertions that Task 2/3 will fill in.
    - Test file for queries.ts is NEW (not previously existing); test file for bankStatements mutations.ts and bankKeywordRules mutations.ts exist from P72 — append new describe blocks, do not overwrite.
  </behavior>
  <action>
    1. Edit `convex/schema.ts`:
       - Locate `bankStatementLines` table definition. Add the 9 audit fields from D-25 as `v.optional(...)` fields. Field types per RESEARCH.md Pattern / D-25 exact list.
       - Locate `journalEntries.sourceType` union validator. Add `v.literal("bank_statement_reversal")` to the union. Keep existing `"bank_statement"` literal (added by P72 D-21).
       - On `bankStatementLines`, add `.index("by_channel_date", ["linkedChannel", "date"])` after existing indexes (Pattern 6).
    2. Edit `convex/lib/journalEngine.ts`:
       - Extend `NON_REVERSIBLE_TYPES` array to include `"bank_statement_reversal"` (keep the existing `"bank_statement"` entry; add new literal alongside it).
       - Do NOT modify `createJournalEntryWithLines` or `buildReversedLines` — P73 mutations call them directly.
    3. Create/extend test scaffolds:
       - `convex/bankStatements/__tests__/mutations.test.ts` — APPEND a `describe("manualMatch")`, `describe("unmatch")`, `describe("confirmLine")`, `describe("batchConfirm")` block. Each contains `test.todo` entries named per the must_haves truths (e.g., `test.todo("sets matchedType/matchedId, status=suggested, isAutoMatched=false")`, `test.todo("rejects confirmed lines")`, `test.todo("creates reversal JE with swapped DR/CR when line was confirmed")`, etc.). Use `test` from Vitest (already imported in the file from P72).
       - `convex/bankStatements/__tests__/queries.test.ts` — CREATE NEW file. Import pattern from P72 mutations.test.ts sibling (convex-test setup). Add `describe("getStatementProgress")` with `test.todo("returns counts by status + percent")`, and `describe("getRevenueGap")` with `test.todo("buckets credits by linkedChannel + (unallocated)")`, `test.todo("diffPercent null when externalRevenue=0 and bank>0")`, `test.todo("rejects kitchen/order_staff roles")`.
       - `convex/bankKeywordRules/__tests__/mutations.test.ts` — APPEND `describe("createFromOverride")` with `test.todo("allows manager role")`, `test.todo("allows admin role")`, `test.todo("rejects kitchen/order_staff roles")`, and a regression `test.todo("existing create mutation still rejects manager")`.
       - If any file does not exist from P72, create it using the convex-test import pattern: `import { convexTest } from "convex-test"; import schema from "../../schema"; import { api } from "../../_generated/api"; import { test, expect, describe } from "vitest";`
    4. Run `npx convex dev --once` (if possible in CI) OR mentally verify `_generated/api.d.ts` will regenerate cleanly — no other command required.
    5. Do NOT implement mutation/query bodies in this task — that is Task 2 and Task 3.
  </action>
  <verify>
    <automated>npm run type-check &amp;&amp; npm run test -- --run convex/bankStatements/__tests__/mutations.test.ts convex/bankStatements/__tests__/queries.test.ts convex/bankKeywordRules/__tests__/mutations.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "confirmedJournalEntryId" convex/schema.ts` returns a match inside bankStatementLines
    - `grep -n "reversalJournalEntryId" convex/schema.ts` returns a match inside bankStatementLines
    - `grep -n "createdExpenseId" convex/schema.ts` returns a match inside bankStatementLines
    - `grep -n "bank_statement_reversal" convex/schema.ts` returns a match inside journalEntries.sourceType
    - `grep -n "bank_statement_reversal" convex/lib/journalEngine.ts` returns a match inside NON_REVERSIBLE_TYPES array
    - `grep -n "by_channel_date" convex/schema.ts` returns exactly one match on bankStatementLines
    - `convex/bankStatements/__tests__/queries.test.ts` exists and is non-empty
    - `grep -n "describe.*manualMatch" convex/bankStatements/__tests__/mutations.test.ts` returns a match
    - `grep -n "describe.*getStatementProgress" convex/bankStatements/__tests__/queries.test.ts` returns a match
    - `grep -n "describe.*createFromOverride" convex/bankKeywordRules/__tests__/mutations.test.ts` returns a match
    - `npm run type-check` exits 0
    - `npm run test -- --run convex/bankStatements/__tests__/mutations.test.ts` exits 0 with todo entries skipped (not failed)
  </acceptance_criteria>
  <done>Schema extended with D-25 fields + D-26 literal + by_channel_date index; journalEngine NON_REVERSIBLE_TYPES includes both bank_statement and bank_statement_reversal; 3 test files contain describe/test.todo scaffolds for every new behavior; type-check passes; todo tests skip (do not fail).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Reconciliation mutations (manualMatch, unmatch, confirmLine, batchConfirm) + reconcileHelpers</name>
  <files>
    convex/bankStatements/mutations.ts,
    convex/bankStatements/reconcileHelpers.ts,
    convex/bankStatements/__tests__/mutations.test.ts
  </files>
  <read_first>
    convex/bankStatements/mutations.ts (existing createFromParsedStatement pattern, ConvexError usage, lines ~1-80),
    convex/lib/journalEngine.ts (createJournalEntryWithLines signature, buildReversedLines, validateBalanced helper if present),
    convex/lib/auth.ts (requireRole return shape — needs _id and name for reversal description),
    convex/lib/periodRange.ts OR src/lib/dateUtils.ts (WIB date formatter for reversal description),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-RESEARCH.md (Code Examples section: manualMatch, unmatch, confirmLine verified contracts),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-07, D-08, D-09 (semantics)
  </read_first>
  <behavior>
    Per must_haves truths — convert each test.todo from Task 1 into a real passing test, then implement mutations.

    - `manualMatch({ token, lineId, matchedType, matchedId })`: requireRole manager+admin. Reject if line.status === "confirmed". Validate matchedId points at a record of matchedType (ctx.db.get(matchedId) returns non-null). Patch: matchedType, matchedId, matchMethod="linked_to_record", status="suggested", isAutoMatched=false. Preserve all Layer A fields (originalCategory, jeDebitAccountId, jeCreditAccountId).

    - `unmatch({ token, lineId })`: requireRole manager+admin. If was confirmed AND confirmedJournalEntryId present: fetch original journalEntryLines (withIndex by_journal_entry), call createJournalEntryWithLines with sourceType="bank_statement_reversal", sourceId=line._id, description=`Reversed by unmatch on ${wibDate} by ${user.name}`, lines=buildReversedLines(...). Capture reversalJournalEntryId. Then: recompute status (suggested if originalCategory present, else unmatched). Clear matchedType/matchedId/matchMethod ONLY when matchMethod was "linked_to_record" (preserve Layer A rule_only classifications). Patch reversedAt, reversedBy, reversalJournalEntryId when reversal posted. Do NOT patch journalEntries.isReversed on the original — both stay in ledger (D-09).

    - `confirmLine({ token, lineId })`: requireRole manager+admin. Reject if status === "confirmed", missing jeDebitAccountId or jeCreditAccountId, or flags includes "capex_needs_asset_register". Post 2-line balanced JE: DR jeDebitAccountId amountIdr / CR jeCreditAccountId amountIdr. sourceType="bank_statement", sourceId=line._id, description=`Bank: ${rawDescription.slice(0,200)}`, date=line.date. Patch status="confirmed", confirmedAt=Date.now(), confirmedBy=user._id, confirmedJournalEntryId.

    - `batchConfirm({ token, statementId })`: requireRole manager+admin. Scan lines where statementId matches AND confidence="exact" AND status IN ("auto_matched","suggested"). **Two-pass all-or-nothing:** Pass 1 validates EVERY line has jeDebitAccountId, jeCreditAccountId, amountIdr>0, no capex_needs_asset_register flag. Compute grand DR and grand CR across the batch; throw ConvexError listing ALL offenders if any line fails validation OR if grand DR !== grand CR. Pass 2 posts JEs for each line via the same path as confirmLine (reuse a shared helper). Returns `{ postedCount: number, journalEntryIds: Id[] }`.

    - `reconcileHelpers.ts` (NEW): export pure helpers:
      - `recomputeStatus(line)`: returns "suggested" if originalCategory present else "unmatched".
      - `toJournalLineArray(originalLines)`: maps journalEntryLines docs to JournalLine[] shape for buildReversedLines.
      - `validateBatchConfirmLines(lines)`: returns `{ valid: true } | { valid: false, errors: string[], grandDR, grandCR }`.
      - Keep ctx-free so unit tests can import without convex-test setup.

    Tests (real, not todo):
    - manualMatch: happy path patches fields correctly; rejects confirmed line; preserves originalCategory / jeDebitAccountId.
    - unmatch: (a) matchMethod=linked_to_record → fields cleared; (b) matchMethod=rule_only → fields preserved, status recomputed; (c) was confirmed → reversal JE created with swapped DR/CR, audit fields patched, both JEs remain (query journalEntries by sourceId returns both); (d) reversal JE has sourceType="bank_statement_reversal".
    - confirmLine: happy path creates balanced 2-line JE + patches audit; rejects already-confirmed; rejects missing accounts; rejects capex_needs_asset_register flag.
    - batchConfirm: (a) all exact-tier lines posted atomically; (b) one invalid line causes zero posts + error listing all offenders; (c) grand DR !== grand CR causes zero posts + error; (d) non-exact-tier lines are skipped (not posted, not errored).
    - Permissions: kitchen/order_staff rejected on all four mutations.
  </behavior>
  <action>
    1. Create `convex/bankStatements/reconcileHelpers.ts` exporting the three pure helpers above. Unit-testable without convex-test.
    2. Extend `convex/bankStatements/mutations.ts`:
       - Import `createJournalEntryWithLines`, `buildReversedLines` from `../lib/journalEngine`.
       - Import `requireRole` from `../lib/auth`.
       - Import `ConvexError` from `convex/values`.
       - Import helpers from `./reconcileHelpers`.
       - Implement `manualMatch`, `unmatch`, `confirmLine`, `batchConfirm` as documented above.
       - Use a WIB date formatter — if none exists backend-side for a human-readable string, implement a small inline `formatWibDate(ms: number): string` returning `YYYY-MM-DD` in WIB (reuse `getWibComponents` from `convex/lib/periodRange.ts`).
    3. Fill in the real tests replacing test.todo entries in `convex/bankStatements/__tests__/mutations.test.ts` — use convex-test setup mirroring existing P72 test file.
    4. Run `npm run test -- --run convex/bankStatements/__tests__/mutations.test.ts` until green.
    5. Run `npm run type-check` to ensure _generated/api.d.ts picks up new mutations.
  </action>
  <verify>
    <automated>npm run test -- --run convex/bankStatements/__tests__/mutations.test.ts &amp;&amp; npm run type-check</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export const manualMatch" convex/bankStatements/mutations.ts` returns 1 match
    - `grep -n "export const unmatch" convex/bankStatements/mutations.ts` returns 1 match
    - `grep -n "export const confirmLine" convex/bankStatements/mutations.ts` returns 1 match
    - `grep -n "export const batchConfirm" convex/bankStatements/mutations.ts` returns 1 match
    - `grep -n "bank_statement_reversal" convex/bankStatements/mutations.ts` returns at least 1 match (reversal sourceType)
    - `grep -n "buildReversedLines" convex/bankStatements/mutations.ts` returns at least 1 match
    - `grep -nE "requireRole\(ctx, args.token, \[\"manager\", \"admin\"\]\)" convex/bankStatements/mutations.ts` returns at least 4 matches (one per mutation)
    - `grep -n "capex_needs_asset_register" convex/bankStatements/mutations.ts` returns at least 1 match (confirmLine rejection)
    - `convex/bankStatements/reconcileHelpers.ts` exists and exports `recomputeStatus`, `validateBatchConfirmLines`
    - `npm run test -- --run convex/bankStatements/__tests__/mutations.test.ts` exits 0 with no `.todo` remaining for manualMatch/unmatch/confirmLine/batchConfirm suites
    - `npm run type-check` exits 0
  </acceptance_criteria>
  <done>All 4 mutations implemented per D-07/D-08/D-09 contracts; reconcileHelpers exports validated pure helpers; every must_haves truth covered by a passing test; batch confirm is all-or-nothing with grand DR/CR gate; reversal JE path verified (both JEs remain in ledger).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Progress/revenue-gap queries + createFromOverride rule mutation + widen P72 query guards</name>
  <files>
    convex/bankStatements/queries.ts,
    convex/bankKeywordRules/mutations.ts,
    convex/bankStatements/__tests__/queries.test.ts,
    convex/bankKeywordRules/__tests__/mutations.test.ts
  </files>
  <read_first>
    convex/bankStatements/queries.ts (existing 4 queries, all currently admin-only — lines 1-88),
    convex/bankKeywordRules/mutations.ts (existing create/update/deactivate pattern, existing admin-only guard),
    convex/bankKeywordRules/defaultRules.ts (rule shape used for createFromOverride output),
    convex/schema.ts (bankKeywordRules table fields — counterpartyPatterns, descriptionPatterns, direction, matchType, descriptionPatternsMode, confidence, priority, plSection, categoryAccountId, jeDebitAccountId, jeCreditAccountId, createdBy),
    convex/schema.ts (externalRevenue table — source, revenueGross, periodStart for getRevenueGap),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-RESEARCH.md (Code Example: getRevenueGap, Pattern 2: getStatementProgress),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-12, D-14, D-24
  </read_first>
  <behavior>
    Queries (per D-24, D-14):
    - `getStatementProgress({ token, statementId })`: requireRole manager+admin. Counts per status using by_statement_status compound index. Returns `{ unmatched, auto_matched, suggested, confirmed, total, matched, percent }` where matched = auto_matched+suggested+confirmed and percent = round(matched/total*100) (0 when total=0).
    - `getStatementProgressBatch({ token, statementIds: Id[] })`: fans out internally (Promise.all); returns Record<statementId, ProgressShape>. Used by StatementHistoryList to avoid N subscriptions per row.
    - `getRevenueGap({ token, periodStart, periodEnd })`: requireRole manager+admin. Sum bankStatementLines.amountIdr where direction="credit" and date in [periodStart, periodEnd] grouped by linkedChannel (null → (unallocated) synthetic bucket). Sum externalRevenue.revenueGross where periodStart in [periodStart, periodEnd] grouped by source. Return rows `{ channel, bankCredits, externalRevenue, diff, diffPercent }` where diffPercent = round(diff/externalRevenue*10000)/100, or `null` when externalRevenue=0 (UI displays ∞/— per D-14). Include (unallocated) row with externalRevenue=0. Sort by abs(diff) desc.

    Widen P72 query guards:
    - `listStatements`, `getStatement`, `listLines`, `getStatementStats` in `convex/bankStatements/queries.ts` — change `requireRole(ctx, args.token, ["admin"])` to `["manager", "admin"]`.
    - Do NOT widen `convex/bankKeywordRules/queries.ts` — rule CRUD stays admin-only per D-23.

    Rule mutation (per D-11, D-12):
    - `createFromOverride({ token, counterpartyPatterns, descriptionPatterns, descriptionPatternsMode, direction, matchType, confidence, priority, plSection, categoryAccountId, jeDebitAccountId, jeCreditAccountId, name, isActive })`: requireRole manager+admin (WIDER than existing `create` which stays admin-only). Validates same shape as existing `create`. Inserts into bankKeywordRules with `createdBy = user._id`, `createdAt = Date.now()`. Returns new rule _id. Regression guarantee: existing `create` mutation MUST continue to reject manager.

    Tests:
    - getStatementProgress: seed statement with known status distribution, assert counts + percent; empty statement returns all zeros with percent=0; kitchen role rejected.
    - getRevenueGap: seed 3 credit lines (gopay, tokopedia, null=unallocated), 2 externalRevenue rows (gopay, tokopedia); assert channel rows, (unallocated) row, diffPercent null when ExtRev=0.
    - P72 query regression: manager token returns results for listStatements (previously threw).
    - createFromOverride: manager-role call succeeds; admin-role call succeeds; kitchen/order_staff rejected; existing `create` still rejects manager (regression).
  </behavior>
  <action>
    1. Edit `convex/bankStatements/queries.ts`:
       - Update existing 4 queries' `requireRole` to `["manager", "admin"]`.
       - Add `getStatementProgress` query per RESEARCH Pattern 2 code example.
       - Add `getStatementProgressBatch` query — accepts `statementIds: v.array(v.id("bankStatements"))`, calls the single-statement logic via Promise.all, returns `Record<Id, ProgressShape>`.
       - Add `getRevenueGap` query per RESEARCH Code Example.
    2. Edit `convex/bankKeywordRules/mutations.ts`:
       - Add `createFromOverride` mutation with `requireRole(["manager", "admin"])`. Args validator covers all fields editable in the learn-from-override dialog per D-11.
       - Leave existing `create`, `update`, `deactivate` unchanged (admin-only).
    3. Fill in real tests replacing todos in queries.test.ts and mutations.test.ts (bankKeywordRules).
    4. Run test suites until green.
    5. Verify `npm run type-check` passes (_generated/api.d.ts picks up new queries/mutations).
  </action>
  <verify>
    <automated>npm run test -- --run convex/bankStatements/__tests__/queries.test.ts convex/bankKeywordRules/__tests__/mutations.test.ts &amp;&amp; npm run type-check</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export const getStatementProgress" convex/bankStatements/queries.ts` returns 1 match
    - `grep -n "export const getStatementProgressBatch" convex/bankStatements/queries.ts` returns 1 match
    - `grep -n "export const getRevenueGap" convex/bankStatements/queries.ts` returns 1 match
    - `grep -nE "requireRole\(ctx, args.token, \[\"manager\", \"admin\"\]\)" convex/bankStatements/queries.ts` returns at least 7 matches (4 widened + 3 new)
    - `grep -n "export const createFromOverride" convex/bankKeywordRules/mutations.ts` returns 1 match
    - `grep -nE "requireRole\(ctx, args.token, \[\"admin\"\]\)" convex/bankKeywordRules/mutations.ts` returns at least 1 match (existing `create` still admin-only)
    - `grep -n "unallocated" convex/bankStatements/queries.ts` returns at least 1 match (synthetic row literal)
    - `npm run test -- --run convex/bankStatements/__tests__/queries.test.ts` exits 0, no `.todo` entries remain
    - `npm run test -- --run convex/bankKeywordRules/__tests__/mutations.test.ts` exits 0, createFromOverride describe block all green
    - `npm run type-check` exits 0
  </acceptance_criteria>
  <done>getStatementProgress + getStatementProgressBatch + getRevenueGap queries implemented and tested; all 4 P72 queries widened to manager+admin; createFromOverride mutation added and accepts manager (regression: existing create still admin-only); every must_haves truth for BANK-04 and D-12/D-14 is test-verified.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → Convex mutation | Manager/admin session token crosses; polymorphic matchedId (string) crosses and must be revalidated server-side against matchedType |
| Convex mutation → journalEntries ledger | Confirm/unmatch trigger JE inserts — any path that bypasses requireRole + validation is a privilege escalation |
| Rule create from override → bankKeywordRules table | Widens rule creation to manager role but ONLY via this dedicated mutation; existing `create` MUST continue to reject manager |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-73-01 | Elevation | convex/bankStatements/mutations.ts (all 4 new mutations) | mitigate | Every mutation calls `requireRole(ctx, args.token, ["manager", "admin"])` at handler entry before any `ctx.db` operation (verified by acceptance_criteria grep count ≥ 4) |
| T-73-02 | Elevation | convex/bankKeywordRules/mutations.ts createFromOverride | mitigate | Dedicated mutation with its own `requireRole(["manager","admin"])`; existing `create` stays `requireRole(["admin"])` (regression test in Task 3 asserts manager rejection on `create`) |
| T-73-03 | Tampering | manualMatch matchedId (polymorphic string) | mitigate | Task 2 manualMatch calls `ctx.db.get(args.matchedId as Id<any>)` and confirms returned doc exists before patching; rejects with ConvexError if doc not found (IDOR guard) |
| T-73-04 | Tampering | batchConfirm partial-success risk | mitigate | Two-pass all-or-nothing: Pass 1 validates every line AND grand DR=CR before any insert; Pass 2 inserts all. Any validation failure throws before Pass 2 begins (Pitfall 5) |
| T-73-05 | Tampering | confirmLine on CapEx-flagged line could bypass Asset Register | mitigate | confirmLine explicitly rejects lines where `flags?.includes("capex_needs_asset_register")` with ConvexError |
| T-73-06 | Information Disclosure | Widened P72 queries now expose bank-line metadata to manager role | accept | Manager role is already trusted with expense approval, payroll, JE posting (existing v1.7 surfaces); bank-line metadata (counterparty, description) carries no stricter classification than expense receipts (D-23 rationale) |
| T-73-07 | Repudiation | Unmatch reverses a JE without preserving the original | mitigate | D-09 mandates both JEs remain in ledger; unmatch does NOT patch journalEntries.isReversed on the original; reversal JE is a NEW row with sourceType="bank_statement_reversal" + reversalJournalEntryId audit link back to bank line |
| T-73-08 | Denial of Service | Revenue Gap query scanning all bankStatementLines without index | mitigate | by_date index used for range scan (exists); added by_channel_date optional index reduces filter cost at scale |
</threat_model>

<verification>
Overall Plan 1 verification:
- `npm run test -- --run convex/bankStatements convex/bankKeywordRules` exits 0
- `npm run type-check` exits 0
- `npm run build` succeeds
- Manual spot-check: log into dev Convex dashboard, call `bankStatements.queries.getStatementProgress` with a seeded statementId + manager token → returns count object.
</verification>

<success_criteria>
- All 3 tasks meet their acceptance_criteria
- D-25 schema additions present; D-26 literal in sourceType union; by_channel_date index on bankStatementLines
- 4 reconciliation mutations + 2 queries + 1 batch-progress query + 1 rule mutation shipped
- All P72 bank queries widened from admin-only to manager+admin
- `/bank-rules` CRUD stays admin-only (regression tested)
- Wave 0 test files exist for every new behavior; all implemented tests green
- No `.todo` entries remain for manualMatch, unmatch, confirmLine, batchConfirm, getStatementProgress, getRevenueGap, createFromOverride
</success_criteria>

<output>
After completion, create `.planning/phases/73-bank-reconciliation-ui-workflow/73-01-SUMMARY.md` listing:
- Schema diff (fields added, literal added, index added)
- Mutation contracts (signature + behavior summary)
- Query contracts (signature + behavior summary)
- Test file paths + green-count
- Files modified
</output>
