---
name: Quick Task 260417-hyv Plan
description: Regroup Header.tsx nav into 5 top-level slots (Dashboards/Orders/Ops/Finances & Accounting/Config)
type: plan
quick_id: 260417-hyv
must_haves:
  truths:
    - Header desktop nav shows exactly 5 top-level items for authenticated users (not counting user pill): Dashboards, Orders, Ops, Finances & Accounting, Config.
    - Orders is the only top-level non-dropdown nav link.
    - No route paths, permission keys, or rolesAllowed values change — every item keeps the exact permission/rolesAllowed it had before.
    - Every item currently in the header is still reachable via the new dropdowns (no item dropped).
    - Preload hooks still fire on hover/focus for Orders, Kitchen, Inventory, Planner, GoFood Depot.
    - npm run type-check passes with zero errors.
    - npm run build succeeds.
  artifacts:
    - src/components/layout/Header.tsx (edited)
  key_links:
    - src/components/layout/Header.tsx
    - src/lib/types.ts
    - src/App.tsx
---

# Plan: Nav Bar Simplification

**Branch:** `feature/999.4-channel-integration-spec` (current quick task branch — no new branch)
**Checkpoints:** single atomic commit per task.

## Implementation Waves

### Wave 1: Edit Header.tsx [SEQUENTIAL]

| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder (via gsd-executor) | T1: Regroup nav arrays and render blocks | `src/components/layout/Header.tsx` |

### Wave 2: Verification [SEQUENTIAL]

| Agent | Task |
|-------|------|
| Bash | `npm run type-check` |
| Bash | `npm run build` |

## Tasks

### T1 — Regroup Header.tsx nav

**files:**
- `src/components/layout/Header.tsx`

**action:**

1. **Rework module-scope arrays** (replace the existing `mainNavItems`, `financialItems`, `accountingItems`, `depotItems`, `configItems`, `adminItems`):
   ```ts
   // Top-level array: Orders only
   const mainNavItems: NavItem[] = [
     { path: '/orders', label: 'Orders', icon: ShoppingCart, permission: 'canAccessOrders', preload: _prefetchOrders },
   ];

   // Dashboards dropdown
   const dashboardItems: NavItem[] = [
     { path: '/sales', label: 'Sales', icon: TrendingUp, permission: 'canAccessSalesAnalytics' },
     { path: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'canAccessDashboard' },
   ];

   // Ops dropdown: kitchen, inventory, planner, my-perf, depots
   const opsItems: NavItem[] = [
     { path: '/kitchen', label: 'Kitchen', icon: UtensilsCrossed, permission: 'canAccessKitchen', preload: _prefetchKitchen },
     { path: '/my-performance', label: 'My Performance', icon: UserCheck, permission: 'canAccessKitchen', rolesAllowed: ['kitchen', 'order_staff'] },
     { path: '/inventory', label: 'Inventory', icon: Warehouse, permission: 'canAccessInventory', preload: _prefetchInventory },
     { path: '/restock-planner', label: 'Planner', icon: CalendarRange, permission: 'canAccessDashboard', preload: _prefetchRestock },
     { path: '/k3mart-cockpit', label: 'K3 Mart', icon: Store, permission: 'canAccessSalesAnalytics' },
     { path: '/gofood-depot', label: 'GoFood Depot', icon: Truck, permission: 'canAccessDashboard', preload: _prefetchGoFood },
     { path: '/grabfood', label: 'GrabFood', icon: UtensilsCrossed, permission: 'canAccessSalesAnalytics' },
   ];

   // Finances & Accounting dropdown: merged financial + accounting items, in their existing order
   const financeItems: NavItem[] = [
     // financials group
     { path: '/financials', label: 'Income Statement', icon: FileText, permission: 'canAccessDashboard' },
     { path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'canSubmitExpenses' },
     { path: '/expenses/approve', label: 'Approvals', icon: ClipboardCheck, permission: 'canApproveExpenses' },
     { path: '/expense-analytics', label: 'Exp. Analytics', icon: BarChart3, permission: 'canAccessExpenseAnalytics' },
     { path: '/reimbursements', label: 'Reimburse', icon: HandCoins, permission: 'canManageReimbursements' },
     { path: '/payroll', label: 'Payroll', icon: DollarSign, permission: 'canManageReimbursements' },
     { path: '/staff-performance', label: 'Staff Perf.', icon: UserCheck, permission: 'canAccessDashboard' },
     { separator: true },
     // accounting group
     { path: '/journal', label: 'Journal Entry', icon: BookMarked, permission: 'canManageReimbursements' },
     { path: '/accounts', label: 'Chart of Accounts', icon: Landmark, permission: 'canManageReimbursements' },
     { path: '/bank-accounts', label: 'Bank Accounts', icon: Landmark, permission: 'canManageReimbursements' },
     { path: '/bank-reconciliation', label: 'Bank Reconciliation', icon: Landmark, rolesAllowed: ['manager', 'admin'] },
     { path: '/bank-rules', label: 'Bank Rules', icon: BookMarked, rolesAllowed: ['admin'] },
     { path: '/import', label: 'Historical Import', icon: FileUp, permission: 'canManageReimbursements' },
     { path: '/assets', label: 'Asset Register', icon: Building2, permission: 'canAccessAssets' },
   ];

   // Config dropdown: existing config items + Help + Admin items (separator between groups)
   const configItems: NavItem[] = [
     { path: '/help', label: 'Help', icon: CircleHelp },
     { separator: true },
     // existing config group
     { path: '/components/production', label: 'Production', icon: Circle, permission: 'canAccessInventory' },
     { path: '/ingredients', label: 'Ingredients', icon: Leaf, permission: 'canAccessIngredients' },
     { path: '/inventory/locations', label: 'Locations', icon: MapPin, permission: 'canAccessInventory' },
     { path: '/whatsapp-templates', label: 'WhatsApp', icon: MessageSquare, permission: 'canManageWhatsAppTemplates' },
     { path: '/customers', label: 'Customers', icon: Users, permission: 'canAccessOrders' },
     { path: '/bulk-price-update', label: 'Bulk Prices', icon: Calculator, permission: 'canAccessIngredients' },
     { separator: true },
     // admin group
     { path: '/menu-products', label: 'Products', icon: Tag, permission: 'canAccessMenuProducts' },
     { path: '/vouchers', label: 'Vouchers', icon: Ticket, permission: 'canAccessVouchers' },
     { path: '/users', label: 'Users', icon: Users, permission: 'canAccessUsers' },
     { path: '/settings/business', label: 'Settings', icon: Settings, permission: 'canAccessBusinessSettings' },
   ];
   ```

