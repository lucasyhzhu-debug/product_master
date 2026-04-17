---
name: Quick Task 260417-hyv Context
description: Locked decisions for nav bar simplification quick task
type: context
---

# Quick Task 260417-hyv: Nav Bar Simplification — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Task Boundary

Simplify `src/components/layout/Header.tsx` nav bar by regrouping existing items. No new routes, no permission changes, no backend work.

**Regrouping map:**
- Sales + Analytics → new **Dashboards** dropdown
- Kitchen + Inventory + Planner + My Perf. + (K3 Mart, GoFood Depot, GrabFood) → new **Ops** dropdown
- Financials + Accounting → merged **Finances & Accounting** dropdown
- Current Config + Help + Admin → merged **Config** dropdown
- **Orders** remains top-level (only top-level transactional page)

Desktop result: `Dashboards ▾  Orders  Ops ▾  Finances & Accounting ▾  Config ▾  [UserMenu]`

Mobile sheet mirrors desktop: update section headers & contents to match.
</domain>

<decisions>
## Implementation Decisions

### Orders / Planner / My Perf placement
- Planner (`/restock-planner`) moves into **Ops** dropdown.
- My Perf (`/my-performance`) moves into **Ops** dropdown (still gated by `rolesAllowed: ['kitchen','order_staff']`).
- Orders stays top-level.

### Admin + Help folded into Config
- All Admin items (Products, Vouchers, Users, Business Settings) + Help flatten into the single **Config** dropdown.
- Use a `DropdownMenuSeparator` between the existing Config group and the Admin group to keep mental grouping. Help sits at the top of the dropdown (or bottom — executor's call, keep it near a natural position).
- Permission gates carry over unchanged (each item keeps its `permission` / `rolesAllowed`).

### Depots folded into Ops
- K3 Mart, GoFood Depot, GrabFood flatten directly into **Ops** dropdown alongside Kitchen + Inventory + Planner + My Perf. No nested subsection.
- Preload hooks preserved (`_prefetchGoFood`, `_prefetchKitchen`, `_prefetchInventory`, `_prefetchRestock`).

### Group labels & icons
- **Dashboards** (icon: `LayoutDashboard` or reuse `BarChart3`).
- **Ops** (icon: `UtensilsCrossed` — reflects kitchen-first operations, or `Boxes`).
- **Finances & Accounting** — long label; acceptable because it replaces 2 dropdowns (net -1 top-level item). Icon: `Landmark` or `FileText`.
- **Config** — reuse existing `Settings` icon.

### Claude's Discretion
- Exact icon choice for Dashboards / Ops / Finances & Accounting — pick what reads best alongside existing icons.
- Ordering of items within each dropdown — keep current relative order; new items appended in the order they came from their old group.
- Whether to drop the `Depot Management` / `Financials` / `Accounting` / `Admin` mobile-sheet section headers (likely yes, since they no longer correspond to top-level dropdowns).

</decisions>

<specifics>
## Specific Ideas

Reference screenshot shows current state:
`Sales  Analytics  Orders  Kitchen  Inventory  Planner  Help  Financials ▾  Accounting ▾  Depots ▾  Config ▾  Admin ▾  Lucas`

Target state:
`Dashboards ▾  Orders  Ops ▾  Finances & Accounting ▾  Config ▾  Lucas`

Net reduction: 13 slots → 5 slots + user pill.

</specifics>

<canonical_refs>
## Canonical References

- `src/components/layout/Header.tsx` — ONLY file to change
- `src/lib/types.ts` — `ROLE_PERMISSIONS` / `PermissionKey` (read-only, informs gating)
- `src/App.tsx` — route paths (no change needed; nav is display-only reshuffle)

No new routes or perm keys. No backend impact.

</canonical_refs>
