---
phase: quick-32
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/layout/Header.tsx
  - src/components/layout/MobileBottomNav.tsx
  - src/pages/HubPage.tsx
autonomous: true
requirements: [NAV-01]

must_haves:
  truths:
    - "Desktop header shows a Financials dropdown (not inline links) containing 6 items: Income Statement, Expenses, Exp. Analytics, Reimburse, Bank Accts, Payroll"
    - "Desktop header mainNavItems no longer contains Financials, Expenses, or Exp.Analytics as standalone links"
    - "Desktop header adminItems no longer contains Reimburse, Bank Accts, or Payroll"
    - "Mobile Header sheet shows a Financials section label with those 6 items grouped under it"
    - "MobileBottomNav More sheet includes Reimburse, Bank Accts, Payroll grouped near Expenses/Exp.Analytics"
    - "HubPage shows a Financials area card with 6 links, visible to users with canAccessDashboard OR canSubmitExpenses OR canManageReimbursements"
  artifacts:
    - path: "src/components/layout/Header.tsx"
      provides: "Financials dropdown in desktop nav, Financials section in mobile sheet"
      contains: "financialItems"
    - path: "src/components/layout/MobileBottomNav.tsx"
      provides: "Financials items in More sheet"
      contains: "Reimburse"
    - path: "src/pages/HubPage.tsx"
      provides: "Financials area card on hub"
      contains: "Financials"
  key_links:
    - from: "src/components/layout/Header.tsx"
      to: "/financials, /expenses, /expense-analytics, /reimbursements, /bank-accounts, /payroll"
      via: "financialItems array with per-item permission filtering"
      pattern: "financialItems"
    - from: "src/pages/HubPage.tsx"
      to: "/financials, /expenses, /expense-analytics, /reimbursements, /bank-accounts, /payroll"
      via: "HUB_AREAS Financials entry"
      pattern: "title.*Financials"
---

<objective>
Consolidate all financial navigation items (Income Statement, Expenses, Expense Analytics, Reimburse, Bank Accounts, Payroll) under a single "Financials" dropdown in the desktop header, a "Financials" section in the mobile header sheet, add missing items to MobileBottomNav, and create a Financials hub card on HubPage.

Purpose: Reduce top-level nav clutter by grouping 6 financial pages into one dropdown, matching the existing Depots/Config/Admin dropdown pattern.
Output: Updated Header.tsx, MobileBottomNav.tsx, HubPage.tsx
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/layout/Header.tsx
@src/components/layout/MobileBottomNav.tsx
@src/pages/HubPage.tsx
@src/lib/types.ts (ROLE_PERMISSIONS for permission keys)

<interfaces>
<!-- Permission keys from src/lib/types.ts -->
canAccessDashboard    — manager, admin
canSubmitExpenses     — all roles
canAccessExpenseAnalytics — manager, admin
canManageReimbursements — admin only

<!-- Existing dropdown pattern in Header.tsx (Depots example) -->
```typescript
const depotItems: NavItem[] = [
  { path: '/k3mart-cockpit', label: 'K3 Mart', icon: Store, permission: 'canAccessSalesAnalytics' },
  ...
];
// Rendered as: DropdownMenu > DropdownMenuTrigger > DropdownMenuContent > DropdownMenuItem[]
// Active state: isDropdownActive(visibleDepotItems)
```

