---
phase: 73-bank-reconciliation-ui-workflow
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 54
files_reviewed_list:
  - CLAUDE.md
  - convex/bankKeywordRules/__tests__/createFromOverride.test.ts
  - convex/bankKeywordRules/mutations.ts
  - convex/bankStatements/__tests__/batchConfirm.test.ts
  - convex/bankStatements/__tests__/channelMapping.test.ts
  - convex/bankStatements/__tests__/confirmLine.test.ts
  - convex/bankStatements/__tests__/listCandidates.test.ts
  - convex/bankStatements/__tests__/manualMatch.test.ts
  - convex/bankStatements/__tests__/progress.test.ts
  - convex/bankStatements/__tests__/reconcileHelpers.ts
  - convex/bankStatements/__tests__/revenueGap.test.ts
  - convex/bankStatements/__tests__/unmatch.test.ts
  - convex/bankStatements/channelMapping.ts
  - convex/bankStatements/mutations.ts
  - convex/bankStatements/queries.ts
  - convex/fixedAssets/mutations.ts
  - convex/lib/journalEngine.ts
  - convex/schema.ts
  - docs/API_REFERENCE.md
  - docs/CHANGELOG.md
  - docs/SCHEMA.md
  - src/App.tsx
  - src/components/assets/CreateAssetDialog.tsx
  - src/components/bankReconciliation/BankLineRow.tsx
  - src/components/bankReconciliation/BankLinesPane.tsx
  - src/components/bankReconciliation/BankReconciliationTabs.tsx
  - src/components/bankReconciliation/BatchConfirmDialog.tsx
  - src/components/bankReconciliation/CandidateGroup.tsx
  - src/components/bankReconciliation/CandidateRow.tsx
  - src/components/bankReconciliation/CandidatesPane.tsx
  - src/components/bankReconciliation/ConfidenceBadge.tsx
  - src/components/bankReconciliation/InlineExpenseDialog.tsx
  - src/components/bankReconciliation/InlineReimbursementDialog.tsx
  - src/components/bankReconciliation/InlineRevenueDialog.tsx
  - src/components/bankReconciliation/LearnFromOverrideDialog.tsx
  - src/components/bankReconciliation/ReconciliationActionBar.tsx
  - src/components/bankReconciliation/RevenueGapTab.tsx
  - src/components/bankReconciliation/ReversedIndicator.tsx
  - src/components/bankReconciliation/SearchAllRecordsDialog.tsx
  - src/components/bankReconciliation/SplitViewWorkspace.tsx
  - src/components/bankReconciliation/StatementHistoryList.tsx
  - src/components/bankReconciliation/StatementProgressHeader.tsx
  - src/components/bankReconciliation/__tests__/ReconciliationActionBar.test.tsx
  - src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx
  - src/components/bankReconciliation/__tests__/StatementProgressHeader.test.tsx
  - src/components/expense/ExpenseSubmitForm.tsx
  - src/components/layout/Header.tsx
  - src/hooks/convex/useBankReconciliation.ts
  - src/pages/AssetRegister.tsx
  - src/pages/BankReconciliationPage.tsx
  - src/pages/ExpenseSubmit.tsx
  - tests/e2e/bank-reconciliation-batch-confirm.spec.ts
  - tests/e2e/bank-reconciliation-capex-roundtrip.spec.ts
  - tests/e2e/bank-reconciliation-inline-expense.spec.ts
  - tests/e2e/bank-reconciliation-split-view.spec.ts
  - tests/e2e/bank-rules-learn-from-override.spec.ts
  - tests/e2e/bank-rules-perms.spec.ts
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 73: Code Review Report

**Reviewed:** 2026-04-15
**Depth:** standard
**Files Reviewed:** 54
**Status:** issues_found

## Summary

Phase 73 delivers the Bank Reconciliation UI workflow end-to-end: split-view Review tab, candidate list, inline record-creation dialogs (expense/revenue/reimbursement), learn-from-override rule-creation dialog, batch-confirm preview, Revenue Gap tab with channel/period drill-down, CapEx round-trip to Asset Register, and a suite of Convex mutations/queries with matching vitest + e2e coverage.

