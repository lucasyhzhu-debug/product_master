# Plan: Admin All-Expenses Visibility + Void from Queue

## Context

A co-founder accidentally approved an employee-paid expense (Cooking Gas, Rp 440K) that was actually company-paid. The expense is now stuck in the reimbursement queue (`awaiting_payment`) with no way for an admin to void it from the MyExpenses UI. Currently, MyExpenses only shows the logged-in user's own expenses. Admins need to see ALL company expenses across all users, with their own expenses highlighted at the top (matching the order kanban pattern), and be able to void expenses directly from the timeline panel.

**Staff Review:** `docs/reviews/staffreview-admin-all-expenses-2026-04-09.md` — Approved with minor improvements (all addressed below).

## Git Workflow
**Branch:** `gsd/phase-70-data-accuracy-foundation` (current branch)
**Checkpoints:** After backend query, after frontend integration

## Implementation Waves

### Wave 1: Backend [SEQUENTIAL]

| # | Agent | Task | Files |
|---|-------|------|-------|
| 1 | convex-backend | Add `listAllExpenses` admin-only query | `convex/expenses/queries.ts` |

**Details:**
- New `listAllExpenses` query, role-restricted to `["admin"]`
- Args: `{ status: v.optional(expenseStatusValidator) }`
- When status provided: use existing `by_status` index
- When no status: full table `collect()` (bounded business dataset)
- Add `// TODO: paginate if >500 rows` comment on the full-table path
- Join submitter names via `nameMap` pattern (same as `listPendingForApproval` lines 198-203)
- Sort by `createdAt` descending
- No receipt URL resolution (listing view, not detail)

### Wave 2: Frontend [SEQUENTIAL, after Wave 1]

| # | Agent | Task | Files |
|---|-------|------|-------|
| 1 | react-ui-builder | Add `useAllExpenses` hook + update `useMyExpenses` + `AllExpense` type | `src/hooks/convex/useExpenses.ts` |
| 2 | react-ui-builder | Export new hook/type from barrel | `src/hooks/convex/index.ts` |
| 3 | react-ui-builder | Add highlight + submitter props to ExpenseCard | `src/components/expenses/ExpenseCard.tsx` |
| 4 | react-ui-builder | Upgrade MyExpenses for admin view | `src/pages/MyExpenses.tsx` |

**Hook details (`useExpenses.ts`):**
```typescript
// Add enabled param to useMyExpenses for admin skip
export function useMyExpenses(status?: ExpenseStatus, enabled: boolean = true) {
  return useSessionQuery(
    api.expenses.queries.listMyExpenses,
    enabled ? (status ? { status } : {}) : "skip"
  );
}

export function useAllExpenses(status?: ExpenseStatus, enabled: boolean = true) {
  return useSessionQuery(
    api.expenses.queries.listAllExpenses,
    enabled ? (status ? { status } : {}) : "skip"
  );
}
export type AllExpense = NonNullable<ReturnType<typeof useAllExpenses>>[number];
```

**ExpenseCard changes (`ExpenseCard.tsx`):**
- Add optional props: `submitterName?: string`, `isMine?: boolean`, `highlightMine?: boolean`
- Compute `highlightClass = highlightMine && isMine ? 'ring-2 ring-blue-400' : ''`
- Merge into root div via `cn()` (existing utility)
- Show `submitterName` in metadata row before vendor when provided
- All new props optional = fully backward compatible

**MyExpenses changes (`MyExpenses.tsx`):**
- Add `isAdmin` check from `useAuth()`
- Add `highlightMine` state (default true)
- Call `useMyExpenses` with skip for admins, `useAllExpenses` with skip for non-admins (mutually exclusive subscriptions)
- Active data: `isAdmin ? allExpenses : myExpenses`
- Sort admin view: own expenses first (pin to top), then others, both groups by createdAt desc
- Title: "All Expenses" for admin, "My Expenses" for others
- Add highlight legend checkbox (matching order kanban pattern: checkbox + ring swatch + label)
- Pass `submitterName`, `isMine`, `highlightMine` to ExpenseCard
- Add `ApprovalActions` to timeline panel for admin (void + other actions available from card click)
- Import `ApprovalActions` from `@/components/expenses/ApprovalActions`

### Wave 3: Verification [SEQUENTIAL]

| # | Agent | Task |
|---|-------|------|
| 1 | code-auditor | Type check + pattern compliance |
| 2 | Bash | `npm run test` |
| 3 | Bash | `npm run build` |

## Key Design Decisions

1. **Same page, conditional upgrade** — no separate admin page. Admin sees everything in MyExpenses; non-admins see no change.
2. **Mutually exclusive hooks** — `useMyExpenses` skips for admins, `useAllExpenses` skips for non-admins. Only one real-time subscription active per user. Both hooks always called (React rules) but inactive one gets `"skip"`.
3. **No schema changes** — `by_status` index already exists on expenses table.
4. **Void via timeline panel** — clicking an expense card opens the timeline; admin sees `ApprovalActions` (which already has Void button) in the panel header. No inline void button on cards (keeps cards clean).
5. **Ring priority** — selected card gets `ring-2 ring-primary` via `className` prop, which overrides the "mine" highlight via Tailwind's `cn()` merge. Selection > ownership highlight.

## Files Modified (5 files, ~100 LOC)

| File | Change |
|------|--------|
| `convex/expenses/queries.ts` | Add `listAllExpenses` query (~35 LOC) |
| `src/hooks/convex/useExpenses.ts` | Add `useAllExpenses` hook + update `useMyExpenses` + type (~12 LOC) |
| `src/hooks/convex/index.ts` | Export new hook/type (~2 LOC) |
| `src/components/expenses/ExpenseCard.tsx` | Add 3 optional props + highlight logic (~12 LOC) |
| `src/pages/MyExpenses.tsx` | Conditional admin view, sorting, legend, timeline actions (~40 LOC) |

## Documentation Updates
- [ ] CHANGELOG.md

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds
- [ ] Admin sees all expenses across all users in MyExpenses
- [ ] Admin's own expenses appear at top of each tab with blue ring highlight
- [ ] Non-admin users see only their own expenses (no change)
- [ ] Admin can void an expense from the timeline panel
- [ ] Submitter name shown on cards in admin view
- [ ] Highlight toggle works (checkbox to turn blue ring on/off)
