---
phase: quick-34
plan: 01
subsystem: ui
tags: [react, expense-form, cascading-select, gl-accounts]

requires:
  - phase: v1.7 expense infrastructure
    provides: ExpenseSubmit.tsx, accounts table, useAccounts hook

provides:
  - Cascading Tier 1 (Expense Type) / Tier 2 (GL Account) dropdowns in expense form
  - Filtered GL account selection by expense type category

affects: [expense-submit, expense-workflow]

tech-stack:
  added: []
  patterns: [cascading-select-with-useMemo-filter]

key-files:
  created: []
  modified:
    - src/pages/ExpenseSubmit.tsx

key-decisions:
  - "expenseType is UI-only state (not persisted) -- only accountId is submitted to backend"
  - "Edit mode derives expenseType from matched account type field, waits for accounts to load"

patterns-established:
  - "Cascading select pattern: Tier 1 onValueChange resets Tier 2 value, Tier 2 disabled until Tier 1 selected"

requirements-completed: [QT-34-BUG, QT-34-UX]

duration: 3min
completed: 2026-03-16
---

# Quick Task 34: Fix GL Codes Missing in Expense Form Summary

**Cascading Expense Type / GL Account dropdowns replacing flat GL Category selector in ExpenseSubmit.tsx**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T11:23:53Z
- **Completed:** 2026-03-16T11:26:23Z
- **Tasks:** 1 executed, 1 skipped (manual seeding)
- **Files modified:** 1

## Accomplishments
- Replaced flat "GL Category" dropdown (18 items) with cascading Tier 1 / Tier 2 selection
- Tier 1 "Expense Type" shows 3 categories: COGS, Operating Expenses, Other Income/Expense
- Tier 2 "GL Account" filters to only accounts matching selected expense type
- Edit mode correctly pre-fills both dropdowns by deriving expenseType from the existing accountId
- Form validation requires both Expense Type and GL Account

## Task Commits

1. **Task 1: Seed GL accounts** - SKIPPED (manual step -- user must run `accounts:seedDefaults` from Convex dashboard Functions tab)
2. **Task 2: Cascading Tier 1/Tier 2 dropdowns** - `1f26cba` (fix)

## Files Created/Modified
- `src/pages/ExpenseSubmit.tsx` - Added `expenseType` to FormState, EXPENSE_TYPE_OPTIONS constant, filteredAccounts useMemo, two-column cascading Select dropdowns, updated validation and edit-mode useEffect

## Decisions Made
- `expenseType` is UI-only state, not sent to backend -- `buildArgs()` unchanged since it already uses `accountId`
- Edit-mode useEffect now waits for both `existingExpense` AND `accounts` to be loaded before pre-filling, so the matched account type can be derived
- Changing Expense Type cascading-resets accountId to empty string via direct `setForm` call (not `updateField`) to atomically update both fields

## Deviations from Plan
None - plan executed exactly as written.

## User Setup Required

**GL Account seeding is required before the expense form will show any accounts.**

1. Open Convex dashboard: run `npx convex dashboard` or visit https://dashboard.convex.dev
2. Go to the **Functions** tab
3. Find and run `accounts:seedDefaults` (no arguments needed)
4. Verify it returns results with action "created"
5. Go to **Data** tab -> accounts table and confirm rows exist
6. Repeat for production environment if needed (switch deployment in dashboard)

## Issues Encountered
None

## Next Phase Readiness
- Expense form GL account selection is fully functional once accounts are seeded
- No blockers for future expense workflow enhancements

## Self-Check: PASSED

- [x] src/pages/ExpenseSubmit.tsx - FOUND
- [x] Commit 1f26cba - FOUND

---
*Quick Task: 34*
*Completed: 2026-03-16*
