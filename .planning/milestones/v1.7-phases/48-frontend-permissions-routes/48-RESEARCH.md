# Phase 48: Frontend Permissions & Routes - Research

**Researched:** 2026-03-14
**Domain:** Frontend access control, routing, React permission system
**Confidence:** HIGH

## Summary

Phase 48 wires up frontend access control for the expense/accounting system built in Phases 43-47. The scope is narrower than the CONTEXT.md originally anticipated because **most of the work has already been done** in prior phases. The hooks (useExpenses, useReimbursements, useAccounts, usePayroll, useBankAccounts) already exist and are already exported from the barrel. The routes (expenses, reimbursements, bank-accounts, payroll, accounts) already exist in App.tsx. The admin navigation entries for reimbursements, bank accounts, and payroll already exist in Header.tsx.

The remaining work is: (1) add 4 new permission flags to `ROLE_PERMISSIONS`, (2) migrate existing expense/reimbursement/payroll routes from `allowedRoles` to `requiredPermission`, (3) add an `/expenses` nav link visible to all roles in Header.tsx and MobileBottomNav.tsx, (4) add an `/expense-analytics` route with a stub page and nav link, and (5) add expense-related items to MobileBottomNav's "More" sheet.

**Primary recommendation:** Focus the plan on the 4 permission flags and route/nav updates. Do NOT create hooks or barrel exports that already exist. The `useJournal.ts` hook from the CONTEXT cannot be created because the backend queries (Phase 49) do not exist yet.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add 4 new permission flags to `ROLE_PERMISSIONS` in `src/lib/types.ts`:
  - `canSubmitExpenses: boolean` -- all roles (kitchen, order_staff, manager, admin)
  - `canApproveExpenses: boolean` -- manager, admin only
  - `canManageReimbursements: boolean` -- admin only
  - `canAccessExpenseAnalytics: boolean` -- manager, admin only
- `/expenses` -- ProtectedRoute with `requiredPermission="canSubmitExpenses"` -> ExpenseManager page
- `/reimbursements` -- ProtectedRoute with `requiredPermission="canManageReimbursements"` -> ReimbursementManager page
- `/expense-analytics` -- ProtectedRoute with `requiredPermission="canAccessExpenseAnalytics"` -> ExpenseAnalytics page
- All 3 pages use lazy imports with `lazyWithPreload` pattern
- Hooks: useExpenses, useReimbursements, useAccounts, usePayroll, useJournal -- exported via barrel
- Navigation: Expenses visible to all roles, Reimbursements admin only, Expense Analytics manager + admin
- ProtectedRoute check if requiredPermission prop type needs updating for new permission names
- Access Control Matrix as specified in CONTEXT.md

### Claude's Discretion
- Hook implementation details (error handling patterns, loading state management)
- Whether to group navigation under a "Finance" submenu or add flat links
- Order of new hooks in barrel export
- Whether ProtectedRoute needs type changes (depends on current implementation)

### Deferred Ideas (OUT OF SCOPE)
- Actual page UI implementation (ExpenseManager, ReimbursementManager, ExpenseAnalytics) -- separate phases
- P&L extension on Financial Statement page -- separate phase
- Finance hub card on HubPage -- implementation detail for page phases
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERM-01 | All roles can submit expenses and view their own expense history | `canSubmitExpenses` permission flag (all roles true); `/expenses` route already exists with bare `<ProtectedRoute>` -- needs `requiredPermission="canSubmitExpenses"` |
| PERM-02 | Manager and Admin can approve expenses (within DoA thresholds) | `canApproveExpenses` permission flag (manager+admin true); `/expenses/approve` route already exists with `allowedRoles` -- migrate to `requiredPermission="canApproveExpenses"` |
| PERM-03 | Admin-only access to Reimbursement Manager, bank accounts, payroll entries, and All Expenses audit view | `canManageReimbursements` permission flag (admin only); routes already exist with `allowedRoles={["admin"]}` -- migrate to `requiredPermission="canManageReimbursements"` for reimbursements; payroll and bank-accounts can keep `allowedRoles` or use `canManageReimbursements` |
| PERM-04 | Manager and Admin can access Expense Analytics dashboard | `canAccessExpenseAnalytics` permission flag (manager+admin true); `/expense-analytics` route needs creation with stub page |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| React | ^19.2.0 | UI framework | Existing |
| React Router | ^7.13.0 | Client-side routing | Existing |
| TypeScript | ~5.9 | Type safety | Existing |
| Convex | ^1.31.7 | Backend + real-time DB | Existing |
| convex-helpers | (installed) | useSessionQuery/useSessionMutation | Existing |

