---
branch: fix/gl-codes-cascading-dropdowns
base: origin/main (5d2032b)
head: 0bb01b1
date: 2026-03-16
phase: quick-34
reviewer: triple-review (requirements · code-quality · staffreview)
files_changed: 1 (src/pages/ExpenseSubmit.tsx, +76/-24)
---

# Staff Review — quick-34: Fix GL Codes Missing in Expense Form

## Summary

Single-file frontend change replacing a flat 18-item GL account dropdown with a
cascading Tier 1 (Expense Type) → Tier 2 (GL Account) two-column selector in
`ExpenseSubmit.tsx`. The implementation matches the plan exactly — no deviations
reported. The code is correct, safe, and immediately shippable. Three minor
improvements are worth addressing before or shortly after merge.

**Verdict: APPROVE with minor suggestions.** No blockers.

---

## Critical Issues (0)

None. No bugs, no missing auth, no plan violations, no incorrect calculations.

---

## Important Improvements (2)

### I1 — `FormState.expenseType` typed as `string` instead of a union literal

**File:** `src/pages/ExpenseSubmit.tsx` — `FormState` interface (line 66)

**Problem:** The `expenseType` field accepts any string. The valid values are
`"cogs"`, `"opex"`, `"other"`, and `""` (empty/unselected). Mistyping a value
in a future `setForm` call (e.g., from a copy-paste or refactor) would silently
pass TypeScript instead of being caught at compile time.

**Fix:**
```typescript
interface FormState {
  // ...
  expenseType: "cogs" | "opex" | "other" | "";
  // ...
}
```

EXPENSE_TYPE_OPTIONS is already `as const` so the values are narrowed there; the
interface just needs to match.

---

### I2 — `accounts` derivation not memoized (inconsistent with `filteredAccounts`)

**File:** `src/pages/ExpenseSubmit.tsx` — lines 98–101

**Problem:**
```typescript
const allAccounts = useAccounts(true);
const accounts = allAccounts?.filter((a) =>
  ["opex", "cogs", "other"].includes(a.type)
);
```
This inline `.filter()` runs on every render. `filteredAccounts` (the Tier 2
derivation) uses `useMemo`, but the outer `accounts` derivation does not. For
39 items the performance impact is negligible, but the inconsistency is
confusing — a future reader may wonder why one is memoized and the other is not.

**Fix:** Wrap in `useMemo`:
```typescript
const accounts = useMemo(
  () => allAccounts?.filter((a) => ["opex", "cogs", "other"].includes(a.type)),
  [allAccounts]
);
```

---

## Minor Refinements (2)

### M1 — Edit-mode: no fallback when matched account is not found

**File:** `src/pages/ExpenseSubmit.tsx` — lines 128–131

**Problem:** If `existingExpense.accountId` refers to an account that has been
deactivated or deleted since the expense was created, `matchedAccount` will be
`undefined`. The form pre-fills `expenseType: ""` and `accountId` to the
orphaned ID. With Tier 1 empty, the GL Account dropdown is disabled — the user
cannot clear or re-select without manually opening the URL again. There is no
feedback that the account is missing.

**Suggested fix:** After deriving `matchedAccount`, if it is `undefined` and
`existingExpense.accountId` is non-empty, show a toast warning:
```typescript
if (!matchedAccount && existingExpense.accountId) {
  toast.warning("Previously selected GL account is no longer available. Please re-select.");
}
```
This is an edge case (requires account deactivation between creation and edit)
but would avoid silent user confusion.

---

### M2 — No inline comment explaining why `expenseType` is absent from `buildArgs`

**File:** `src/pages/ExpenseSubmit.tsx` — `buildArgs` function (line 182)

**Problem:** `buildArgs` constructs the mutation payload without `expenseType`.
The decision that expenseType is UI-only state (not persisted) is documented in
the plan and summary YAML, but not in the code. A future developer may add it
by mistake.

**Suggested fix:** Add a one-line comment:
```typescript
// buildArgs constructs the backend mutation payload.
// expenseType is UI-only (Tier 1 cascade selector) — only accountId is persisted.
const buildArgs = useCallback(() => {
```

---

## Nitpick (2)

### N1 — GL Account Select shows empty list (not a loading spinner) during type transition

When the user selects an Expense Type but `accounts` is still loading (theoretically
possible on slow connections), `filteredAccounts` is `[]` and the GL Account dropdown
opens to an empty list with no indication of loading. In practice the full-page
skeleton guard prevents reaching this state, but if the loading guard is ever
loosened, this would regress silently. No action needed now.

### N2 — `EXPENSE_TYPE_OPTIONS` labels should match what the income statement uses

The labels "Cost of Goods Sold", "Operating Expenses", "Other Income/Expense" are
consistent with the `category` field in the accounts table and the income statement
groupings. Verified correct — no action needed.

---

## Architecture Notes

- The `expenseType` field is correctly scoped to local UI state — it is never
  sent to the backend. `buildArgs()` is unchanged. This is the right design.
- Cascading reset (Tier 1 change wipes Tier 2) is implemented correctly via
  direct `setForm` rather than `updateField`, avoiding two separate state updates
  and ensuring atomicity.
- The edit-mode effect correctly waits for both `existingExpense` and `accounts`
  before pre-filling, preventing a race where the type lookup would find no match.
  `formLoadedRef` prevents double-fire. Pattern is sound.
- No new Convex queries, mutations, or subscriptions introduced. Real-time
  subscription load unchanged.
- No schema changes. No index changes.

---

## Checklist

- [x] Plan compliance verified (all 7 done-criteria met)
- [x] TypeScript compiles (tsc --noEmit runs clean per plan verification)
- [x] No new auth surface
- [x] No backend changes
- [x] Edit-mode pre-fill correct
- [x] Cascading reset correct
- [x] Validation updated for both fields
- [ ] I1: Type `expenseType` as union literal (recommended before merge)
- [ ] I2: Memoize `accounts` derivation (recommended before merge)
- [ ] M1: Toast warning for orphaned accountId in edit mode (optional)
- [ ] M2: Add inline comment to `buildArgs` (optional)
