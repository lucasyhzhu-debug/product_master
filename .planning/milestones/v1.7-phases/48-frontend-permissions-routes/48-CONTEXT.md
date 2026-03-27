# Phase 48: Frontend Permissions & Routes - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md Section 6 + docs/superpowers/plans/2026-03-12-expense-accounting-system.md Tasks 11-13)

<domain>
## Phase Boundary

This phase wires up frontend access control and routing for the expense/accounting system built in Phases 43-47. It adds permission flags, creates frontend hooks for all new Convex APIs, registers routes with ProtectedRoute guards, and adds navigation links. No new pages are built in this phase — only the plumbing to make them accessible.

**Depends on:** Phase 44 (expenses backend), Phase 45 (expense approval/void), Phase 46 (reimbursement batches), Phase 47 (payroll entries)

</domain>

<decisions>
## Implementation Decisions

### Permission Flags (Locked — from Spec Section 6)
- Add 4 new permission flags to `ROLE_PERMISSIONS` in `src/lib/types.ts`:
  - `canSubmitExpenses: boolean` — all roles (kitchen, order_staff, manager, admin)
  - `canApproveExpenses: boolean` — manager, admin only
  - `canManageReimbursements: boolean` — admin only
  - `canAccessExpenseAnalytics: boolean` — manager, admin only
- Per-role mapping:
  - `kitchen`: canSubmitExpenses=true, all others false
  - `order_staff`: canSubmitExpenses=true, all others false
  - `manager`: canSubmitExpenses=true, canApproveExpenses=true, canAccessExpenseAnalytics=true, canManageReimbursements=false
  - `admin`: all four true

### Routes (Locked — from Spec Section 6 + Plan Task 13)
- `/expenses` — ProtectedRoute with `requiredPermission="canSubmitExpenses"` → ExpenseManager page
- `/reimbursements` — ProtectedRoute with `requiredPermission="canManageReimbursements"` → ReimbursementManager page
- `/expense-analytics` — ProtectedRoute with `requiredPermission="canAccessExpenseAnalytics"` → ExpenseAnalytics page
- All 3 pages use lazy imports with `lazyWithPreload` pattern

### Frontend Hooks (Locked — from Plan Task 12)
- `useExpenses.ts`: useMyExpenses, usePendingApprovals, useAllExpenses, useExpenseDetail + mutation hooks (saveDraft, submit, approve, reject, void, resubmit, generateUploadUrl)
- `useReimbursements.ts`: usePendingReimbursements, useBatchHistory + mutation hooks (createBatch, confirmBatch, voidBatch)
- `useAccounts.ts`: useOpExAccounts, useAllAccounts
- `usePayroll.ts`: usePayrollEntries + mutation hooks (createPayroll, voidPayroll)
- `useJournal.ts`: useOpExByPeriod, useOtherByPeriod
- All hooks exported via `src/hooks/convex/index.ts` barrel

### Navigation (Locked — from Plan Task 13)
- Add links to Header.tsx (desktop) and MobileBottomNav.tsx (mobile)
- Expenses: visible to all roles (canSubmitExpenses)
- Reimbursements: admin only (canManageReimbursements)
- Expense Analytics: manager + admin (canAccessExpenseAnalytics)

### ProtectedRoute Update (Locked — from Plan Task 13)
- Check if ProtectedRoute's `requiredPermission` prop type needs updating for new permission names
- If it reads from ROLE_PERMISSIONS dynamically, no change needed
- If static union type, add 4 new permissions

### Access Control Matrix (Locked — from Spec Section 6)
| Page | Kitchen | Order Staff | Manager | Admin |
|------|---------|-------------|---------|-------|
| Expense Manager (own) | Submit + view own | Submit + view own | Submit + view own | Submit + view own |
| Expense Manager (approve) | — | — | ≤ 500K | All amounts |
| Expense Manager (audit) | — | — | — | All Expenses tab |
| Reimbursement Manager | — | — | — | Full access |
| Expense Analytics | — | — | View | Full access |

### Claude's Discretion
- Hook implementation details (error handling patterns, loading state management)
- Whether to group navigation under a "Finance" submenu or add flat links
- Order of new hooks in barrel export
- Whether ProtectedRoute needs type changes (depends on current implementation)

</decisions>

<specifics>
## Specific Ideas

- Follow existing hook patterns from `useFinancials.ts` and `useOrders.ts`
- Use `lazyWithPreload` for page lazy imports (existing App.tsx pattern)
- Hooks wrap `useQuery`/`useMutation` with appropriate Convex API paths
- Backend APIs already exist in: `convex/expenses/`, `convex/reimbursements/`, `convex/accounts/`, `convex/payroll/`, `convex/journal/`
- Bank accounts CRUD: `convex/bankAccounts/` (admin-only pages reference this)
- Payroll page and bank accounts page are admin-only but don't have explicit permission flags in spec — use existing `canManageReimbursements` or admin role check

</specifics>

<deferred>
## Deferred Ideas

- Actual page UI implementation (ExpenseManager, ReimbursementManager, ExpenseAnalytics) — separate phases
- P&L extension on Financial Statement page — separate phase
- Finance hub card on HubPage — implementation detail for page phases

</deferred>

---

*Phase: 48-frontend-permissions-routes*
*Context gathered: 2026-03-14 via PRD Express Path*
