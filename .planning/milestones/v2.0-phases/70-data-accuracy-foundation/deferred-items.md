# Deferred Items - Phase 70

## Pre-existing Type Error: MyExpenses.tsx

**Discovered during:** 70-02 build verification
**File:** `src/pages/MyExpenses.tsx` line 176
**Error:** `tsc -b` fails with TS2322 - `selectedExpense` type mismatch (missing `submitterName` when `isAdmin=false`)
**Root cause:** Commit `20a940e1` ("fix: render expense timeline panel inline below selected card") introduced a type mismatch between the `useMyExpenses` return type (no `submitterName`) and the `ExpenseList` component's `selectedExpense` prop which expects `submitterName`.
**Impact:** `npm run build` (`tsc -b && vite build`) fails, but `npm run type-check` (`tsc --noEmit`) passes and `vite build` alone succeeds.
**Fix:** Cast `selectedExpense` or update `ExpenseList` prop type to make `submitterName` optional.
