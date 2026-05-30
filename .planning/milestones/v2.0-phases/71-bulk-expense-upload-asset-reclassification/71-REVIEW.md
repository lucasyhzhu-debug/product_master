---
phase: 71-bulk-expense-upload-asset-reclassification
reviewed: 2026-04-11T12:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - convex/expenses/bulkMutations.ts
  - convex/expenses/mutations.ts
  - convex/fixedAssets/helpers.ts
  - convex/fixedAssets/mutations.ts
  - convex/lib/accountUtils.ts
  - convex/schema.ts
  - src/components/assets/AssetDetailPanel.tsx
  - src/components/assets/DisposeAssetDialog.tsx
  - src/components/import/EditableCell.tsx
  - src/components/shared/SearchableSelect.tsx
  - src/hooks/convex/useFixedAssets.ts
  - src/hooks/convex/useJournalImport.ts
  - src/lib/csvImportValidation.ts
  - src/pages/HistoricalImportPage.tsx
findings:
  critical: 1
  warning: 5
  info: 2
  total: 8
status: issues_found
---

# Phase 71: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 71 introduces bulk expense CSV import with an Airtable-style editable preview table, trust-mode branching for admin auto-approval, and asset reclassification to expense via the DisposeAssetDialog. The code is well-structured: mutations are properly auth-gated, JE accounting is balanced, the CSV parser has thorough per-cell validation, and the editable preview table handles re-validation on every cell save.

Key concerns: one critical data integrity issue (full table scan in bulkMutations for duplicate detection), one data loss bug (receiptUrl accepted but never persisted), and several defensive-coding gaps around NBV edge cases and reclassification account indexing.

## Critical Issues

### CR-01: Full table scan of expenses in bulkMutations for duplicate detection

**File:** `convex/expenses/bulkMutations.ts:77`
**Issue:** The mutation loads *every* expense in the entire database via `ctx.db.query("expenses").collect()` for soft duplicate detection. As the expense table grows, this will hit Convex read limits and degrade performance. Unlike the single-expense `createDraft` which filters by submitter index (`by_submitter_status`), the bulk mutation scans all expenses regardless of submitter. With 50 rows per batch, this is compounded by the intra-batch accumulation pattern (line 123) which is good, but the initial full scan is the bottleneck.

**Fix:** Use the same indexed query pattern as `createDraft` in `mutations.ts`. Since bulk import rows may have different submitters, group rows by `submitterId` and query per-submitter:
```typescript
// Group rows by submitterId for targeted duplicate checks
const submitterIds = [...new Set(args.rows.map(r => r.submitterId))];
const expensesBySubmitter = new Map<string, typeof expenseContext>();
for (const sid of submitterIds) {
  const userExpenses = await ctx.db
    .query("expenses")
    .withIndex("by_submitter_status", (q) => q.eq("submittedBy", sid))
    .collect();
  expensesBySubmitter.set(sid as string, userExpenses.map(e => ({
    amount: e.amount,
    expenseDate: e.expenseDate,
    expenseNumber: e.expenseNumber,
  })));
}
```
Alternatively, if all rows typically share the same submitter, a simpler fix is to use the `by_amount_date_submitter` index for targeted lookups.

## Warnings

### WR-01: receiptUrl accepted in bulkMutations args but never persisted

**File:** `convex/expenses/bulkMutations.ts:51` and `convex/expenses/bulkMutations.ts:104-120`
**Issue:** The mutation validator accepts `receiptUrl: v.optional(v.string())` in row args, and the frontend sends it from the CSV (line 448 of HistoricalImportPage), but the handler never stores it on the expense record. The expense schema has `receiptFileId` (storage ref) not `receiptUrl` (string). Users who include receipt URLs in their CSV will see them in the preview table but the data is silently dropped on import.

**Fix:** Either (a) store the URL in a new optional field on the expenses schema (e.g., `externalReceiptUrl: v.optional(v.string())`), or (b) remove `receiptUrl` from the mutation args and the CSV template to avoid misleading users, or (c) add the URL to the expense description:
```typescript
// Option (b) - cleanest: remove from validator
// In bulkMutations.ts args, delete the receiptUrl field
// In HistoricalImportPage.tsx, don't send receiptUrl in batchRows
```

### WR-02: Reclassification allows NBV=0 assets to be disposed without expense

**File:** `convex/fixedAssets/mutations.ts:403-406`
**Issue:** The reclassify_to_expense branch correctly blocks `nbv <= 0`, but a fully depreciated asset with `status: "fully_depreciated"` can still reach the reclassify_to_expense path (line 388 only blocks `status === "disposed"`). If NBV is exactly 0, the ConvexError fires, which is correct. However, if `accumulatedDepreciation > cost` due to a rounding edge case (unlikely but possible with manual void/re-run), `nbv` would be negative and the block still fires. This is fine defensively, but the error message "Net Book Value must be positive" could confuse admins for fully-depreciated assets -- they might not understand why reclassification is blocked.

