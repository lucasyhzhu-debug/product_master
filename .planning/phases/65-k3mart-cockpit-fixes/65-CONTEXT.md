# Phase 65: K3Mart Cockpit Fixes - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix three specific K3Mart cockpit issues: ensure stock-in/stock-out API calls push correct product pricing, remove the broken History tab to simplify the cockpit, and refresh the outlet list to reflect only the 4 currently active outlets. The cockpit should be lean — dashboard + stock operations only.

</domain>

<decisions>
## Implementation Decisions

### K3M-01: Price on Stock Flows
- **D-01:** Price must be explicitly passed from the frontend to the `submitStockFlow` action — not sourced from a secondary dashboard API call inside the action. Add `price` to the items array in both action args and frontend call.
- **D-02:** The stock flow form must show an editable price field, pre-populated from `K3MART_CONFIG.productMap` (80,000 IDR for Jumbo/47068, 45,000 IDR for Cookie/47069). User can override before submission.
- **D-03:** Block submission if price is 0 or missing. The user must confirm pricing before any stock flow goes to the K3Mart API.

### K3M-02: History Tab Removal
- **D-04:** Remove the History tab from the K3Mart cockpit entirely. Delete `StockMovementHistory.tsx` component and all references. Update K3M-02 success criterion to: "History tab removed — cockpit focuses on dashboard and stock-in/out operations."
- **D-05:** Remove the `fetchStockFlowHistory` and `fetchStockFlowDetail` actions from `adapter.ts` since they're no longer needed by any UI. Keep `fetchAllStockFlowHistory` only if used elsewhere (check before removing).

### K3M-03: Outlet List Refresh
- **D-06:** Use DB-driven outlet management via `externalOutlets` table with `isActive` flag as source of truth. The `by_source_active` index already exists and queries already filter on it.
- **D-07:** Soft-delete stale outlets (set `isActive=false`) — do NOT hard-delete. Preserves historical stock movement and revenue data references. Stale outlets: Gading Serpong (45), Kota Kasablanka (48), LM Nusantara (78), Tamtem (81).
- **D-08:** Keep `K3MART_OUTLET_NAMES` in config.ts as a name resolution map (API ID → display name) but it is NOT the source of truth for which outlets are active.

### Claude's Discretion
- Cleanup of any orphaned History-related state/hooks in `useK3MartCockpit.ts`
- Whether to add a migration script or one-time mutation to deactivate the 4 stale outlets
- Error message wording for blocked 0-price submissions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### K3Mart Integration
- `convex/integrations/k3mart/config.ts` — API config, product IDs, prices, outlet name map, all K3Mart TypeScript interfaces
- `convex/integrations/k3mart/adapter.ts` — All K3Mart API actions (submitStockFlow at line 659, fetchStockFlowHistory at line 989)
- `convex/integrations/k3mart/helpers.ts` — Helper utilities for K3Mart data transforms

### K3Mart Cockpit Backend
- `convex/k3martCockpit/mutations.ts` — Stock movement recording, dispatch plan management
- `convex/k3martCockpit/queries.ts` — Outlet stock summary, dispatch planner queries
- `convex/k3martCockpit/queryHelpers/stockHelpers.ts` — Stock data aggregation helpers

### K3Mart Cockpit Frontend
- `src/pages/K3MartCockpit.tsx` — Main cockpit page (submitStockFlow call at line 189)
- `src/hooks/convex/useK3MartCockpit.ts` — Hook wrapping K3Mart actions/queries
- `src/components/k3martCockpit/StockMovementHistory.tsx` — Component to DELETE (K3M-02)
- `src/components/k3martCockpit/StockFlowConfirmDialog.tsx` — Stock flow confirmation dialog (add price field here)
- `src/components/k3martCockpit/OutletCard.tsx` — Outlet display card
- `src/components/k3martCockpit/OutletStockDetail.tsx` — Outlet stock detail view

### Schema
- `convex/schema.ts` — `externalOutlets` table (isActive field), `k3martStockMovements` table

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StockFlowConfirmDialog.tsx` — Already handles stock flow confirmation UX, extend it with editable price input
- `OutletCard.tsx` — Renders individual outlet cards, already respects outlet data from queries
- `K3MART_CONFIG.productMap` — Hardcoded price lookup (47068→80K, 47069→45K) for price pre-population

### Established Patterns
- `externalOutlets` table uses `by_source_active` compound index for filtering active outlets by source
- `submitStockFlow` action uses dashboard API for price/stock verification — this pattern changes to frontend-passed price
- Stock movements recorded via `internal.k3martCockpit.mutations.recordStockMovement` after API success

### Integration Points
- `K3MartCockpit.tsx` calls `submitStockFlow` via `useSubmitStockFlow()` hook — items array needs price field added
- `StockFlowConfirmDialog` is where the editable price input should go
- Outlet stock queries filter on `isActive` already — deactivating outlets should automatically hide them from cockpit

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants the cockpit to be **lean**: dashboard + stock-in/out only, no history tab
- Price must be **visible and editable** in the stock flow form — user wants to confirm pricing before submission, not trust a backend API call they can't see
- The bug is specifically that the frontend shows price but it never makes it to the API payload — the `items` array in `submitStockFlow` args lacks a `price` field

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 65-k3mart-cockpit-fixes*
*Context gathered: 2026-03-28*