### Supporting (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Lucide React | (installed) | Icons (Receipt, BarChart3, etc.) | Existing |
| shadcn/ui | (installed) | UI components | Existing |
| Tailwind CSS | ^4.1.18 | Styling | Existing |

No new libraries needed for this phase.

## Architecture Patterns

### Permission System Architecture (Existing -- Extend)

The project uses a centralized `ROLE_PERMISSIONS` constant in `src/lib/types.ts` that maps each `UserRole` to a flat object of boolean permission flags. This is consumed by:

1. **AuthContext** (`src/contexts/AuthContext.tsx`): Provides `hasPermission(key)` method
2. **ProtectedRoute** (`src/components/auth/ProtectedRoute.tsx`): Accepts `requiredPermission` prop typed as `keyof typeof ROLE_PERMISSIONS.admin`
3. **Header.tsx**: Filters nav items by `hasPermission(item.permission)`
4. **MobileBottomNav.tsx**: Same pattern as Header

**Critical finding:** `ProtectedRoute`'s `requiredPermission` prop is typed as `keyof typeof ROLE_PERMISSIONS.admin`. This means adding new keys to the `ROLE_PERMISSIONS.admin` object automatically makes them valid `requiredPermission` values. **No type changes needed in ProtectedRoute.**

### Route Registration Pattern (Existing)

```typescript
// App.tsx -- lazy import pattern
const PageName = lazyWithPreload(() =>
  import('./pages/PageName').then(m => ({ default: m.PageName }))
);

// Route with permission guard
<Route
  path="page-path"
  element={
    <ProtectedRoute requiredPermission="canDoSomething">
      <PageName />
    </ProtectedRoute>
  }
/>
```

### Navigation Item Pattern (Existing)

```typescript
// Header.tsx -- NavItem definition
type NavItem = {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: PermissionKey;
  preload?: () => void;
};

// Items filtered at render time
const visibleItems = user
  ? navItems.filter(item => hasPermission(item.permission))
  : [];
```

### Hook Pattern (Existing -- Already Created)

```typescript
// useSessionQuery for protected queries
export function useMyExpenses(status?: ExpenseStatus) {
  return useSessionQuery(api.expenses.queries.listMyExpenses, status ? { status } : {});
}

// createMutationHook factory for mutations with toast
export const useApproveExpense = createMutationHook(
  api.expenses.mutations.approveExpense,
  { successMessage: "Expense approved", errorMessage: "Failed to approve expense" }
);
```

### Anti-Patterns to Avoid

- **Creating hooks that already exist:** useExpenses, useReimbursements, useAccounts, usePayroll, useBankAccounts are ALL already created and exported in the barrel. Do NOT recreate them.
- **Creating `useJournal.ts` for non-existent backend APIs:** The journal aggregation queries (`getOpExByPeriod`, `getOtherByPeriod`) do not exist yet -- they are Phase 49 (P&L Extension). Creating hooks for non-existent APIs will cause TypeScript compilation errors.
- **Using `allowedRoles` when `requiredPermission` is available:** The existing routes use `allowedRoles={["admin"]}` because the permission flags didn't exist when Phases 44-47 were implemented. Now that we're adding permission flags, migrate to `requiredPermission`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Permission checking | Custom `if (role === 'admin')` logic | `ROLE_PERMISSIONS` + `hasPermission()` | Already centralized, works with ProtectedRoute |
| Route protection | Manual auth checks in pages | `<ProtectedRoute requiredPermission={...}>` | Existing pattern, handles redirect |
| Lazy loading | Manual React.lazy | `lazyWithPreload()` from `src/lib/lazyWithPreload.ts` | Adds hover prefetching support |
| Nav filtering | Per-item visibility logic | NavItem[] with permission field, filtered by `hasPermission` | Existing pattern in Header/MobileBottomNav |
| Mutation hooks | Raw `useMutation` with manual toasts | `createMutationHook` factory | Standardized toast handling |

## Common Pitfalls

