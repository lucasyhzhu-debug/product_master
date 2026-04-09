# Staff Review: Phase 70 Admin All-Expenses Visibility — Implementation Review

**Date:** 2026-04-09
**Branch:** `gsd/phase-70-data-accuracy-foundation`
**Plan:** `docs/plans/2026-04-09-admin-all-expenses-visibility.md`
**Prior Review:** `docs/reviews/staffreview-admin-all-expenses-2026-04-09.md`
**Reviewer:** Principal Engineer (Post-Implementation)

---

## 1. Summary

**Verdict: Approve with improvements**

The implementation is faithful to the plan, clean, and minimal. All 5 files changed as specified. The mutually exclusive subscription pattern, ring highlight, admin conditional upgrade, and ApprovalActions reuse are all correctly implemented. The prior staff review's key recommendations (skip `useMyExpenses` for admins, add `// TODO: paginate` comment) were addressed. Total delta is +144/-18 lines across 5 files -- well-scoped for the feature.

Three issues need attention: a Tailwind ring-color collision when a card is both highlighted and selected, missing `useMemo` on the admin sort, and the ApprovalActions showing non-actionable buttons (Void) on already-voided expenses in the timeline panel.

---

## 2. Plan Fidelity

| Planned Item | Implemented | Notes |
|---|---|---|
| `listAllExpenses` admin query | Yes | Exact match to plan spec |
| `by_status` index for status filter | Yes | Confirmed index exists at schema.ts:1765 |
| `// TODO: paginate if >500 rows` | Yes | Line 91 of queries.ts |
| `nameMap` join pattern | Yes | Matches `listPendingForApproval` lines 244-249 |
| `useAllExpenses` hook with `enabled` | Yes | Skip pattern matches plan |
| `useMyExpenses` skip for admins | Yes | Prior review Improvement 1 addressed |
| `AllExpense` type export | Yes | Barrel updated |
| ExpenseCard highlight props | Yes | 3 optional props, backward compatible |
| Submitter name in metadata row | Yes | Before vendor, as planned |
| MyExpenses conditional upgrade | Yes | `isAdmin` check, title swap, sorting |
| Highlight legend checkbox | Yes | Ring swatch + label, matching kanban pattern |
| ApprovalActions in timeline panel | Yes | Admin-only, with `onActionComplete` wired to close |
| Mutually exclusive hooks | Yes | `!isAdmin` / `!!isAdmin` correctly inverted |
| Ring priority (selection > highlight) | Partially | See Critical Issue 1 |

**Scope creep:** None. Implementation matches plan exactly.
**Shortcuts:** None identified. All planned items are present.

---

## 3. Critical Issues

### C-1: Ring color collision when card is both highlighted AND selected

**Location:** `ExpenseCard.tsx` line 24 + `MyExpenses.tsx` line 321

When an admin's own expense is selected, the card gets both:
- `highlightClass`: `ring-2 ring-blue-400` (ownership highlight)
- `className`: `ring-2 ring-primary` (selection indicator)

The `cn()` call order is:
```tsx
cn("border rounded-lg p-4 ...", highlightClass, className)
```

`twMerge` resolves `ring-blue-400` vs `ring-primary` by keeping the **last** ring color. Since `className` comes after `highlightClass`, `ring-primary` wins when selected. This is the intended behavior per the plan ("Selection > ownership highlight").

**However**, the plan states: "selected card gets `ring-2 ring-primary` via `className` prop, which overrides the 'mine' highlight via Tailwind's `cn()` merge."

This works correctly TODAY because `className` is positionally last. But it's fragile -- any future refactor that reorders the `cn()` arguments would silently break ring priority. The intent should be explicit.

**Fix:** When selected, suppress the highlight entirely:
```tsx
const highlightClass = highlightMine && isMine && !className?.includes("ring-primary")
  ? "ring-2 ring-blue-400" : "";
```
Or better, handle it in `MyExpenses.tsx` where both states are known:
```tsx
const isSelected = selectedExpenseId === expense._id;
// ...
isMine={isMine && !isSelected}
className={isSelected ? "ring-2 ring-primary" : undefined}
```

