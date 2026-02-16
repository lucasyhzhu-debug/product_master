# Requirements: Frollie Recipe Master v1.1

**Defined:** 2026-02-15
**Core Value:** Production reliability — single source of truth for recipes, orders, kitchen production, and inventory

## v1.1 Requirements

Requirements for v1.1 "Stabilization & QoL". Each maps to roadmap phases.

### API & Integration (API)

- [ ] **API-01**: Admin can view token health and sync status for all platforms (K3Mart, GoBiz) on the existing Sales Analytics settings page
- [ ] **API-02**: GoBiz token kept alive via Convex cron that calls refresh token endpoint every ~30 minutes. Manual cookie paste from DevTools remains the initial setup method (one-time). Password grant login is NOT viable (API blocks non-browser clients). If refresh token chain breaks, admin re-pastes from DevTools.
- [ ] **API-03**: Dashboard shows sync health alert when GoFood or K3Mart sync fails for 6+ hours. Alert visible to manager/admin on main dashboard.
- [ ] **API-04**: GoFood Crystal outlet (G347061572) syncs revenue alongside Goldfinch (G293156297). POC script already maps both merchant IDs.
- [ ] **API-05**: Unified product mapping system: external platform products (GoFood, K3Mart) auto-match to internal menuProducts by product type (Original→Original, Triple→Triple, Jumbo→Jumbo), independent of price differences (e.g., GoFood Triple at 120k maps to internal Triple at 110-115k). Auto-match saves initial mapping; admin can edit/add/delete mappings via UI. Covers all platforms and both GoFood outlets (Crystal + Goldfinch).
- [ ] **API-06**: All external API calls, SOPs, and processes documented with automation status. Use existing docs/apiS/ folder as source. Document refresh token flow from POC.

### Order Management (ORD)

- [ ] **ORD-01**: Order management uses Kanban board UI with ~5-6 grouped columns. Groupings: Awaiting Payment (Draft + AwaitingPayment), Confirmed (Confirmed), In Kitchen (InProduction + Boxed + Labeled), Waiting for Delivery (merged WaitingDelivery), Complete (merged Complete). Horizontal scroll on mobile.
- [ ] **ORD-02**: Order creation is a separate dedicated section/page from the Kanban board. Current split-screen (form left, queue right) replaced with: one view for creating orders, another for the Kanban board.
- [ ] **ORD-03**: Status simplification — merge WaitingShipment + WaitingPickup into single "WaitingDelivery" status. Merge CompleteShipped + PickedUp into single "Complete" terminal status. Schema migration required. Affects: statusTransitions.ts, whatsapp.ts, kitchen visibility, all UI status references.
- [ ] **ORD-04**: Quick-add address buttons for Crystal and Goldfinch locations. Orders to these addresses = self-pickup by order creator (whoever made the order is responsible for delivery).
- [ ] **ORD-05**: Customer name and phone input moved to top of order creation form (currently below items)
- [ ] **ORD-06**: Due date uses day-name quick-tap pills (Today, Tomorrow, Saturday, Sunday, Monday...) instead of date picker. Still allow manual date entry as fallback.
- [ ] **ORD-07**: Order cards show discounted total prominently with discount amount and smaller struck-through gross price
- [ ] **ORD-08**: Every order status change records who changed it and when (audit trail). Stored in database, viewable in order detail.

### Kitchen (KIT)

