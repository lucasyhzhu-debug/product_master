# Staff Review: Phase 71 — Bulk Expense Upload & Asset Reclassification

**Date:** 2026-04-11
**Reviewer:** Staff Review (Senior Engineer + Principal Engineer perspective)
**Plans Reviewed:** 71-01, 71-02, 71-03, 71-04
**Branch:** `gsd/phase-71-bulk-expense-upload-asset-reclassification`

---

## Overall Assessment

**REVISE** — Plans are well-structured and architecturally sound. Two critical issues must be fixed before execution: a circular import that will fail in production, and an `accounts.queries.listActive` query path that does not exist. Eight additional improvements range from a data integrity gap to minor pattern inconsistencies.

---

## Plan Structure Validation

All four plans pass the mandatory four-section check: Git workflow, implementation waves, documentation updates, and success criteria are all present. TDD behavior specs in 71-01 are notably thorough. Wave/dependency ordering is correct: 01 has no dependencies, 02 depends on 01, 03 and 04 both depend on 01 (and 03 also depends on 02). The autonomous flag is correctly set to `false` for 03 and 04 (human verification gates).

---

## Critical Issues (Must Fix Before Execution)

### C-01: Circular import — `bulkMutations.ts` imports from `fixedAssets/mutations.ts`

**Plan:** 71-01, Task 1 import list

The plan instructs `convex/expenses/bulkMutations.ts` to import `resolveAccount` from `convex/fixedAssets/mutations.ts`:

```typescript
import { resolveAccount } from "../fixedAssets/mutations";
```

`resolveAccount` is currently defined as an exported function inside `convex/fixedAssets/mutations.ts`. That file in turn imports from `convex/journalImport/mutations.ts` (which imports `getNextAssetNumber` from `convex/fixedAssets/mutations.ts`). More directly: Task 2 of the same plan adds imports from `convex/expenses/auditTrail.ts` and `convex/lib/counter.ts` into `fixedAssets/mutations.ts`, while `bulkMutations.ts` imports from `fixedAssets/mutations.ts`. This creates a potential cross-module dependency between the two sibling expense files via fixedAssets.

The real fix is simple: `resolveAccount` is a generic GL account resolver that belongs in `convex/lib/` or `convex/accounts/`, not in `fixedAssets/mutations.ts`. Both plans can then import it from a neutral location without coupling.

**Fix:** Move `resolveAccount` to `convex/lib/accountUtils.ts` (or `convex/accounts/helpers.ts`) and update the existing import in `fixedAssets/mutations.ts`. Both `bulkMutations.ts` and `fixedAssets/mutations.ts` then import from the shared location. This is a one-function extraction — low risk, high impact.

---

### C-02: Non-existent query path `api.accounts.queries.listActive`

**Plan:** 71-04, Task 1, Step 2

The dialog is instructed to query:

```typescript
const accounts = useQuery(api.accounts.queries.listActive);
```

This query does not exist. The actual API path (confirmed in `src/pages/HistoricalImportPage.tsx` line 143 and `convex/accounts/queries.ts`) is:

```typescript
const accounts = useQuery(api.accounts.queries.list, { activeOnly: true });
```

Using the wrong path will cause the accounts query to fail silently (Convex returns `undefined`) and the expense account dropdown will never populate. This is a blocking bug.

**Fix in 71-04:** Replace both references:
```typescript
// Wrong
const accounts = useQuery(api.accounts.queries.listActive);

// Correct
const accounts = useQuery(api.accounts.queries.list, { activeOnly: true });
```

The same issue may surface in 71-03 (`HistoricalImportPage.tsx`) if the executor follows the same pattern. The existing file already uses the correct path — the executor should mirror it directly from the existing code, not from the plan's pseudocode.

---

## Improvements (Should Fix)

### I-01: `bulkCreateExpenses` skips duplicate detection — silent data integrity risk

**Plan:** 71-01, Task 1

The existing single-expense flow in `convex/expenses/mutations.ts` calls `checkDuplicateExpense` against recent expenses and sets `duplicateWarning` on the record. The `bulkCreateExpenses` handler described in 71-01 never calls `checkDuplicateExpense`.

For a bulk import of 50 historical rows this is higher risk than single-entry, not lower — users uploading months of backdated expenses are the most likely to accidentally duplicate rows they already manually entered.

**Fix:** After inserting each expense, call `checkDuplicateExpense` against recently inserted records (pass the growing batch as the context), and set `duplicateWarning` if a match is found. Do not throw — just flag it. This mirrors the existing pattern exactly.

---

### I-02: `disposeAsset` reclassification branch resolves accounts sequentially, not in parallel

**Plan:** 71-01, Task 2

The reclassification branch calls `resolveAccount` multiple times in sequential `await` calls:

