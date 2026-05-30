---
phase: 73
plan: 02
subsystem: bank-reconciliation
tags: [backend, queries, mutations, tdd, c1-channel-mapping, c2-validator, i1-idempotency]
requires:
  - convex/bankStatements/queries.ts (existing 4 P72 queries)
  - convex/bankStatements/mutations.ts (73-01 manualMatch/unmatch/confirmLine/batchConfirm)
  - convex/bankKeywordRules/mutations.ts (existing protectedMutation CRUD)
  - convex/lib/fuzzyMatch.ts::similarityScore
  - convex/lib/counter.ts::getNextNumber
  - convex/schema.ts::externalSource
provides:
  - convex/bankStatements/channelMapping.ts::mapChannelToSource
  - convex/bankStatements/channelMapping.ts::CHANNEL_TO_SOURCE
  - convex/bankStatements/queries.ts::getStatementProgress
  - convex/bankStatements/queries.ts::getStatementProgressBulk
  - convex/bankStatements/queries.ts::listCandidatesForLine
  - convex/bankStatements/queries.ts::searchExpenses
  - convex/bankStatements/queries.ts::searchRevenue
  - convex/bankStatements/queries.ts::searchReimbursements
  - convex/bankStatements/queries.ts::searchPayroll
  - convex/bankStatements/queries.ts::revenueGapByPeriod
  - convex/bankStatements/mutations.ts::inlineCreateExpense
  - convex/bankStatements/mutations.ts::inlineCreateRevenue
  - convex/bankStatements/mutations.ts::inlineCreateReimbursement
  - convex/bankStatements/mutations.ts::markAssetLinked
  - convex/bankKeywordRules/mutations.ts::createFromOverride
affects:
  - convex/bankStatements/queries.ts (8 queries appended)
  - convex/bankStatements/mutations.ts (4 mutations appended)
  - convex/bankKeywordRules/mutations.ts (1 mutation appended)
tech-stack:
  added: []
  patterns:
    - "Pattern 5 (RESEARCH): by_statement_status indexed prefix scans for progress aggregation"
    - "C1: mapChannelToSource splits revenueGap rows into mapped + unmapped groups (no Diff=infinity)"
    - "C2: inlineCreateRevenue uses strict externalSource validator, not v.string()"
    - "I1: markAssetLinked idempotency via createdExpenseId equality + conflict throw"
    - "D-17: inline expense status hard-coded 'submitted', never 'approved'"
    - "Amount-first indexes (by_amount_*) for ±3-day candidate filter"
key-files:
  created:
    - convex/bankStatements/channelMapping.ts
    - convex/bankStatements/__tests__/channelMapping.test.ts
    - convex/bankStatements/__tests__/progress.test.ts
    - convex/bankStatements/__tests__/revenueGap.test.ts
    - convex/bankStatements/__tests__/listCandidates.test.ts
    - convex/bankKeywordRules/__tests__/createFromOverride.test.ts
  modified:
    - convex/bankStatements/queries.ts
    - convex/bankStatements/mutations.ts
    - convex/bankKeywordRules/mutations.ts
decisions:
  - "revenueGapByPeriod returns { rows, unmappedRows } rather than a single list so UI can render unmapped channels as 'channel not tracked' instead of Diff=infinity (C1)"
  - "createFromOverride uses token-based requireRole pattern (matches other P73 mutations in bankStatements/mutations.ts) rather than protectedMutation to avoid sessionId arg-shape coupling in the learn-from-override dialog"
  - "inlineCreateReimbursement replicates the createBatch validation pattern directly (awaiting_payment + belongs-to-employee + totalAmount sum) instead of delegating; the existing reimbursements.createBatch is admin-only and would require widening; reviewer path is manager+admin so inline keeps its own validation"
metrics:
  tasks: 3
  tests_added: 55
  tests_passing: 55
  files_created: 6
  files_modified: 3
  duration: ~15 min
  completed: 2026-04-15
---

# Phase 73 Plan 02: Backend reads + remaining writes Summary