**Severity:** Low-risk bug. Works now, fragile to future edits.

---

## 4. Improvements

### I-1: Missing `useMemo` on admin sort

**Location:** `MyExpenses.tsx` lines 78-85

The admin sort runs on every render:
```tsx
const expenses = rawExpenses && isAdmin && user
  ? [...rawExpenses].sort((a, b) => { ... })
  : rawExpenses;
```

This creates a new array reference and triggers re-renders of all `ExpenseCard` children every time any state changes (tab switch, card selection, highlight toggle). For a few hundred expenses this is negligible, but it violates React best practice and the prior review explicitly recommended wrapping it in `useMemo`.

**Fix:**
```tsx
const expenses = useMemo(() => {
  if (!rawExpenses || !isAdmin || !user) return rawExpenses;
  return [...rawExpenses].sort((a, b) => {
    const aMine = a.submittedBy === user.userId ? 0 : 1;
    const bMine = b.submittedBy === user.userId ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    return b.createdAt - a.createdAt;
  });
}, [rawExpenses, isAdmin, user]);
```

### I-2: ApprovalActions shows Void button on already-voided expenses

**Location:** `MyExpenses.tsx` lines 194-204

When an admin clicks a voided expense in the "Voided" tab, the timeline panel renders `ApprovalActions` which unconditionally shows the Void button for admins (line 314 of ApprovalActions.tsx). The backend `voidExpense` mutation rejects the call (`isVoidableStatus("voided") === false`), so this is not a data integrity issue. But it's confusing UX -- admin sees a Void button on an already-voided expense that will just throw an error.

This is technically a pre-existing issue in `ApprovalActions`, but this PR is the first time voided expenses get the `ApprovalActions` component rendered against them (previously only the approval queue used it, which filters to actionable statuses).

**Fix (minimal, in MyExpenses.tsx):** Only render ApprovalActions for non-terminal statuses:
```tsx
{isAdmin && selectedExpense.status !== "voided" && selectedExpense.status !== "reimbursed" && (
  <div className="mt-2">
    <ApprovalActions ... />
  </div>
)}
```

Or more robustly, pass the status and let ApprovalActions render nothing when no actions are available.

### I-3: `ExpenseList` type uses `"submitterName" in expense` runtime check

**Location:** `MyExpenses.tsx` line 322

```tsx
submitterName={isAdmin && "submitterName" in expense ? (expense as AllExpense).submitterName : undefined}
```

This uses a runtime `in` check + type assertion instead of leveraging TypeScript's type system. The `ExpenseList` already knows `isAdmin` -- when `isAdmin` is true, the data is always `AllExpense[]`. The union type on `expenses` prop could be narrowed with a discriminated approach or separate props.

**Fix:** Use a conditional type or simply trust `isAdmin`:
```tsx
submitterName={isAdmin ? (expense as AllExpense).submitterName : undefined}
```

The `"submitterName" in expense` check is redundant when `isAdmin` is true because the admin path always returns `AllExpense` objects from `listAllExpenses`.

---

## 5. Refinements

### R-1: Empty state text doesn't distinguish admin from non-admin

**Location:** `MyExpenses.tsx` lines 296-309

The empty state says "No expenses found. Start by creating your first expense." This makes sense for non-admins but is misleading for admins in the "All Expenses" view -- there genuinely might be no expenses in the system, and the CTA to "Create Expense" is contextually wrong for an admin reviewing others' expenses.

**Suggestion:** Differentiate empty state:
```tsx
<h3>{isAdmin ? "No expenses in system" : "No expenses found"}</h3>
<p>{isAdmin ? "No expenses have been submitted yet." : "Start by creating your first expense."}</p>
```

### R-2: Admin draft click navigates to edit form