```typescript
const targetAccount = await resolveAccount(ctx, defaultCode);
const fixedAssetAccount = await resolveAccount(ctx, assetAccountCode);
const accumAccount = cat?.glAccumCode ? await resolveAccount(ctx, cat.glAccumCode) : null;
```

The existing `disposeAsset` handler (which the plan correctly instructs reading) already shows the correct pattern: collect all needed codes into an array and resolve with `Promise.all`. The plan even cites this file in `read_first` but the proposed implementation regresses on it.

**Fix:** Mirror the existing parallel account resolution pattern from the current `disposeAsset` handler.

---

### I-03: `AssetDetailPanel.tsx` passes asset without `category` field — prop contract will break TypeScript

**Plan:** 71-04, Step 3

The plan correctly identifies that `DisposeAssetDialogProps` needs a `category: string` field. However, `AssetDetailPanel.tsx` constructs the `asset` prop object by hand (confirmed at line 289-295) and does not include `category`. The plan mentions "check the parent component" but leaves it as a note rather than an explicit task.

If the executor updates the props interface but not the caller, TypeScript will catch it — but only if the executor reads `AssetDetailPanel.tsx`. Given the autonomous flag is `false`, this is a human-catchable issue, but it should be an explicit acceptance criterion.

**Fix:** Add to the 71-04 acceptance criteria: `src/components/assets/AssetDetailPanel.tsx` passes `category: asset.category` to `DisposeAssetDialog`.

---

### I-04: `CATEGORY_TO_EXPENSE_ACCOUNT` duplicated across backend and frontend

**Plans:** 71-01 (backend `fixedAssets/helpers.ts`) and 71-04 (frontend `DisposeAssetDialog.tsx`)

The plan explicitly duplicates the 11-entry mapping as `CATEGORY_DEFAULT_EXPENSE_CODE` in the dialog file, acknowledging the frontend cannot import from `convex/`. The comment in 71-04 Step 3 is accurate — this is the right pragmatic call for a Convex project. However, the plan should add a comment cross-referencing the backend source so future maintainers know to update both when adding a new category.

**Fix (minor):** Add a code comment to the frontend copy: `// Mirror of CATEGORY_TO_EXPENSE_ACCOUNT in convex/fixedAssets/helpers.ts — keep in sync`.

---

### I-05: Double success toast on asset reclassification

**Plan:** 71-04, Step 9

The plan acknowledges the issue but dismisses it as "the double toast is minor." The existing `useDisposeAsset` hook in `src/hooks/convex/useFixedAssets.ts` fires a `"Asset disposed"` success message. The dialog code in Step 7 fires a second, more specific toast with the expense number.

The user will see two toasts stacked. This is confusing UX — especially since one says "Asset disposed" (generic) and the other says "reclassified to expense" (accurate). The plan already identifies the fix (empty success message on the hook), but then declines it.

**Fix:** The cleanest approach is to pass `successMessage: ""` to the hook when calling it from the dialog for reclassification, or to update the hook to not fire when the handler returns an `expenseNumber` field. The simplest: update `useDisposeAsset` to use `successMessage: ""` and let all callers show their own contextual toasts. The existing callers in `AssetDetailPanel` do not currently show a custom toast, so add one there for the three existing disposal types ("Asset disposed successfully").

---

### I-06: `BulkExpenseRow.accountId` and `submitterId` typed as `string | null` but mutation expects `Id<"accounts">` and `Id<"users">`

**Plan:** 71-02, Task 1

The `BulkExpenseRow` interface uses plain `string | null` for resolved IDs:

```typescript
accountId: string | null;
submitterId: string | null;
```

When 71-03 maps these to the mutation call:

```typescript
accountId: row.accountId as Id<"accounts">,
submitterId: row.submitterId as Id<"users">,
```

The `as` cast suppresses TypeScript rather than making the types correct. The cast also has no runtime guard — if `accountId` somehow slips through as `null` (a row with errors that passed the client-side `errorCount > 0` check due to a bug), the backend will receive `null` as an `Id<"accounts">` and Convex's validator will throw a runtime error mid-batch.

**Fix:** Type the resolved fields as `Id<"accounts"> | null` and `Id<"users"> | null` using the generated types. The import would be `import type { Id } from "../../convex/_generated/dataModel"`. This surfaces the type mismatch at map time rather than hiding it.

---

### I-07: No test plan for `disposeAsset` reclassification branch in `mutations.test.ts`

**Plan:** 71-01, Task 2

The plan lists 6 behavior tests for `disposeAsset` reclassification (Test 1–6 in the behavior block) but has no corresponding `<automated>` test file output. `convex/fixedAssets/mutations.test.ts` exists and has tests for the existing disposal logic. The reclassification branch creates an expense record, a compound JE, and an audit trail entry — three separate side effects — making it the most complex mutation in this phase.