<!-- HubPage area card pattern -->
```typescript
interface AreaCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  primaryPath: string;
  links: NavLink[];
  visible: (hp: ReturnType<typeof useAuth>["hasPermission"]) => boolean;
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restructure Header.tsx — create Financials dropdown and mobile section</name>
  <files>src/components/layout/Header.tsx</files>
  <action>
1. **Create `financialItems` array** (after `depotItems`, before `configItems`):
   ```typescript
   const financialItems: NavItem[] = [
     { path: '/financials', label: 'Income Statement', icon: FileText, permission: 'canAccessDashboard' },
     { path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'canSubmitExpenses' },
     { path: '/expense-analytics', label: 'Exp. Analytics', icon: BarChart3, permission: 'canAccessExpenseAnalytics' },
     { path: '/reimbursements', label: 'Reimburse', icon: HandCoins, permission: 'canManageReimbursements' },
     { path: '/bank-accounts', label: 'Bank Accts', icon: Landmark, permission: 'canManageReimbursements' },
     { path: '/payroll', label: 'Payroll', icon: DollarSign, permission: 'canManageReimbursements' },
   ];
   ```

2. **Remove from `mainNavItems`:** Delete the three entries with paths `/financials`, `/expenses`, `/expense-analytics`.

3. **Remove from `adminItems`:** Delete the three entries with paths `/reimbursements`, `/bank-accounts`, `/payroll`. The remaining adminItems should be: Products, Vouchers, Users.

4. **Add `visibleFinancialItems`** filtered variable in `Header()` component (after `visibleDepotItems`):
   ```typescript
   const visibleFinancialItems = user
     ? financialItems.filter(item => hasPermission(item.permission))
     : [];
   ```

5. **Desktop nav — add Financials dropdown** after main nav items, before Depots dropdown. Use the exact same DropdownMenu pattern as Depots/Config/Admin. Trigger icon: `FileText`, label: "Financials", chevron. Guard: `visibleFinancialItems.length > 0`.

6. **Mobile sheet — add Financials section** between mainNavItems and Depot Management section. Use the same section label pattern (the `pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider` div). Guard: `visibleFinancialItems.length > 0`. Render each item as a Link with the same styling as other mobile sheet items.

Note: The `FileText`, `Receipt`, `BarChart3`, `HandCoins`, `Landmark`, `DollarSign` icons are already imported. No new imports needed.
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - Desktop header: mainNavItems has 6 items (Home, Sales, Orders, Kitchen, Inventory, Planner) — no Financials/Expenses/Exp.Analytics
    - Desktop header: adminItems has 3 items (Products, Vouchers, Users) — no Reimburse/Bank/Payroll
    - Desktop header: New "Financials" dropdown renders between main items and Depots dropdown with 6 items
    - Mobile sheet: "Financials" section label appears with 6 financial links grouped underneath
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add financial items to MobileBottomNav and Financials card to HubPage</name>
  <files>src/components/layout/MobileBottomNav.tsx, src/pages/HubPage.tsx</files>
  <action>
**MobileBottomNav.tsx:**

1. Add imports for icons not yet imported: `HandCoins`, `Landmark`, `DollarSign`, `FileText` from `lucide-react`.

2. Insert 4 new items into `moreItems` array. Place them right after `Exp. Analytics` (index 1) so all financial items are grouped together:
   ```typescript
   { path: '/financials', icon: FileText, label: 'Income Stmt', permission: 'canAccessDashboard' },
   { path: '/reimbursements', icon: HandCoins, label: 'Reimburse', permission: 'canManageReimbursements' },
   { path: '/bank-accounts', icon: Landmark, label: 'Bank Accts', permission: 'canManageReimbursements' },
   { path: '/payroll', icon: DollarSign, label: 'Payroll', permission: 'canManageReimbursements' },
   ```
   Final order of first 6 items: Expenses, Exp. Analytics, Income Stmt, Reimburse, Bank Accts, Payroll — then K3 Mart, Production, etc.

**HubPage.tsx:**

1. Add imports: `FileText`, `Receipt`, `BarChart3`, `HandCoins`, `Landmark`, `DollarSign` from `lucide-react`.

2. Add a new Financials entry to `HUB_AREAS` array. Insert it AFTER "Sales & Distribution" (index 2) and BEFORE "Configuration" (index 3):
   ```typescript
   {
     title: "Financials",
     description: "Income statement, expense tracking, reimbursements, and payroll.",
     icon: FileText,
     color: "text-amber-500",
     primaryPath: "/financials",
     links: [
       { label: "Income Statement", path: "/financials" },
       { label: "Expenses", path: "/expenses" },
       { label: "Exp. Analytics", path: "/expense-analytics" },
       { label: "Reimburse", path: "/reimbursements" },
       { label: "Bank Accounts", path: "/bank-accounts" },
       { label: "Payroll", path: "/payroll" },
     ],
     visible: (hp) =>
       hp("canAccessDashboard") ||
       hp("canSubmitExpenses") ||
       hp("canManageReimbursements"),
   },
   ```

3. Add corresponding entries to `LINK_ICONS`:
   ```typescript
   "Income Statement": FileText,
   "Expenses": Receipt,
   "Exp. Analytics": BarChart3,
   "Reimburse": HandCoins,
   "Bank Accounts": Landmark,
   "Payroll": DollarSign,
   ```
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npx tsc --noEmit --pretty 2>&1 | head -30 && npm run build 2>&1 | tail -10</automated>
  </verify>
  <done>
    - MobileBottomNav More sheet contains all financial items grouped together (Expenses, Exp.Analytics, Income Stmt, Reimburse, Bank Accts, Payroll)
    - HubPage shows a Financials card (amber color, FileText icon) with 6 links
    - HubPage Financials card visible when user has canAccessDashboard OR canSubmitExpenses OR canManageReimbursements
    - LINK_ICONS has entries for all 6 financial link labels
    - TypeScript compiles, build succeeds
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` succeeds
3. Visual check: Desktop nav shows "Financials" dropdown between main items and "Depots" dropdown
4. Visual check: Mobile sheet has "Financials" section with 6 grouped items
5. Visual check: HubPage has a Financials card between Sales & Distribution and Configuration
</verification>

<success_criteria>
- `npm run build` passes
- Desktop header: 6 main items + Financials dropdown (6 items) + Depots + Config + Admin (3 items)
- Mobile header sheet: Financials section with 6 items between main nav and Depot Management
- MobileBottomNav More: Financial items grouped together (6 items)
- HubPage: Financials area card with 6 links, amber icon, correct visibility rule
- No orphaned nav items (all 6 financial pages reachable from every nav surface)
</success_criteria>

<output>
After completion, create `.planning/quick/32-create-financials-dropdown-nav-with-expe/32-SUMMARY.md`
</output>