- [ ] **KIT-01**: New dashboard summary header above existing swipeable batch panels. Shows key metrics at a glance before kitchen staff swipes into production/boxing/stickering/packing panels. Existing batch panels (ProductionLog, Boxing, Stickering, Packing) remain unchanged.
- [ ] **KIT-02**: Dashboard header shows minimum target today — auto-calculated from confirmed/in-production orders with dueDate = today. Manager can manually adjust this value.
- [ ] **KIT-03**: Dashboard header shows max production target — default 200 balls (101 single originals + 99 singles for original-triples; no jumbo target by default). Both max target and composition are configurable by manager.
- [ ] **KIT-04**: Dashboard header shows remaining balls needed to hit today's minimum target (minimum target minus balls produced so far)
- [ ] **KIT-05**: Dashboard header shows count of orders left to complete (non-terminal orders)
- [ ] **KIT-06**: K3Mart demand appears in kitchen as synthetic "order" — auto-generated from confirmed K3Mart dispatch plans (linked to K3M-05). Manager can override/adjust the quantity. Shows as e.g. "K3Mart — 75 Original packages" alongside real orders.
- [ ] **KIT-07**: Kitchen orders shown with due-date group headers ("Due Today (2)", "Due Tomorrow (4)", "Due Saturday (6)"). Each order's items have a production checklist so kitchen can track which items are done.
- [ ] **KIT-08**: Manager can override "unavailable" inventory with reason (manager role required). Existing stock shortage override dialog from Phase 4 may cover this — verify.

### K3Mart Cockpit (K3M)

- [ ] **K3M-01**: Complete cockpit stub implementations (K3MART-01 through K3MART-06) with real data from backend queries
- [ ] **K3M-02**: Weekly calendar view reorganized as outlet-first — select/tab an outlet, then see all products for that outlet across the 7-day grid. Current product-first with outlet-rows layout replaced.
- [ ] **K3M-03**: Holidays and weekends highlighted in weekly planning grid with adjusted suggested quantities (already partially implemented via indonesianHolidays.ts)
- [ ] **K3M-04**: Manager can record manual stock in/out during the day without full dispatch planning (forms already partially exist)
- [ ] **K3M-05**: Confirmed dispatch plans auto-push demand to kitchen as synthetic orders (linked to KIT-06). Manager confirms plan in cockpit -> synthetic kitchen order created/updated.

### UI Brand Verification (UIB)

- [x] **UIB-01**: Brand reference doc verified as current for v1.1; any new pages (Kanban board, kitchen dashboard header, outlet calendar) follow teal brand, Inter typography, dark mode

## Clarification Log

Decisions made during requirements review (2026-02-15):

| Topic | Decision | Rationale |
|-------|----------|-----------|
| GoBiz auth | Manual paste once + cron refresh every 30min | Password grant blocked by API (non-browser detection). Refresh token keeps session alive indefinitely. |
| Kitchen UX | Dashboard header above existing panels | Kitchen staff need both batch production view AND order tracking. New header adds metrics without disrupting existing workflow. |
| K3Mart calendar | Outlet-first view | User wants to see per-outlet dispatch across the week, not per-product across outlets |
| Status merge | Merge both waiting + terminal pairs | WaitingShipment+WaitingPickup -> WaitingDelivery, CompleteShipped+PickedUp -> Complete. Simplifies schema and UI. |
| Kanban columns | ~5-6 grouped columns | 8 individual columns too wide. Group related statuses. |
| Kitchen targets | Both configurable | Max target (default 200) and minimum target are both manager-adjustable |
| K3Mart synthetic orders | Auto from dispatch + manual override | Confirmed dispatch plans auto-create kitchen orders; manager can adjust quantity |
| Product mapping | Unified auto-match + admin-editable for all platforms | GoFood prices differ from internal (Triple 120k vs 110-115k). Match by product type not price. Auto-match first, admin can correct. Covers GoFood + K3Mart. |

## v1.2 Requirements

Deferred from v1.1. Tracked for next milestone.

### Order Page (deferred)
- **ORD-D01**: Order page refactored for direct sales optimization
- **ORD-D02**: Consignment flow with separate revenue recognition

### Customer Management (deferred)
- **CUST-01**: Customer details management page with edit capability
- **CUST-02**: Historical orders shown per customer
- **CUST-03**: Duplicate customer merge/link

### Sales Pipeline (deferred)
- **CRM-01**: Lead/cafe tracking list
- **CRM-02**: Outreach history per lead
- **CRM-03**: Simple CRM pipeline view

### Feedback Overlay (deferred)
- **FB-01**: Fix element identification (component name, data-testid, aria-label)
- **FB-02**: Re-enable feedback overlay in Layout.tsx