The test cases in the behavior block are good. They just need to be written into the existing test file. The plan's TDD flag is `true` but the `<done>` summary doesn't mention test implementation.

**Fix:** Add an explicit acceptance criterion: `convex/fixedAssets/mutations.test.ts` contains tests for reclassify_to_expense branch (at minimum: expense created with NBV amount, JE has correct lines, asset status becomes disposed).

---

### I-08: `handleCellSave` re-resolution logic is underspecified in 71-03

**Plan:** 71-03, Task 1, Section E point 4

The plan states:

> "For category/owner changes, re-resolve the ID from the lookup maps. Revalidate the row after edit (rerun per-cell validation). This clears errors when user fixes them."

But the lookup maps (`accountNameMap`, `userNameMap`) are built inside `parseAndValidateBulkExpenseCsv` and are not returned as part of `BulkExpenseParseResult`. The page component has no access to them after parse time. An executor implementing this literally would either need to rebuild the maps from `accountsList` and `usersList` state inside `handleCellSave`, or store the maps in a ref.

For the `searchable` column type, `onSave` receives the `value` (which is the `account._id` from `searchItems`) and the `label` — so for category/owner edits going through `SearchableSelect`, the ID is already resolved and the lookup map is not needed. The gap only matters for free-text edits to the category/owner cells.

**Fix:** Clarify in the plan (or restrict EditableCell for category/owner columns to `searchable` type only, never `text`) so free-text edits to ID-resolved fields are impossible. This is the simpler solution.

---

## Refinements (Nice to Have)

### R-01: `importBatchId` is client-generated UUID with no index — consider server-side generation

The `importBatchId` is described as a client-generated UUID used for traceability. With no index on `expenses.importBatchId`, querying "all expenses from this batch" later requires a full table scan. Low priority for now but worth indexing if batch rollback/review is a future feature.

### R-02: Warning threshold of 10M IDR is hardcoded in parser — extract as a named constant

`convex/expenses/helpers.ts` has `validatePositiveIntegerAmount`. Adding a named constant `HIGH_AMOUNT_WARNING_THRESHOLD = 10_000_000` in `csvImportValidation.ts` keeps it easy to tune and makes the threshold discoverable.

### R-03: `EditableCell` `onBlur` save for `text`/`number`/`date` types will fire when user switches to another cell

The plan specifies `onBlur -> save` for text/number/date inputs. If a user clicks directly from one editable cell to another, the blur fires on the first cell (triggering save) and a click fires on the second (triggering `onStartEdit`). This is the correct behavior, but it means a half-edited cell can be committed with partial input if the user tab-navigates away by accident. Consider validating in `onSave` and reverting to the original value if invalid, rather than accepting whatever is in the input on blur.

### R-04: The `type` field filter in Plan 04 (`a.type === "opex" || a.type === "cogs" || a.type === "other"`) needs verification against actual account type literals

The accounts schema was not fully verified in this review. Confirm that the type literals `"opex"`, `"cogs"`, `"other"` match what is in `convex/schema.ts` before the executor uses them as filter conditions. A typo here would produce an empty expense account dropdown with no error.

---

## Duplication Analysis

**No problematic duplication found** beyond I-04 (the acknowledged mapping copy).