**Fix:** Improve the error message to be more informative:
```typescript
if (nbv <= 0) {
  throw new ConvexError(
    `Cannot reclassify: Net Book Value is ${formatCurrency(nbv)} (fully depreciated or over-depreciated). Only assets with positive NBV can be reclassified to expense.`
  );
}
```

### WR-03: Reclassification GL account resolution uses dynamic array indexing

**File:** `convex/fixedAssets/mutations.ts:421-431`
**Issue:** The code builds `codesToResolve` dynamically and then uses a mutable `idx` counter to unpack `resolvedAccounts`. This is fragile -- if the conditional branches change (e.g., `glAccumCode` push order changes), the index mapping silently breaks, causing the wrong GL account to be debited/credited. This is a data integrity risk.

**Fix:** Use named parallel resolution instead of positional indexing:
```typescript
const [fixedAssetAccount, targetExpenseAccount, accumAccountResult] = await Promise.all([
  resolveAccount(ctx, assetAccountCode),
  args.targetExpenseAccountId
    ? Promise.resolve({ _id: args.targetExpenseAccountId })
    : resolveAccount(ctx, getReclassificationExpenseCode(asset.category)),
  cat?.glAccumCode
    ? resolveAccount(ctx, cat.glAccumCode)
    : Promise.resolve(null),
]);
const targetExpenseAccountId = targetExpenseAccount._id;
const accumAccount = accumAccountResult;
```

### WR-04: DisposeAssetDialog does not reset state when asset prop changes

**File:** `src/components/assets/DisposeAssetDialog.tsx:67-74`
**Issue:** The `disposalType`, `disposalDate`, `saleProceeds`, `targetAccountId`, and `submitterId` states are initialized once and never reset when the `asset` prop changes. If the dialog is opened for asset A, partially filled, closed, then opened for asset B, the stale state from asset A persists. The `useEffect` on line 105 only auto-maps `targetAccountId` when `disposalType === "reclassify_to_expense"` -- it does not clear other fields.

**Fix:** Add a reset effect keyed on asset identity:
```typescript
useEffect(() => {
  setDisposalType("scrapped");
  setDisposalDate("");
  setSaleProceeds("0");
  setTargetAccountId(null);
  setSubmitterId(null);
}, [asset._id]);
```

### WR-05: Bulk import retry-from-failure may create duplicate expenses

**File:** `src/pages/HistoricalImportPage.tsx:416-494`
**Issue:** When a batch fails mid-import and the user clicks "Retry from failed batch", the retry resends the exact same batch that failed. If the failure occurred *after* the backend committed the mutation but *before* the frontend received the response (network timeout, Convex edge case), the retry will create duplicate expense records. The `importBatchId` is shared across batches but is not used as an idempotency key on the backend -- `bulkCreateExpenses` does not check if rows with that `importBatchId` already exist for the same batch index.

**Fix:** Add server-side idempotency checking at the start of `bulkCreateExpenses`:
```typescript
// In bulkCreateExpenses handler, check for existing batch rows
const existingBatchExpenses = await ctx.db
  .query("expenses")
  .filter((q) => q.eq(q.field("importBatchId"), args.importBatchId))
  .collect();
// If rows already exist for this batchId, return early with count
if (existingBatchExpenses.length > 0) {
  // Could also accept a batchIndex arg for finer-grained dedup
  return { created: existingBatchExpenses.length, autoApproved: 0, submitted: 0 };
}
```
Note: This requires an index on `importBatchId` for efficiency, or passing a batch-specific sub-ID.

## Info

### IN-01: CATEGORY_DEFAULT_EXPENSE_CODE duplicated between frontend and backend

**File:** `src/components/assets/DisposeAssetDialog.tsx:38-50` and `convex/fixedAssets/helpers.ts:79-91`
**Issue:** The `CATEGORY_DEFAULT_EXPENSE_CODE` map in the dialog component is a manual copy of `CATEGORY_TO_EXPENSE_ACCOUNT` from the backend helpers. The comment on line 37 says "keep in sync" but there is no mechanism to enforce this. If the backend map changes, the frontend will auto-map to the wrong default account in the dropdown.

**Fix:** Consider exporting a shared constant from a `convex/fixedAssets/helpers.ts` file that can be imported by both backend and frontend (Convex supports this for pure helper files), or accept the duplication with a link to the source of truth.

### IN-02: EditableCell Tab key saves but does not prevent default navigation

**File:** `src/components/import/EditableCell.tsx:90-93`
**Issue:** On Tab keydown, `onSave(localValue)` is called but `e.preventDefault()` is not called, allowing the browser's default Tab behavior to proceed. This is intentional (comment says "Let Tab propagate naturally but save"), but it means the blur handler on line 96-98 will also fire after the Tab navigation, causing a double-save of the same value. While harmless (same value saved twice), it triggers two state updates in the parent.

**Fix:** Either call `e.preventDefault()` on Tab and manage focus manually, or add a guard in `handleBlur` to skip if save was already triggered:
```typescript
const savedRef = useRef(false);
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "Tab") {
    savedRef.current = true;
    onSave(localValue);
  }
  // ...
};
const handleBlur = () => {
  if (!savedRef.current) onSave(localValue);
  savedRef.current = false;
};
```

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