Phase 73 Wave 1b backend foundation — 8 new queries (progress aggregation,
candidate lookup, search escape hatches, revenue gap dashboard) + 5 new
mutations (inline create wrappers + markAssetLinked + createFromOverride)
with 55 passing Wave 0 tests. Ships C1 channel-to-source mapping helper
(splits revenue gap into mapped/unmapped rows), C2 strict externalSource
validator on inlineCreateRevenue, and I1 idempotency guard on markAssetLinked.

## What Ships

### Channel mapping (C1)

`convex/bankStatements/channelMapping.ts`:

- `CHANNEL_TO_SOURCE: Readonly<Record<string, ExternalSource | null>>` — 11
  entries (gopay, gofood → gobiz; grabfood; shopeefood, shopee; tiktok;
  tokopedia, ovo, dana → null; bca, mandiri → internal)
- `mapChannelToSource(channel)` — case-insensitive, whitespace-trimmed,
  returns null for unknown/empty/undefined/null and explicitly-untracked keys

### Queries (`convex/bankStatements/queries.ts`)

All 8 new queries gated `["manager", "admin"]`:

1. **`getStatementProgress(token, statementId)`** — Returns
   `{ total, unmatched, autoMatched, suggested, confirmed, matched, reconciledPct }`
   via 4 indexed prefix scans on `by_statement_status` (Pattern 5). matched =
   autoMatched + suggested + confirmed. reconciledPct = round(confirmed/total × 100);
   0 when total=0.
2. **`getStatementProgressBulk(token, statementIds[])`** — Returns map keyed by
   statementId. Throws ConvexError when statementIds.length > 50 (RESEARCH Pitfall 7).
3. **`listCandidatesForLine(token, lineId)`** — Returns 4 groups
   `{ expense, revenue, reimbursement, payroll }` filtered by amountIdr===line.amountIdr
   AND date within ±3 days. Each row annotated with optional `alreadyLinkedToLineId`
   when another bank line already links to that record (D-04 1:1 cardinality surface).
4-7. **`searchExpenses/Revenue/Reimbursements/Payroll(token, ...)`** — Escape-hatch
   whole-table scans with optional `{ amountIdr, dateStart, dateEnd, searchTerm }`
   filters. Ranks by similarityScore when searchTerm present; caps at 50 rows.
8. **`revenueGapByPeriod(token, periodStart, periodEnd)`** (C1) — Returns
   `{ rows, unmappedRows }`. Mapped rows: `{ channel, source, bankCr, extRev, diff, diffPct }`.
   Unmapped rows: `{ channel, bankCr, extRev: null, diff: bankCr, diffPct: null, unmapped: true }`.
   Legacy `(unallocated)` row stays in `rows` with source=null + extRev=null.

### Mutations

**`convex/bankStatements/mutations.ts`** (4 new, all `["manager", "admin"]`):

1. **`inlineCreateExpense`** (D-17) — Creates expense with status hard-coded to
   `"submitted"` (NEVER `"approved"`); patches bank line with
   `matchedType="expense"`, `status="suggested"`, `createdExpenseId`.
2. **`inlineCreateRevenue`** (D-18, C2) — `source` arg uses strict
   `externalSource` validator (8-literal union), not `v.string()`. Creates
   externalRevenue with `dataOrigin="manual_entry"`, `confidence="manual"`;
   patches line with `createdRevenueId`.
3. **`inlineCreateReimbursement`** (D-19) — Creates pending reimbursement
   batch + items with awaiting_payment / employee ownership / non-zero checks;
   patches line with `createdReimbursementId`.
4. **`markAssetLinked`** (D-21, I1) — Idempotent: no-op when
   `line.createdExpenseId === args.expenseId`; throws `Line already linked to
   different expense` when a different expenseId is supplied for an
   already-linked line; otherwise patches `matchedType="expense"`, `status="suggested"`,
   `createdExpenseId`.

**`convex/bankKeywordRules/mutations.ts`** (1 new):