Overall quality is high: D-23 role widening (manager+admin for statements/lines; admin-only for rule CRUD) is correctly enforced; D-25 1:1 cardinality is guarded twice (pre-check + post-write TOCTOU re-query); D-26 reversal uses `createJournalEntryWithLines` directly with `sourceType: "bank_statement_reversal"` and `date: original.date` (JE-03), bypassing the `NON_REVERSIBLE_TYPES` guard as designed. The channel→source mapping (C1) and strict `externalSource` validator on `inlineCreateRevenue` (C2) both lock the backend against invalid unions. React hook ordering follows Pitfall 9 throughout (all hooks declared before any conditional return).

One critical issue: `BatchConfirmDialog`'s balance gate is mathematically degenerate — it double-counts every line's amount into both DR and CR sums, so `balanced === true` is a tautology and no real imbalance can ever block posting. Server-side `validateJournalLines` is still the real backstop, so this is a UI-signal bug (not a data-integrity bug), but the dialog promises a safety gate it does not actually provide. Several warnings cover: `inlineCreateReimbursement` calling `requireRole` twice (minor auth cost/redundancy), `manualMatch` polymorphic Id cast bypassing target-type verification, the D-21 CapEx round-trip creating an `approved` expense (`status: "recorded"`) that collides with the D-17 invariant document ("inline-created expenses MUST have status=submitted"), and a TOCTOU window in `markAssetLinked`. Info items cover UX polish and small duplication.

## Critical Issues

### CR-01: BatchConfirmDialog balance gate is a tautology — cannot block imbalanced posts

**File:** `src/components/bankReconciliation/BatchConfirmDialog.tsx:79-120`
**Issue:** Inside the `useMemo` that computes `{ totalDR, totalCR, balanced }`, each postable line unconditionally adds `line.amountIdr` to BOTH `drSum` AND `crSum`:

```ts
// For balance gate: DR and CR equal per line (amountIdr each) — but
// aggregate may still diverge if accounts overlap by contra sign.
// For Phase 73 simple balance: sum all debits vs credits.
drSum += line.amountIdr;
crSum += line.amountIdr;
```

Because the two sums are incremented by identical values on every iteration, `totalDR === totalCR` is mathematically guaranteed for any non-empty input. Consequently `balanced` is always `true` (when `totalLines > 0`), the destructive "Ledger imbalance detected" Alert block is unreachable, and the `Post` button's `!balanced` disable clause is dead code.

The D-08 invariant that this dialog advertises ("if aggregate DR ≠ aggregate CR, the Post button is disabled and a destructive Alert explains the imbalance") is therefore unenforced at the UI layer. The server-side `createJournalEntryWithLines` still re-validates per-JE balance, so the database is safe, but the reviewer sees a false "balanced" signal in the preview.

**Fix:** Sum DR and CR against distinct accumulators that actually reflect the posted lines — each line posts one debit line and one credit line to _different_ accounts, so the aggregate can legitimately be imbalanced only if a pair of groups references the same account with opposite signs. The honest computation aggregates per-account net position:

```ts
// Accumulate per-account net (debit positive, credit negative). After the
// loop, sum of positives = aggregate DR, sum of |negatives| = aggregate CR.
const netByAccount = new Map<string, number>();
for (const line of exactTierLines) {
  if (!line.jeDebitAccountId || !line.jeCreditAccountId) {
    skippedCount += 1;
    continue;
  }
  const drKey = String(line.jeDebitAccountId);
  const crKey = String(line.jeCreditAccountId);
  netByAccount.set(drKey, (netByAccount.get(drKey) ?? 0) + line.amountIdr);
  netByAccount.set(crKey, (netByAccount.get(crKey) ?? 0) - line.amountIdr);
  // (group map unchanged)
}
let drSum = 0;
let crSum = 0;
for (const net of netByAccount.values()) {
  if (net > 0) drSum += net;
  else if (net < 0) crSum += -net;
}
```