**Location:** `MyExpenses.tsx` lines 101-103

When admin clicks a draft expense, it navigates to `/expenses/new?edit=${id}`. For the admin's OWN drafts this is correct. For OTHER users' drafts, the edit form may fail or produce confusing behavior since it loads the expense and the submitter check is owner-only.

This is a pre-existing behavior that becomes visible only with the admin all-expenses view. Low priority since admins rarely need to interact with others' drafts.

### R-3: `nameMap` key type is `string` but uses Convex `Id<"users">`

**Location:** `convex/expenses/queries.ts` line 100

```tsx
const nameMap = new Map<string, string>();
```

The key is typed as `string` but it's actually `Id<"users">`. This matches the existing pattern in `listPendingForApproval` (same code), so it's consistent. Not worth fixing unless the whole pattern is updated.

### R-4: No test coverage for `listAllExpenses`

The prior staff review flagged this as a Critical Issue. The implementation did not add tests. The existing `convex/expenses/__tests__/helpers.test.ts` covers pure helper functions, but there's no `convex-test` query test for `listAllExpenses` (admin access, non-admin rejection, status filter, submitterName join, empty state).

This should be a follow-up task before merge.

---

## 6. Design Doc Compliance

| Decision | Compliant | Evidence |
|---|---|---|
| Same page, conditional upgrade | Yes | Single `MyExpenses` component, `isAdmin` conditional |
| Mutually exclusive hooks | Yes | `useMyExpenses(!isAdmin)` / `useAllExpenses(!!isAdmin)` |
| No schema changes | Yes | No changes to `convex/schema.ts` |
| Void via timeline panel | Yes | ApprovalActions in CardHeader |
| Ring priority (selection > ownership) | Yes* | Works via `cn()` argument order, but fragile |

---

## 7. Architecture Risk Assessment

### Real-time subscription load

The `listAllExpenses` query with no status filter does a full table `collect()`. For the current business scale (small FMCG company), expenses are bounded -- likely under 500 rows. The `// TODO: paginate if >500 rows` comment acknowledges this.

The Convex real-time subscription will re-fire this query on every expense write across the entire table. For admin users this means any employee submitting/editing any expense will trigger a re-query. At current scale this is fine. At 1000+ expenses with multiple concurrent users, this will need pagination or date-range limiting.

**Risk: Low (current), Medium (6-month horizon)**

### Type narrowing

The `AllExpense` type extends `Expense` with `submitterName: string`. The `ExpenseList` component accepts `ReturnType<typeof useMyExpenses> | ReturnType<typeof useAllExpenses>` -- this is a union of `Expense[] | AllExpense[] | undefined`. The runtime `in` check for `submitterName` is safe but not elegant. The `ExpenseCard` component accepts `Expense` which is structurally compatible with `AllExpense` (extra field ignored). No type safety issues.

---

## 8. Line Count Assessment

| File | Planned LOC | Actual LOC Added | Assessment |
|---|---|---|---|
| `convex/expenses/queries.ts` | ~35 | 46 (including comments/whitespace) | On target |
| `src/hooks/convex/useExpenses.ts` | ~12 | 13 | On target |
| `src/hooks/convex/index.ts` | ~2 | 2 | Exact |
| `src/components/expenses/ExpenseCard.tsx` | ~12 | 12 | Exact |
| `src/pages/MyExpenses.tsx` | ~40 | 71 | Slightly over (includes ExpenseList refactor) |
| **Total** | ~100 | 144 | Reasonable, no bloat |

---

## 9. Verdict

**Approve with improvements.** The implementation is clean, plan-faithful, and minimal. Address I-1 (useMemo) and I-2 (void button on voided expenses) before merge. C-1 (ring fragility) is optional but recommended. R-4 (missing tests) should be a tracked follow-up.

---

*Generated by principal engineer review*
*Post-implementation code review of Phase 70 admin all-expenses visibility*