2. **Extend `NavItem` type** to support a separator marker:
   ```ts
   type NavItem = {
     path?: string;
     label?: string;
     icon?: React.ComponentType<{ className?: string }>;
     permission?: PermissionKey;
     rolesAllowed?: UserRole[];
     preload?: () => void;
     separator?: boolean;
   };
   ```
   The existing items always set `path`/`label`/`icon` so downstream type narrowing is safe — add guards in the render code where needed.

3. **Update `visibleXItems` filters** — same shape, one per new array: `visibleDashboardItems`, `visibleOpsItems`, `visibleFinanceItems`, `visibleConfigItems`. Filters must:
   - Keep separator entries even if nothing surrounds them would be odd — filter out separators that have no *permitted* item following them (to avoid a trailing divider). Simple rule: after filtering by permission, collapse any run of leading/trailing separators and any adjacent separators.
   - The existing permission-gate function ignores separators (they have no `permission`/`rolesAllowed`), so include an early `if (item.separator) return true;` in each filter.

   Recommended helper (define once near the top of the component):
   ```ts
   const trimSeparators = (items: NavItem[]): NavItem[] => {
     const out: NavItem[] = [];
     for (const it of items) {
       if (it.separator) {
         if (out.length === 0 || out[out.length - 1].separator) continue;
         out.push(it);
       } else {
         out.push(it);
       }
     }
     while (out.length && out[out.length - 1].separator) out.pop();
     return out;
   };
   ```
   Apply after filtering: `trimSeparators(dashboardItems.filter(...))` etc.

4. **Replace the 5 existing dropdown JSX blocks** with 4 new ones (Dashboards, Ops, Finances & Accounting, Config). Each renders `item.separator ? <DropdownMenuSeparator /> : <Link>…</Link>`. Reuse existing hover-prefetch pattern inside the `Link` for items that have `preload`.

5. **Mobile sheet:** replace the 5 labeled sections (Financials, Accounting, Depot Management, Configurations, Admin) with 4 labeled sections matching the new dropdown names. Render separators as `<div className="h-px bg-border my-2" />`. Add a new "Dashboards" and "Ops" section. Remove section labels that no longer exist.

6. **Imports:**
   - Add `LayoutDashboard`, `Boxes` from `lucide-react` (for Dashboards and Ops dropdown-trigger icons).
   - Remove `Shield` (Admin no longer has its own dropdown).
   - Keep all other icons — they're still referenced by individual items.

7. **Dropdown-trigger labels & icons:**
   - Dashboards → icon `LayoutDashboard`, label `Dashboards`
   - Ops → icon `Boxes`, label `Ops`
   - Finances & Accounting → icon `Landmark`, label `Finance`  *(compact label to fit nav width; full name reads awkward in horizontal chrome. Dropdown header stays self-evident from items.)*
   - Config → icon `Settings`, label `Config` (unchanged)

   > Note: per CONTEXT.md the label is `Finances & Accounting`. The plan uses `Finance` as a 1-word compact alias in the nav chip. If the user prefers the full label, the executor swaps the string. Default → `Finance`.

**verify:**
- `grep` shows no reference to `financialItems`, `accountingItems`, `depotItems`, `adminItems`, or the old 5 dropdown JSX blocks.
- Desktop renders: `Dashboards ▾  Orders  Ops ▾  Finance ▾  Config ▾` for admin users.
- Each dropdown opens and each item links to the same route it did before the refactor (spot-check: `/sales`, `/kitchen`, `/gofood-depot`, `/bank-reconciliation`, `/help`, `/users`).
- For a `kitchen` user, Ops dropdown shows `Kitchen`, `My Performance` only (other perms gated out); other dropdowns empty and therefore not rendered.
- `npm run type-check` passes.
- `npm run build` passes.

**done:**
- `src/components/layout/Header.tsx` has exactly one top-level item (Orders) and 4 dropdowns (Dashboards, Ops, Finance, Config) in that order.
- All 27 existing nav links still reachable through the new structure.
- No permission gates removed or changed.
- Mobile sheet mirrors desktop.
- Build + type-check green.

## Documentation Updates
- [x] `docs/CHANGELOG.md` — add `- Quick task 260417-hyv: Simplified nav bar (5 top-level slots)` entry (handled by workflow step 9).

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Desktop nav has exactly 5 visible slots for admin + user pill
- [ ] Every previous nav route reachable via the new structure
- [ ] Permissions & rolesAllowed unchanged per item