### Pitfall 1: Creating Duplicate Hooks
**What goes wrong:** CONTEXT.md lists hook creation tasks, but Phases 43-47 already created all the hooks and barrel exports.
**Why it happens:** The CONTEXT was generated from the original spec (Tasks 11-13) which predated Phase 44-47 implementation.
**How to avoid:** Verify each hook exists before creating. All of these already exist: useExpenses, useReimbursements, useAccounts, usePayroll, useBankAccounts.
**Warning signs:** TypeScript duplicate export errors in barrel file.

### Pitfall 2: Creating useJournal.ts for Non-Existent Backend
**What goes wrong:** The CONTEXT lists `useJournal.ts` with `useOpExByPeriod` and `useOtherByPeriod`, but the backend queries don't exist yet (Phase 49).
**Why it happens:** The original plan assumed all hooks would be created in one frontend phase, but the backend for P&L extension hasn't been built.
**How to avoid:** Skip `useJournal.ts` entirely. It will be created when Phase 49 (P&L Extension) provides the backend API.
**Warning signs:** `api.journal` or similar import would fail TypeScript compilation since the module doesn't exist.

### Pitfall 3: Forgetting to Update MobileBottomNav
**What goes wrong:** Expenses are accessible via desktop Header but not mobile nav.
**Why it happens:** Mobile nav is a separate component and easy to overlook.
**How to avoid:** Add expense-related items to MobileBottomNav's `moreItems` array.

### Pitfall 4: Inconsistent Permission Usage Across Routes
**What goes wrong:** Some routes use `allowedRoles` while equivalent routes use `requiredPermission`, leading to confusion.
**Why it happens:** Phases 44-47 used `allowedRoles` as a stopgap because permission flags didn't exist yet.
**How to avoid:** Migrate ALL expense/reimbursement/payroll/bank-accounts routes to use `requiredPermission` in this phase.

### Pitfall 5: Creating Stub Pages That Break Build
**What goes wrong:** ExpenseAnalytics page doesn't exist yet. Creating a `lazyWithPreload` import for it will fail at build time if the page file doesn't exist.
**How to avoid:** Create a minimal stub page (`ExpenseAnalytics.tsx`) that exports a named component. Can be as simple as a PageHeader + "Coming soon" message.

## Existing State Analysis

### What Already Exists (DO NOT Recreate)

**Hooks (all in `src/hooks/convex/` and exported from `index.ts`):**
- `useExpenses.ts` -- useMyExpenses, useExpense, useExpenseStatusHistory, usePendingForApproval, useRejectionChain, useCreateExpenseDraft, useUpdateExpenseDraft, useSubmitExpense, useExpenseUploadUrl, useApproveExpense, useRejectExpense, useVoidExpense
- `useReimbursements.ts` -- useAwaitingPayment, useBatches, useBatchById, useBatchItems, useCreateBatch, useConfirmBatch, useVoidBatch
- `useAccounts.ts` -- useAccounts, useAccount, useCreateAccount, useUpdateAccount, useDeleteAccount
- `usePayroll.ts` -- usePayrollEntries, usePayrollEntry, useCreatePayroll, useVoidPayroll, usePayrollUploadUrl
- `useBankAccounts.ts` -- useBankAccounts, useBankAccount, useCreateBankAccount, useUpdateBankAccount, useDeleteBankAccount, useUpdateBankDetails

**Pages (all in `src/pages/`):**
- `MyExpenses.tsx` -- user's expense history
- `ExpenseSubmit.tsx` -- expense creation form
- `ExpenseApproval.tsx` -- approval queue (manager/admin)
- `ReimbursementManager.tsx` -- batch management (admin)
- `BankAccountsManager.tsx` -- company bank accounts (admin)
- `PayrollManager.tsx` -- payroll entries (admin)
- `AccountsManager.tsx` -- chart of accounts (admin)

**Routes in App.tsx (already registered):**
- `/expenses` -- MyExpenses (bare ProtectedRoute, no permission check)
- `/expenses/new` -- ExpenseSubmit (bare ProtectedRoute)
- `/expenses/approve` -- ExpenseApproval (`allowedRoles={["manager", "admin"]}`)
- `/reimbursements` -- ReimbursementManager (`allowedRoles={["admin"]}`)
- `/bank-accounts` -- BankAccountsManager (`allowedRoles={["admin"]}`)
- `/payroll` -- PayrollManager (`allowedRoles={["admin"]}`)
- `/accounts` -- AccountsManager (`allowedRoles={["admin"]}`)