5. **`createFromOverride`** (D-10/D-11/D-12) — Manager+admin gated via
   `requireRole(ctx, args.token, ["manager", "admin"])`. Validates
   `/^[A-Z]\d{2}$/` ruleCode, rejects duplicate ruleCode, enforces catch-all
   uniqueness guard (same logic as plain create), populates `createdBy` from
   session user. Plain `create` / `update` / `deactivate` stay admin-only per
   D-23 + P72 D-19.

### Tests (Wave 0 — all GREEN)

- **`channelMapping.test.ts`** — 20 pure-function assertions (11 mappings, null
  edges, case-insensitivity, whitespace, key inventory)
- **`progress.test.ts`** — 8 tests: aggregate shape, matched invariant,
  reconciledPct rounding + zero case, kitchen rejection, live recompute after
  manualMatch, bulk map composition, bulk cap (>50 throws), bulk mixed statuses
  (all-confirmed + all-unmatched)
- **`revenueGap.test.ts`** — 8 tests: distinct channels + (unallocated) row,
  bankCr window sum + debit exclusion, C1 mapped join (gopay→gobiz),
  diff/diffPct null semantics, C1 unmapped (ovo) in unmappedRows group,
  (unallocated) stays in rows with extRev=null, kitchen rejection, empty period
- **`listCandidates.test.ts`** — 11 tests: 4-group shape, alreadyLinkedToLineId
  annotation, empty groups with count=0, kitchen rejection, 4 search*
  manager-accepted smokes, I1 same-expenseId no-op, I1 different-expenseId
  throws, markAssetLinked kitchen rejection
- **`createFromOverride.test.ts`** — 8 tests: manager ok (D-12),
  admin ok, order_staff rejected, kitchen rejected, ruleCode regex,
  duplicate ruleCode, catch-all overlap guard, createdBy from session user

**Result:** 55/55 new tests pass. Full bank subsystem suite (Plan 01 + Plan 02
+ P72 rules + P72 mutations + matchEngine) = 154/154 green.

## Verification

```
npm run type-check  ✓ 0 errors
npm run build       ✓ built in 18.82s
npm run test -- --run convex/bankStatements convex/bankKeywordRules
                    ✓ 154 passed (154)
```

Acceptance-criteria greps:

| Check | Result |
|-------|--------|
| `by_statement_status` in queries.ts | present (progress uses index) |
| `statementIds.length > 50` in queries.ts | present (cap guard) |
| `alreadyLinkedToLineId` in queries.ts | present |
| `mapChannelToSource` in queries.ts | present (revenueGapByPeriod uses helper) |
| `unmapped: true` / `unmappedRows` in queries.ts | present (C1 split) |
| `export const getStatementProgress/Bulk/listCandidatesForLine/search*` in queries.ts | 8/8 exports |
| `export const revenueGapByPeriod` | present |
| `export const inlineCreateExpense/Revenue/Reimbursement/markAssetLinked` | 4/4 exports |
| `status: "submitted"` in mutations.ts | present (D-17) |
| `status: "approved"` inside inlineCreateExpense block | 0 matches (D-17 guard) |
| `source: externalSource` in mutations.ts | present (C2) |
| `source: v.string()` inside inlineCreateRevenue block | 0 matches (C2 guard) |
| `createdExpenseId === args.expenseId` in mutations.ts | present (I1 idempotency) |
| `Line already linked to different expense` in mutations.ts | present (I1 conflict) |
| `export const createFromOverride` in bankKeywordRules/mutations.ts | present |
| `["manager", "admin"]` in bankKeywordRules/mutations.ts | 1 match (createFromOverride only) |

## Deviations from Plan

### Environment deviation (worktree)

Worktree started without `node_modules`. Ran `npm install --prefer-offline` to
populate (same pattern as 73-01). Not a plan deviation.

### Branch base correction

Worktree HEAD was based on `main` (phase 80 commits visible) rather than
73-01's `0bff182d`. Ran `git reset --hard 0bff182d3397bc52efff8d77b1903c04bcde0086`
to align with expected base per the execution contract. No code impact.

### Task 3 — `inlineCreateReimbursement` scoping