### Sales Channel Consolidation (deferred)
- **SCH-01**: Manual sales entry for non-API platforms (Tamtem, Legato Goldfinch, Shopee, TikTok Shop) with per-outlet revenue input
- **SCH-02**: Per-outlet commission rate configuration for non-API platforms (Legato Goldfinch = 10%, Legato Tamtem = 17%)

### Voucher System (deferred)
- **VCH-01**: Line-item specific voucher codes — per-product discounts (e.g., "10k off per Original product") instead of order-level percentage. Significant voucher system rework.

### Financial Reporting (deferred)
- **FIN-01**: Payment channel tracking on orders (BCA/QRIS/Cash) — removed in v1.1 Phase 14 for simplicity, revisit if financial reporting needs it
- **FIN-02**: Sales channel tracking on orders (GoFood/Direct/K3Mart) — removed in v1.1 Phase 14; GoFood/K3Mart tracked via sync systems but no per-order attribution

### Kitchen UX (deferred)
- **KUX-01**: Audio/visual alert for new kitchen orders — notification when new order enters kitchen queue
- **KUX-02**: Batch production panel redesign — existing panels unchanged in v1.1, may need modernization
- **KUX-03**: Historical production analytics and trends — production data over time for planning

### Notifications (deferred)
- **NTF-01**: Centralized notification bell — icon near account/logout consolidating key alerts (pending orders, low stock, sync failures) with actionable links. Requires notification aggregation system, read/unread state, entity linking.

### Tech Debt (deferred)
- **TDT-01**: Migrate complex entities (orders, inventory, kitchen, recipes, packaging, products, vouchers) to backend factory pattern — Phase 5 covered simple entities only

## Out of Scope

| Feature | Reason |
|---------|--------|
| GoBiz programmatic login (password grant) | API blocks non-browser clients; manual paste + refresh cron is sufficient |
| Full GoFood POS integration (accept orders) | Requires GoFood Facilitator Model partnership; massive scope for 2 outlets |
| Automated K3Mart stock reorder | Risky without human review; suggest-then-confirm pattern is correct |
| Real-time GoFood order notifications | GoBiz has no webhook support; polling cron is sufficient |
| Full calendar component (month view) | Over-engineered for a 7-column weekly grid |
| Mobile app (React Native) | Responsive web design covers kitchen mobile use |
| Multi-language i18n | All users are Indonesian staff comfortable with English UI |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UIB-01 | Phase 12 | Complete |
| API-01 | Phase 13 | Pending |
| API-02 | Phase 13 | Pending |
| API-03 | Phase 13 | Pending |
| API-04 | Phase 13 | Pending |
| API-05 | Phase 13 | Pending |
| API-06 | Phase 13 | Pending |
| ORD-01 | Phase 14 | Pending |
| ORD-02 | Phase 14 | Pending |
| ORD-03 | Phase 14 | Pending |
| ORD-04 | Phase 14 | Pending |
| ORD-05 | Phase 14 | Pending |
| ORD-06 | Phase 14 | Pending |
| ORD-07 | Phase 14 | Pending |
| ORD-08 | Phase 14 | Pending |
| KIT-01 | Phase 15 | Pending |
| KIT-02 | Phase 15 | Pending |
| KIT-03 | Phase 15 | Pending |
| KIT-04 | Phase 15 | Pending |
| KIT-05 | Phase 15 | Pending |
| KIT-06 | Phase 15 | Pending |
| KIT-07 | Phase 15 | Pending |
| KIT-08 | Phase 15 | Pending |
| K3M-01 | Phase 16 | Pending |
| K3M-02 | Phase 16 | Pending |
| K3M-03 | Phase 16 | Pending |
| K3M-04 | Phase 16 | Pending |
| K3M-05 | Phase 16 | Pending |

**Coverage:**
- v1.1 requirements: 29 total (was 30, merged API-02/API-03 into single API-02)
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after Q&A clarification session*