Alternative (simpler, matches the comment's original intent): drop the aggregate balance gate entirely and rely on server-side per-JE validation. Remove `totalDR`/`totalCR`/`balanced` state, the destructive Alert, and the `!balanced` clause from the Post button's disable. Keep the "Grand Total" lines but label them as "Amount posted" rather than DR/CR.

## Warnings

### WR-01: D-21 CapEx round-trip creates `status: "recorded"` expense — contradicts D-17 invariant prominently documented in the dialog path

**File:** `convex/fixedAssets/mutations.ts:197-222`
**Issue:** When `sourceBankLineId` is supplied to `fixedAssets:create`, the code inserts a companion expense with `status: "recorded" as const` and populates `approvedBy: ctx.user._id` + `approvedAt: Date.now()`. This short-circuits the standard approval queue.

The inline-comment explicitly acknowledges the drift from D-17: "The expense is recorded+approved inline since admins/managers with fixedAssets.create access have equivalent authority." However, `convex/bankStatements/mutations.ts:576` (`inlineCreateExpense`) ships the opposite invariant in a large ALL-CAPS comment block — "CRITICAL: status is hard-coded to `submitted`, NEVER `approved`. The reviewer matching the bank statement is often not the person who incurred the expense". Both paths are bank-line → expense creation performed by a manager/admin; both should apply the same reviewer-separation rule, or D-17 needs an explicit carve-out.

The risk is an auditability regression: CapEx expenses created via the round-trip bypass the Expense Approval queue entirely, meaning no second-reviewer signoff on equipment purchases specifically — the one category where material amounts are most likely.

**Fix:** Either (a) downgrade the CapEx expense to `status: "submitted"` and rely on the existing approval queue to confirm, matching D-17; or (b) document a formal D-17 exemption in the phase context and update the `inlineCreateExpense` comment to reflect that asset-linked expenses have a different rule. Recommend (a):

```ts
linkedExpenseId = await ctx.db.insert("expenses", {
  // ...
  status: "submitted" as const,
  lateSubmission: false,
  submittedAt: Date.now(),
  // Drop approvedBy / approvedAt / journalEntryId — let the approval queue
  // own the JE transition.
  convertedToAssetId: assetId,
  createdAt: Date.now(),
});
```

If (a) is taken, the acquisition JE must still be posted immediately for the asset (asset must be usable), but the companion expense stays in the approval queue as a tracking record only. That is consistent with D-17.

### WR-02: `manualMatch` polymorphic cast skips target-type cross-verification

**File:** `convex/bankStatements/mutations.ts:297-302`
**Issue:** The mutation accepts `matchedType` as one of four literals and `matchedId: v.string()`, then does:

```ts
const target = await ctx.db.get(args.matchedId as Id<"expenses">);
if (!target) {
  throw new ConvexError(`Target ${args.matchedType} record not found`);
}
```

`ctx.db.get` accepts any valid Convex id at runtime, so a caller can pass `matchedType: "expense"` with `matchedId` pointing at a `reimbursementBatches` doc — the `get` succeeds and the mutation patches the bank line with `matchedType: "expense"` referencing a reimbursement. Downstream `listCandidatesForLine`'s `alreadyLinkedToLineId` annotation and `unmatch`'s reversal path both filter by the wrong type, and the Ledger effects (if later confirmed) have no protection from the wrong GL account chain.

**Fix:** After `ctx.db.get`, verify the target's table matches `matchedType`. Convex Ids encode the table name, so cross-check via a type-specific fetch:

```ts
const lookup = {
  expense: () => ctx.db.get(args.matchedId as Id<"expenses">),
  revenue: () => ctx.db.get(args.matchedId as Id<"externalRevenue">),
  reimbursement: () => ctx.db.get(args.matchedId as Id<"reimbursementBatches">),
  payroll: () => ctx.db.get(args.matchedId as Id<"payrollEntries">),
}[args.matchedType];
const target = await lookup();
if (!target) throw new ConvexError(`Target ${args.matchedType} record not found`);
```

Even better: switch `matchedId` to the specific `v.id(...)` validator in a discriminated union. Convex validators support `v.union(v.object({ matchedType: v.literal("expense"), matchedId: v.id("expenses") }), ...)` — that forces the type-id coupling at the boundary and eliminates the cast.

### WR-03: `inlineCreateReimbursement` calls `requireRole` twice

**File:** `convex/bankStatements/mutations.ts:702, 736`
**Issue:** The handler calls `requireRole(ctx, args.token, ["manager", "admin"])` once at the top to gate access, then again 34 lines later to capture `user._id` for `createdBy`. The second call re-runs the session lookup and role check against the database — both small queries, but redundant.

```ts
await requireRole(ctx, args.token, ["manager", "admin"]); // line 702

// ... 30 lines later ...

const batchNumber = await getNextNumber(ctx, "RMB");
const user = await requireRole(ctx, args.token, ["manager", "admin"]); // line 736
```

Beyond the duplicated work, this invites a subtle bug if someone later tweaks the first call (e.g. widens roles) without updating the second.

**Fix:** Capture the user on the first call:

```ts
const user = await requireRole(ctx, args.token, ["manager", "admin"]);
// ...
const batchId = await ctx.db.insert("reimbursementBatches", {
  // ...
  createdBy: user._id,
  // ...
});
```

### WR-04: `markAssetLinked` TOCTOU window — idempotency guard evaluated without re-read

**File:** `convex/bankStatements/mutations.ts:783-802`
**Issue:** The idempotency guard reads `line.createdExpenseId` once, decides the branch (no-op / throw / patch), then patches without re-reading. Two concurrent `markAssetLinked` calls with different `expenseId` values against the same line can both see `createdExpenseId === undefined`, both fall through to the patch branch, and the last writer wins silently.

The consequence is a bank line linked to expense B while the caller of the losing call believes it linked to expense A. In production the CapEx round-trip path only runs once per asset creation, but the mutation is exposed as a public hook (`useMarkAssetLinked`) so nothing prevents the UI from firing it twice.

**Fix:** Mirror the pattern used in `manualMatch`: re-read after patch and throw on inconsistency.

```ts
await ctx.db.patch(args.bankLineId, {
  // ...
  createdExpenseId: args.expenseId,
});
const after = await ctx.db.get(args.bankLineId);
if (after?.createdExpenseId !== args.expenseId) {
  throw new ConvexError("Concurrent asset-link detected; retry");
}
```

Since Convex mutations are atomic on throw, the patch rolls back and the caller retries. Alternatively, tighten the invariant so the patch is a no-op if `createdExpenseId` was set between read and write (add a conditional `v.eq` check — not yet a first-class Convex primitive, so the re-read is the practical solution).

### WR-05: `InlineReimbursementDialog` uses a free-text `employeeUserId` input accepting raw ID strings

**File:** `src/components/bankReconciliation/InlineReimbursementDialog.tsx:45, 130-138, 77`
**Issue:** The dialog asks the reviewer to paste a user ID (`users/...`) and a whitespace/comma list of expense IDs into plain `<Input>` fields, then casts them with `as Id<"users">` / `as Id<"expenses">[]`. If the reviewer fat-fingers an ID, the mutation fails server-side with a cryptic "not found" error instead of the dialog catching it; worse, if the string is a valid Convex ID for the wrong table, `ctx.db.get` will still accept it and return `null`, masking the misuse.

This is consistent with the dialog's documented "minimum viable" scope, but it is a UX hazard in a finance tool. Managers who aren't engineers will not know how to retrieve these IDs.

**Fix:** Replace both inputs with pickers backed by existing queries:
- Employee: a `<Select>` / combobox over `users` (filter `isActive: true`) — display name + role, store `_id`.
- Expenses: multi-select from the existing `reimbursements:listAwaitingPaymentByEmployee` (or equivalent) scoped to the chosen employee, auto-filtered to `status: "awaiting_payment"`.

If that broadens scope beyond Phase 73, at minimum add a helper "Copy user ID" affordance in Users Manager and Expense Approval, and validate the pasted strings against a `users/` / `expenses/` prefix regex before submit.

### WR-06: `RevenueGapTab` ignores `custom` period when drilling down — silently narrows to no filter

**File:** `src/components/bankReconciliation/RevenueGapTab.tsx:216-224`
**Issue:** When the user picks a custom date range and clicks a row, `handleRowClick` intentionally omits `&period=...` because the YYYY-MM key doesn't fit a custom range:

```ts
const periodParam = period.custom ? "" : `&period=${period.key}`;
// ...
navigate(`/bank-reconciliation?tab=review&channelFilter=${channelParam}${periodParam}`);
```

`BankLinesPane` then applies only `channelFilter`, dropping the date bounds silently. From the reviewer's perspective, they drilled from a custom-range row into the Review tab and now see bank lines from _all_ imported statements matching the channel, not the 7-day (or whatever) window they selected. No UI indication explains the scope change.

**Fix:** Pass both endpoints explicitly when custom:

```ts
const periodParam = period.custom
  ? `&periodStart=${period.start}&periodEnd=${period.end}`
  : `&period=${period.key}`;
```

Then extend `BankLinesPane`'s `periodBoundsFromKey` to also read `periodStart`/`periodEnd` query params and honor them. The active-filter chip should display the custom range label (`"Nov 1 - Nov 15 2025"`) rather than a YYYY-MM string.

## Info

### IN-01: `inlineCreateRevenue` does not clamp period fields to `transactionDate` when one endpoint is omitted

**File:** `convex/bankStatements/mutations.ts:664-672`
**Issue:** If the caller passes `periodStart` but omits `periodEnd` (or vice versa), the handler falls back to `transactionDate` for the missing endpoint but does not validate the pair — so `periodEnd < periodStart` is silently accepted. Not a security issue, but creates inconsistent data.

**Fix:** Either make the two fields mandatory-together at the validator (`v.optional(v.object({ start, end }))`) or add `if (args.periodStart !== undefined && args.periodEnd !== undefined && args.periodEnd < args.periodStart) throw ...` up front. Consider also calling the existing `collapseRevenuePeriod` helper that MEMORY.md notes is the canonical way to build externalRevenue period fields.

### IN-02: `SearchAllRecordsDialog` accepts negative amount filter silently

**File:** `src/components/bankReconciliation/SearchAllRecordsDialog.tsx:59-60`
**Issue:** `amountNum > 0` filters positive amounts but a negative numeric entry flips to `undefined` without feedback — the reviewer sees "no results" rather than "amount must be positive." The `<Input type="number">` doesn't enforce a `min` attribute.

**Fix:** Add `min={0}` to the Input and toast-error on negative input, matching the style used in `InlineRevenueDialog` for the gross amount field.

### IN-03: `LearnFromOverrideDialog` extracts descriptionPatterns via a 4-letter heuristic that may produce stop-words

**File:** `src/components/bankReconciliation/LearnFromOverrideDialog.tsx:58-64`
**Issue:** `extractKeywords` picks the 3 longest words ≥4 chars from the raw description. BCA descriptions routinely contain artifacts like "TRSF", "TRANSFER", "BIAYA", "GOPAY" — the heuristic may surface the noise ("TRANSFER") rather than the signal ("GOPAY") depending on length. The reviewer can edit the chips before saving, but the default is misleading for Indonesian bank formats.

**Fix:** Add a small stop-word list tuned to BCA columns (`TRSF`, `TRANSFER`, `BIAYA`, `KREDIT`, `DEBET`, `TANGGAL`, etc.) and filter before the length sort. Alternatively, prefer the `parsedCounterparty` field (already normalized by the parser) as the primary description pattern source when it is set.

### IN-04: `ReversedIndicator` tooltip renders raw Convex ID

**File:** `src/components/bankReconciliation/ReversedIndicator.tsx:27`
**Issue:** Tooltip text includes `Reversal journal entry id: ${reversalJournalEntryId}` — a Convex document ID string. Useful for debugging, not useful for a finance user. The JE number (`JE-MMDD-NNN`) would be the audit reference.

**Fix:** Accept `reversalJournalEntryNumber?: string` as an optional prop; render the number when supplied and fall back to the last 6 chars of the ID only if the number isn't available. Update `BankLineRow` to fetch and pass the number (one extra `useQuery` on `journalEntries` by id for reversed lines, or denormalize the number onto `bankStatementLines` on patch).

### IN-05: Unused `CandidateRow` import in `CandidatesPane`

**File:** `src/components/bankReconciliation/CandidatesPane.tsx:19`
**Issue:** `CandidateRow` is imported from `./CandidateRow` alongside `type MatchedType`, but the symbol itself is not referenced in the JSX — rows are rendered via `<CandidateGroup>` which internally receives children from the `.map((row) => <CandidateRow .../>)` expression... actually the map call in `CandidatesPane` at line 137 does use `CandidateRow`. Scratch — import is used. Ignore this item.

Actual Info item: `useNavigate` is imported in `InlineReimbursementDialog` and used, which is fine, but the dialog renders a `<Link>`-equivalent button that navigates imperatively rather than using `<Link>` — minor inconsistency with the rest of the codebase (`BankReconciliationPage` uses `<Link>` / `setSearchParams` consistently).

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