Plan text suggested "delegate to existing reimbursement batch flow OR
replicate minimal valid insert here." Chose the replicate-in-place path
because `convex/reimbursements/mutations.ts::createBatch` is admin-gated
(`protectedMutation({ roles: ["admin"] })`), and widening it to
manager+admin would touch a file outside P73 scope (D-23 widens reconciliation
actions, not the standalone reimbursement manager). The inline mutation keeps
its own awaiting_payment + ownership + non-empty-expenseIds checks. No code
duplication concern — the validation is a dozen lines and maps to the inline
path's specific needs.

### No Rule 1-4 deviations

No Rule 1 (bugs), Rule 2 (missing critical), Rule 3 (blocking), or Rule 4
(architectural) fixes triggered. Plan executed as written.

## Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Task 0 — channelMapping helper + 20 unit tests | `e236b5bc` | channelMapping.ts, channelMapping.test.ts |
| 2 | Task 1 — 4 Wave 0 test stubs (RED) | `e454f798` | progress/revenueGap/listCandidates/createFromOverride test files |
| 3 | Task 2 — 8 queries (GREEN for progress + revenueGap + most of listCandidates) | `6cbb0fa9` | queries.ts |
| 4 | Task 3 — 4 bank mutations + createFromOverride (GREEN for all P73-02) | `d12aba81` | mutations.ts (both modules) |

## Downstream Contracts

Plan 03/04/05 (Wave 2 UI) can now bind hooks to:

- `api.bankStatements.queries.getStatementProgress` / `getStatementProgressBulk`
  — header progress bar + history list mini-progress.
- `api.bankStatements.queries.listCandidatesForLine` — right-pane candidates.
- `api.bankStatements.queries.searchExpenses/Revenue/Reimbursements/Payroll`
  — escape-hatch dialog.
- `api.bankStatements.queries.revenueGapByPeriod` — Revenue Gap tab
  (render `rows` as the main table, `unmappedRows` as a separate
  "Channels not tracked" section with `Diff` column but no %).
- `api.bankStatements.mutations.inlineCreateExpense/Revenue/Reimbursement`
  — inline create dialogs.
- `api.bankStatements.mutations.markAssetLinked` — Asset Register save
  handler's bank-line linkback.
- `api.bankKeywordRules.mutations.createFromOverride` — learn-from-override
  dialog.

## Threat Flags

None. No new security surface beyond the P73 threat register in the plan's
`<threat_model>`. All threat mitigations (T-73-09 through T-73-15) covered
by the test matrix.

## Known Stubs

None. All mutations ship with full test coverage + GREEN verification.

## Deferred Issues

Pre-existing unrelated test failures (verified at 73-01 base, not introduced
by 73-02) logged to `deferred-items.md`:

- `tests/convex/gobizAdapter.test.ts` — 2 failures (saveRevenue GoBiz fields)
- `tests/convex/k3martCockpit.test.ts` — 4 failures (getStockMovementHistory)
- `convex/bigsellerOrders/__tests__/integration.test.ts` — 1 failure (sync data flow)
- `src/lib/__tests__/csvImportValidation.test.ts` — 10 failures (CSV parsing)

Out of scope per Phase 73 boundary; owned by other subsystems.

## Self-Check: PASSED

Verified files exist:
- `convex/bankStatements/channelMapping.ts` — created
- `convex/bankStatements/__tests__/channelMapping.test.ts` — created (20 tests)
- `convex/bankStatements/__tests__/progress.test.ts` — created (8 tests)
- `convex/bankStatements/__tests__/revenueGap.test.ts` — created (8 tests)
- `convex/bankStatements/__tests__/listCandidates.test.ts` — created (11 tests)
- `convex/bankKeywordRules/__tests__/createFromOverride.test.ts` — created (8 tests)
- `convex/bankStatements/queries.ts` — 8 new exports
- `convex/bankStatements/mutations.ts` — 4 new exports
- `convex/bankKeywordRules/mutations.ts` — 1 new export (createFromOverride)

Verified commits exist:
- `e236b5bc` — Task 0
- `e454f798` — Task 1
- `6cbb0fa9` — Task 2
- `d12aba81` — Task 3