- `resolveAccount` is currently in `fixedAssets/mutations.ts` but is about to be needed in `expenses/bulkMutations.ts`. This is the right time to extract it (see C-01).
- `MAX_BATCH_SIZE = 50` exists in `convex/journalImport/mutations.ts` and is re-declared in `HistoricalImportPage.tsx`. The new `bulkMutations.ts` will create a third copy. Consider exporting it from the backend constants and importing in both places, though this is low priority.
- `VALID_PAYMENT_METHODS` exists in both `convex/expenses/constants.ts` and `src/lib/csvImportValidation.ts`. The plan correctly preserves this pattern (frontend can't import from convex/).
- `SearchableSelect` is a net new component with no existing analog. Correct to create it.
- `EditableCell` is a generalization of the `editingCogsId` pattern in `MenuProductsManager.tsx`. The plan correctly identifies this as the source pattern.

---

## Testing Assessment

**71-01:** TDD specs are strong (7 tests for bulkCreateExpenses, 6 for disposeAsset reclassification). The bulkCreateExpenses tests are well-defined. The reclassification tests are good but need to be written into the actual test file, not just listed in the plan behavior block (see I-07).

**71-02:** No test plan. CSV validation logic (`parseAndValidateBulkExpenseCsv`) is pure and highly testable — name-based matching, per-cell error generation, warning detection. This warrants unit tests, especially for edge cases like case-insensitive name matching, duplicate account names, and missing required fields. The plan specifies `type: "auto"` without TDD flag.

**71-03:** No test plan. The page is too UI-heavy for unit tests, but the `handleCellSave` re-validation logic is pure enough to extract and test. The human verification checklist in Task 2 is thorough and covers the main flows adequately.

**71-04:** No test plan. The dialog extension is thin enough that the human verification checklist (15 steps) covers it.

**Verdict:** Testing is adequate for the backend (Plans 01 and the existing test file). The CSV parser in Plan 02 is an under-tested gap. Recommend adding at least 5 unit tests for `parseAndValidateBulkExpenseCsv` covering: valid row roundtrip, case-insensitive category match, unknown category error, unknown owner error, and amount validation.

---

## Edge Cases to Address

**EC-01: Zero NBV asset reclassification.** Plan 01 throws `ConvexError("Cannot reclassify: Net Book Value must be positive")` when `nbv <= 0`. This is correct behavior. Verify the error message surfaces clearly in the dialog — the current plan catches the error silently in the `handleConfirm` catch block (`// Error toast handled by hook`). Confirm the hook shows the ConvexError message to the user.

**EC-02: Non-depreciable assets (tanah/land).** Land has `glAccumCode: null` and `accumulatedDepreciation` should always be 0. The reclassification JE logic skips the `DR Accumulated Depreciation` line when `asset.accumulatedDepreciation === 0` (correct). The condition `if (asset.accumulatedDepreciation > 0 && accumAccount)` handles this. No issue, but worth a unit test case.

**EC-03: CSV with all-error rows submitted.** The import button is disabled when `errorCount > 0`. But `errorCount` is derived from the initial parse result stored in `rows` state. If the user edits cells and resolves all errors, `errorCount` needs to be recomputed from current `rows` state — not from the initial `BulkExpenseParseResult`. The plan's state design uses `rows` as the mutable source of truth, which is correct, but the summary cards and button disabled state must derive from `rows` reactively, not from the snapshot `result`. The plan mentions this ("Counts derived reactively from `rows` state") but the executor must be careful to implement it as `useMemo` over `rows`, not as a snapshot from the parse step.

**EC-04: Batch partially succeeds then fails.** The retry-from-failure pattern is explicitly preserved from the existing implementation. This is correct. The `importBatchId` is shared across all batches in a run — if batches 1-3 succeed and batch 4 fails, a retry will create a second set of expenses for batch 4 with the same `importBatchId`. Duplicate detection (see I-01) would catch most of these, but only if implemented.

**EC-05: Empty CSV file or header-only CSV.** Papa Parse with `header: true, skipEmptyLines: true` returns an empty `data` array. The parser should handle this with a clear error ("No data rows found in CSV") rather than returning an empty result that shows a blank preview table with a "0 rows valid" counter.

---

## Top 3 Priorities Before Execution

1. **Fix C-01:** Extract `resolveAccount` to `convex/lib/accountUtils.ts` before writing `bulkMutations.ts`. This is a 10-minute refactor that prevents a circular import.

2. **Fix C-02:** Change `api.accounts.queries.listActive` to `api.accounts.queries.list, { activeOnly: true }` in Plan 04. The correct path is already used in `HistoricalImportPage.tsx` — the executor just needs to mirror it.

3. **Fix I-03:** Explicitly add `category: asset.category` to the `DisposeAssetDialog` prop object in `AssetDetailPanel.tsx` as a required acceptance criterion in 71-04.

---

## Files Ready to Proceed As-Is

- `convex/expenses/bulkMutations.ts` (new file) — logic is correct after fixing C-01
- `convex/schema.ts` changes — schema additions are clean and additive
- `src/lib/csvImportValidation.ts` additions — new types and parser are well-specified
- `src/components/shared/SearchableSelect.tsx` (new file) — spec is complete and follows project patterns
- `src/components/import/EditableCell.tsx` (new file) — spec is complete
- `src/hooks/convex/useJournalImport.ts` extension — straightforward hook addition
- `convex/fixedAssets/helpers.ts` addition — `CATEGORY_TO_EXPENSE_ACCOUNT` and `getReclassificationExpenseCode` are clean

---

## Files Requiring Plan Amendment Before Execution

- `convex/expenses/bulkMutations.ts` — fix C-01 (import path for resolveAccount), add I-01 (duplicate check)
- `convex/fixedAssets/mutations.ts` — fix C-01 (resolveAccount source), fix I-02 (parallel account resolution), add I-07 (test coverage criterion)
- `src/components/assets/DisposeAssetDialog.tsx` — fix C-02 (query path), fix I-03 (parent prop), fix I-05 (double toast)
- `src/pages/HistoricalImportPage.tsx` — clarify I-08 (handleCellSave re-resolution), fix I-06 (ID types)