**Navigation in Header.tsx:**
- Admin dropdown: reimbursements, bank-accounts, payroll (all using `canAccessUsers` permission)
- No expense link for all roles
- No expense-analytics link

### What Needs to Be Done

1. **Add 4 permission flags** to `ROLE_PERMISSIONS` in `src/lib/types.ts`
2. **Migrate routes** from `allowedRoles` to `requiredPermission`:
   - `/expenses` -> `requiredPermission="canSubmitExpenses"`
   - `/expenses/new` -> `requiredPermission="canSubmitExpenses"`
   - `/expenses/approve` -> `requiredPermission="canApproveExpenses"`
   - `/reimbursements` -> `requiredPermission="canManageReimbursements"`
   - `/bank-accounts` -> keep `allowedRoles={["admin"]}` or use `canManageReimbursements` (admin-only either way)
   - `/payroll` -> keep `allowedRoles={["admin"]}` or use `canManageReimbursements` (admin-only either way)
3. **Create ExpenseAnalytics stub page** and register route at `/expense-analytics` with `requiredPermission="canAccessExpenseAnalytics"`
4. **Add navigation links**:
   - Main nav in Header.tsx: add `/expenses` with `canSubmitExpenses` (visible to all roles)
   - Main nav or appropriate dropdown: add `/expense-analytics` with `canAccessExpenseAnalytics`
   - Admin dropdown: update reimbursements from `canAccessUsers` to `canManageReimbursements`
   - MobileBottomNav: add expense items to `moreItems` or `primaryTabs`

## Code Examples

### Adding Permission Flags to ROLE_PERMISSIONS

```typescript
// src/lib/types.ts -- add 4 new fields to the Record type and all role objects
export const ROLE_PERMISSIONS: Record<UserRole, {
  // ... existing 14 fields ...
  canSubmitExpenses: boolean;
  canApproveExpenses: boolean;
  canManageReimbursements: boolean;
  canAccessExpenseAnalytics: boolean;
}> = {
  kitchen: {
    // ... existing fields ...
    canSubmitExpenses: true,
    canApproveExpenses: false,
    canManageReimbursements: false,
    canAccessExpenseAnalytics: false,
  },
  order_staff: {
    // ... existing fields ...
    canSubmitExpenses: true,
    canApproveExpenses: false,
    canManageReimbursements: false,
    canAccessExpenseAnalytics: false,
  },
  manager: {
    // ... existing fields ...
    canSubmitExpenses: true,
    canApproveExpenses: true,
    canManageReimbursements: false,
    canAccessExpenseAnalytics: true,
  },
  admin: {
    // ... existing fields ...
    canSubmitExpenses: true,
    canApproveExpenses: true,
    canManageReimbursements: true,
    canAccessExpenseAnalytics: true,
  },
};
```

### Migrating Routes to requiredPermission

```tsx
// BEFORE (Phase 44-47 stopgap):
<Route path="expenses/approve"
  element={<ProtectedRoute allowedRoles={["manager", "admin"]}><ExpenseApproval /></ProtectedRoute>}
/>

// AFTER (Phase 48):
<Route path="expenses/approve"
  element={<ProtectedRoute requiredPermission="canApproveExpenses"><ExpenseApproval /></ProtectedRoute>}
/>
```

### Minimal Stub Page for ExpenseAnalytics

```tsx
// src/pages/ExpenseAnalytics.tsx
import { PageHeader } from '@/components/layout/PageHeader';

export function ExpenseAnalytics() {
  return (
    <div className="space-y-6">
      <PageHeader title="Expense Analytics" description="OpEx analysis and fraud monitoring" />
      <div className="text-muted-foreground text-center py-12">
        Coming in Phase 50
      </div>
    </div>
  );
}
```

### Adding Nav Items to Header.tsx

```typescript
// Add to mainNavItems for all-role visibility:
{ path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'canSubmitExpenses' },

// Update admin dropdown items:
{ path: '/reimbursements', label: 'Reimburse', icon: Receipt, permission: 'canManageReimbursements' },

// Add expense analytics to mainNavItems or configItems:
{ path: '/expense-analytics', label: 'Exp. Analytics', icon: BarChart3, permission: 'canAccessExpenseAnalytics' },
```

