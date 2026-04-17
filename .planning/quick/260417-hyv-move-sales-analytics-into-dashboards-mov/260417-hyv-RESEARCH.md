---
name: Quick Task 260417-hyv Research
description: Navigation reshuffle — implementation research
type: research
---

# Research: Nav Bar Simplification

**Scope:** Pure UI reshuffle in a single file (`src/components/layout/Header.tsx`). No libraries, no API, no schema.

## Current architecture

Header holds 6 item arrays at module scope:
`mainNavItems` (8 top-level), `financialItems`, `accountingItems`, `depotItems`, `configItems`, `adminItems`.

Each array is filtered per-render into `visibleXItems` using `hasPermission(item.permission)` and optional `rolesAllowed`. Render block per array is ~30 lines of dropdown JSX — identical shape for all 5 dropdowns.

Mobile sheet mirrors desktop with a section header + item-map per group (~25 lines each).

## Implementation approach

1. **Collapse arrays:**
   - `dashboardItems` = [Sales, Analytics]
   - `opsItems` = [Kitchen, My Perf, Inventory, Planner, K3 Mart, GoFood, GrabFood]
   - `financeItems` = [...financialItems, ...accountingItems] (merged)
   - `configItems` = [Help, ...existing configItems, separator, ...adminItems]
   - `mainNavItems` = [Orders] only

2. **Add a `separator?: true` marker** to `NavItem` type so Config can emit `<DropdownMenuSeparator />` mid-list. Mobile sheet can render it as a divider `<div className="border-t my-2" />`.

3. **Render order (desktop):** Dashboards ▾ → Orders (top-level) → Ops ▾ → Finances & Accounting ▾ → Config ▾.

4. **Icons to import:** `LayoutDashboard` (Dashboards), `Boxes` (Ops). Keep `FileText`/`Calculator`/`Settings`/`Shield` → drop unused (`Shield`, `CircleHelp` kept for Help item, `BookMarked`, `Landmark` still used per-item).

5. **Drop unused imports** after collapse (e.g., remove duplicate dropdown JSX blocks). Run TypeScript to catch strays.

## Pitfalls

- **Permission gating must remain per-item, not per-group** — some items have different perms than their group's umbrella (e.g., `canSubmitExpenses` vs `canManageReimbursements` in old Financials).
- **`rolesAllowed` must survive** the regrouping for: `My Perf` (`kitchen`/`order_staff`), Bank Reconciliation (`manager`/`admin`), Bank Rules (`admin`).
- **Preload hooks** (`_prefetchKitchen`, `_prefetchInventory`, `_prefetchRestock`, `_prefetchGoFood`, `_prefetchOrders`) must still fire on hover/focus after the item moves.
- **Mobile sheet** currently has 6 labeled sections — collapse to 5 (Dashboards, Orders-less section for Orders link, Ops, Finances & Accounting, Config).
- **isDropdownActive** helper already works on any items array — no changes needed.

## Out of scope

- No route changes in `src/App.tsx`.
- No permission key changes in `src/lib/types.ts`.
- No new shadcn/ui primitives.
- No tests exist for Header (per grep); none added — matches existing practice.
