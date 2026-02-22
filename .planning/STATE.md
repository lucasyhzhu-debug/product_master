# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-22)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.3 — Phase 19 (GoFood Depot Management) next; Phase 20 context captured

## Current Position

Phase: Phase 19 — GoFood Depot Management (In Progress)
Plan: 19-02 complete (2/5 plans done)
Status: Restock suggestion algorithm and product mapping CRUD backend complete
Last activity: 2026-02-22 — Completed 19-02: restock suggestion helper and product mapping CRUD

Progress (v1.3): [██░░░░░░░░] ~10% — Phase 19 plan 02/05 complete

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)

## Accumulated Context

### Roadmap Evolution
- Phase 23 added: Optimize top Convex query reads to reduce production bandwidth

### Decisions

All v1.0–v1.2 decisions archived in PROJECT.md Key Decisions table.

Key decisions affecting v1.3 phases:
- [Phase 17.1]: `gofoodDepotStock` table has no `outletId` field — Phase 19 must extend schema with `outletId` + composite index before any depot tracking work
- [Phase 17.1]: productInventory is simple aggregate (not FIFO); GoFood outlets allow negative stock
- [17-06]: `dispatchConsignmentOutlets` holds Legato outlet data — Phase 21 must decide FK strategy (reuse vs. parallel `externalOutlets` rows) before schema migration
- [Research]: SheetJS 0.20.3 from CDN tarball only — never `npm install xlsx` (registry stuck at abandoned 0.18.5)
- [Research]: `getDailySalesSummary` missing `channel = "direct"` filter — must fix before `getLifetimeTotals` in Phase 22
- [Phase 19]: computeRestockSuggestion uses Math.ceil on avg+buffer; Monday resets to previous Thursday total; initOutletMappingsFromPrevious is idempotent (no-op if target already has mappings)

### Pending Todos

None.

### Blockers/Concerns

- [Phase 19]: `gofoodDepotStock` schema migration resolved (plan 01 schema done); plan 01 task 2 backend functions (transferStock, updated shipment mutations) are in working directory but not committed — should be committed before plan 03 frontend work
- [Phase 21]: Outlet FK strategy for `externalRevenue.outletId` unresolved — inspect `dispatchConsignmentOutlets` data before Phase 21 planning begins
- [Phase 21]: Real Legato Excel file format not yet validated — request sample before Phase 21 Wave 2 frontend work
- [Phase 22]: `getLifetimeTotals` per-product join complexity (N+1 risk for Direct channel via `orderItems`) — needs design review during planning

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 12 | simplify completed orders display - remove overdue tag, show only name, order id, who did it, net price paid, order details, and expedited flag | 2026-02-22 | be8ba38 | | [12-simplify-completed-orders-display-remove](./quick/12-simplify-completed-orders-display-remove/) |
| 13 | add Customers to Config nav dropdown in Header; add inline phone display/edit for selected existing customer in OrderForm | 2026-02-22 | 71d7c8b | | [13-add-phone-number-editing-in-new-order-fo](./quick/13-add-phone-number-editing-in-new-order-fo/) |
| 14 | fix delivery address bugs: updateDetails now syncs deliveryType/pickupLocation via parseDeliveryAddress; WhatsApp templates use address content not stale deliveryType field | 2026-02-22 | 80793a1 | | [14-fix-whatsapp-template-delivery-address](./quick/14-fix-whatsapp-template-delivery-address/) |
| 15 | show order ID in edit order page title: PageHeader reads "Edit Order MMDD-NNN" when editing an order with an orderNumber | 2026-02-22 | d09c8bb | | [15-show-order-id-in-edit-order-page-title](./quick/15-show-order-id-in-edit-order-page-title/) |
| 16 | allow Use Available Inventory on BeingPrepared orders: backend accepts BeingPrepared status, frontend shows panel for both PaymentReceived and BeingPrepared | 2026-02-22 | 65b1613 | | [16-allow-use-from-inventory-in-being-prepar](./quick/16-allow-use-from-inventory-in-being-prepar/) |
| 17 | customer address sync: pre-populate delivery address from customer defaultAddress; address sync checkbox on save; new customers auto-save address | 2026-02-22 | 1dcd7a8 | | [17-customer-address-sync-pre-populate-addre](./quick/17-customer-address-sync-pre-populate-addre/) |
| 18 | delivery fee input field on orders: inline edit on order detail page, finalTotal recalculation, WhatsApp template integration | 2026-02-22 | ef0aba9 | Verified | [18-add-delivery-fee-input-field-to-orders-w](./quick/18-add-delivery-fee-input-field-to-orders-w/) |

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 19-02-PLAN.md — restock suggestion helper and product mapping CRUD
Resume file: None
Resume notes: Phase 19 plan 02 complete. Next is 19-03 (GoFood Depot frontend page). Note: plan 01 task 2 backend changes (transferStock, isSeedRequired in productInventory, updated shipment mutations) exist as uncommitted working-directory changes — these are part of plan 01 scope, not 02.

---
*Last updated: 2026-02-22 - Completed 19-02: restock suggestion algorithm and product mapping CRUD*