## State of the Art

| Old Approach (Phases 44-47) | Current Approach (Phase 48) | Impact |
|-----------------------------|-----------------------------|--------|
| `allowedRoles={["admin"]}` on routes | `requiredPermission="canManageReimbursements"` | Consistent with rest of app, permission-based not role-based |
| `canAccessUsers` for reimbursement/payroll nav | Dedicated permission flags | Correct access semantics |
| No expense nav link for all roles | `canSubmitExpenses` in mainNavItems | All users can reach expenses from nav |

## Open Questions

1. **Navigation grouping for expenses**
   - What we know: CONTEXT says "Claude's Discretion" on whether to add flat links or a "Finance" submenu
   - What's unclear: Optimal UX with current nav already having 7 mainNavItems + 3 dropdowns
   - Recommendation: Add `/expenses` to mainNavItems (visible to all roles, high-frequency). Add `/expense-analytics` to mainNavItems (manager/admin only, sits next to Sales and Financials). Keep reimbursements/payroll/bank-accounts in Admin dropdown. This avoids adding a new dropdown for just 1-2 items.

2. **Payroll and Bank Accounts route guards**
   - What we know: These are admin-only. CONTEXT mentions using `canManageReimbursements` for payroll nav (spec Section 6.6)
   - What's unclear: Whether payroll deserves its own permission flag
   - Recommendation: Use `canManageReimbursements` for all admin-only finance pages (reimbursements, bank-accounts, payroll, accounts). This keeps the permission surface small and matches the spec's intent. If payroll needs separate permission later, it can be added.

3. **MobileBottomNav expense placement**
   - What we know: Mobile nav has 5 primary tabs + "More" sheet
   - What's unclear: Whether expenses should be a primary tab or in "More"
   - Recommendation: Add expenses to `moreItems` (not primaryTabs) since primaryTabs is already at 5 items and adding more would crowd the bottom bar. Add expense-analytics to moreItems too.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | vitest.config.ts |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERM-01 | canSubmitExpenses flag true for all roles | unit | `npx vitest run tests/unit/permissions.test.ts -t "canSubmitExpenses"` | No -- Wave 0 |
| PERM-02 | canApproveExpenses flag true for manager+admin only | unit | `npx vitest run tests/unit/permissions.test.ts -t "canApproveExpenses"` | No -- Wave 0 |
| PERM-03 | canManageReimbursements flag true for admin only | unit | `npx vitest run tests/unit/permissions.test.ts -t "canManageReimbursements"` | No -- Wave 0 |
| PERM-04 | canAccessExpenseAnalytics flag true for manager+admin | unit | `npx vitest run tests/unit/permissions.test.ts -t "canAccessExpenseAnalytics"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/permissions.test.ts` -- covers PERM-01 through PERM-04 (verify ROLE_PERMISSIONS values)
- Note: Route guard testing is E2E (deferred to future milestone per REQUIREMENTS.md). Permission flag values can be tested as pure data assertions.

## Sources

### Primary (HIGH confidence)
- `src/lib/types.ts` lines 709-789 -- ROLE_PERMISSIONS structure and current 14 flags
- `src/components/auth/ProtectedRoute.tsx` -- `requiredPermission` typed as `keyof typeof ROLE_PERMISSIONS.admin` (dynamic, no changes needed)
- `src/App.tsx` -- all existing routes and their current guards
- `src/components/layout/Header.tsx` -- navigation item arrays and dropdown structure
- `src/components/layout/MobileBottomNav.tsx` -- mobile navigation structure
- `src/hooks/convex/index.ts` -- barrel exports confirming all hooks already exist
- `src/contexts/AuthContext.tsx` -- `hasPermission` implementation

### Secondary (MEDIUM confidence)
- `.planning/phases/48-frontend-permissions-routes/48-CONTEXT.md` -- user decisions (some hook tasks outdated by prior phases)
- `docs/superpowers/plans/2026-03-12-expense-accounting-system.md` Tasks 11-13 -- original plan (predates Phases 44-47 implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- extending existing, well-documented patterns (ROLE_PERMISSIONS, ProtectedRoute, NavItem arrays)
- Pitfalls: HIGH -- verified against actual codebase state; duplicate work risk is real and documented
- Route migration: HIGH -- verified current route guards vs target state

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable -- internal permission system, no external dependencies)
