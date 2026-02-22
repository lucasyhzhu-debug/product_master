# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-22)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.3 — Phase 20 (Bandwidth Optimization) in progress; 4/8 plans done

## Current Position

Phase: Phase 20 — Optimize Top Convex Query Reads (In Progress - 4/8 plans done)
Plan: 20-04 complete (4/8 plans done; 20-01, 20-02, 20-03, and 20-04 done)
Status: Plans 20-01, 20-02, 20-03, 20-04 complete; build passes; getRestockOverview now internalQuery+action; GoBiz+Internal N+1 eliminated with Promise.all
Last activity: 2026-02-22 - Completed 20-04: Convert getRestockOverview to on-demand action + fix N+1 patterns

Progress (v1.3): [████████░░] ~62% — Phase 19 complete (9/9), Phase 20 in progress (4/8)

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)

## Accumulated Context

### Roadmap Evolution
- Phase 23 added: Optimize top Convex query reads to reduce production bandwidth
- Phase 24 added: Remove legacy recipe/packaging/product editors and tags system
- Phase 20.1 inserted after Phase 20: Delivery fee reporting separation (URGENT)

### Decisions

All v1.0–v1.2 decisions archived in PROJECT.md Key Decisions table.

Key decisions affecting v1.3 phases:
- [Phase 17.1]: `gofoodDepotStock` table has no `outletId` field — Phase 19 must extend schema with `outletId` + composite index before any depot tracking work
- [Phase 17.1]: productInventory is simple aggregate (not FIFO); GoFood outlets allow negative stock
- [17-06]: `dispatchConsignmentOutlets` holds Legato outlet data — Phase 21 must decide FK strategy (reuse vs. parallel `externalOutlets` rows) before schema migration
- [Research]: SheetJS 0.20.3 from CDN tarball only — never `npm install xlsx` (registry stuck at abandoned 0.18.5)
- [Research]: `getDailySalesSummary` missing `channel = "direct"` filter — must fix before `getLifetimeTotals` in Phase 22
- [Phase 19]: computeRestockSuggestion uses Math.ceil on avg+buffer; Monday resets to previous Thursday total; initOutletMappingsFromPrevious is idempotent (no-op if target already has mappings)
- [Phase 19-01]: outletId is optional on gofoodDepotStock for backward compatibility with existing rows
- [Phase 19-01]: transferStock uses .unique() to ensure one row per product+location; logs two transfer transactions linked via transferPairLocationId
- [Phase 19-04]: Location-type bucketing: office+kitchen=Internal, depot=GoFood, venue=K3Mart; consignment hidden until Phase 21
- [Phase 19-04]: Zero-stock rows shown by default with opacity-50 styling (not hidden)
- [Phase 19-04]: Grouping toggle computed client-side from getStockOverviewGrouped (no extra query)
- [Phase 19]: PageHeader description is string-only: last-synced placed in action slot
- [Phase 19]: All GoFood depot hooks called before conditionals per React hooks rule
- [Phase 19]: GoFoodRestockSection uses productInventoryQty (outlet linked storage) for current stock, matching DepotCockpitTable In Inventory column
- [Phase 19]: destinationLocationId flows via prop chain: GoFoodDepotManager (selectedOutlet?.linkedStorageLocationId) -> DepotCockpitTable (prop + state) -> DepotStockTransferDialog - no dialog changes needed
- [Phase 19]: Usage guidance placed above collapsible content so it remains visible in both expanded and collapsed states
- [Phase 19]: Transfer link in GoFoodRestockSection navigates to /inventory directly (no deep-link parameters)
- [Phase 19]: Location type editor uses useSessionMutation (not useMutation+token) since storageLocations.mutations.update uses protectedMutation/SessionIdArg pattern
- [Phase 19-09]: Removed text-muted-foreground from TooltipContent paragraph; tooltip inherits its own readable color
- [Phase 19-09]: Move/Receive buttons use blue/green outline tinting for semantic color coding across both ProductGroupedView and LocationGroupedView
- [Phase 19-09]: GoBiz sync note is always-visible (non-dismissible) to ensure users see sync prerequisite info
- [Phase 20-02]: getDashboardSummaryByPeriod converted from public reactive query to internalQuery + action pattern to eliminate 205 MB bandwidth during GoBiz sync runs
- [Phase 20-02]: periodPresetValidator inlined in actions.ts (not imported from queries.ts) to break circular type inference in tsc -b project-references build
- [Phase 20-02]: Subscription-to-fetch hook pattern: useAction + useState + useCallback + useEffect with explicit DashboardSummaryByPeriod local type and Promise<unknown> action handler
- [Phase 20-01]: 24-hour buffer before sinceTimestamp catches late-confirmed orders; by_creationTime index makes incremental query index-backed in Convex
- [Phase 20-03]: useConvexExternalRevenue defaults to last 90 days (effectivePeriodStart) when no periodStart provided — hook-level default prevents all callers from triggering unbounded scans
- [Phase 20-03]: OverviewTab reuses summary.currentPeriod.periodStart/End for revenue bounds (no cross-directory import needed); allTime passes Date.UTC(2020,0,1) explicitly to stay on indexed path
- [Phase 20-04]: fetchRestockOverview handler typed as Promise<unknown> to avoid tsc -b circular type inference; RestockOverview defined as explicit local type with cast since FunctionReturnType resolves to unknown
- [Phase 20-04]: refreshOverview wired into handleSyncAll after sync actions settle — overview reloads after every sync without page reload
- [Phase 20-04]: GoBiz N+1 replaced with single Promise.all; Internal two-level N+1 replaced with two Promise.all batches (orders then orderItems)

### Pending Todos

None.

### Blockers/Concerns

- [Phase 19]: `gofoodDepotStock` schema migration resolved (plan 01 fully committed -- schema + transferStock + per-outlet depot queries)
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
| 19 | replace hand-rolled items+pricing block in OrderSlideOver with shared OrderItems component; delivery fee now visible in slide-over | 2026-02-22 | 9b2be80 | Verified | [19-replace-hand-rolled-items-pricing-block-](./quick/19-replace-hand-rolled-items-pricing-block-/) |
| 20 | add item-linked voucher type: fixed Rp discount per unit of a specific menu product, applied at item level during order creation | 2026-02-22 | e235382 | Verified | [20-add-item-linked-voucher-type-with-direct](./quick/20-add-item-linked-voucher-type-with-direct/) |
| 21 | add deliveryFee input to OrderCreate Order Summary + fix ongkir line position before Total in WhatsApp payment_request and receipt templates | 2026-02-22 | bd5322c | Verified | [21-delivery-fee-input-on-ordercreate-fix-wh](./quick/21-delivery-fee-input-on-ordercreate-fix-wh/) |
| 22 | add {delivery_fee} template variable to payment_request and receipt WhatsApp DB templates (ID + EN); variable emits full ongkir line with emoji when fee set, empty when zero | 2026-02-22 | ee22f43 | Verified | [22-add-shipping-fee-variable-to-whatsapp-pa](./quick/22-add-shipping-fee-variable-to-whatsapp-pa/) |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P02 | 25 | 2 tasks | 5 files |
| Phase 20 P01 | 750 | 1 tasks | 3 files |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P04 | 12 | 2 tasks | 4 files |

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 20-04 — getRestockOverview converted to internalQuery + action; GoBiz and Internal N+1 patterns replaced with Promise.all; useConvexRestockOverview updated to on-demand fetch
Resume file: None
Resume notes: Phase 20 plans 20-01 through 20-04 complete. Patterns: incremental sync with timestamp buffer; internalQuery+action+useAction hook; hook-level default bounds; Promise.all N+1 elimination; explicit local type for action return shape. Next: 20-05 (next bandwidth target).

---
*Last updated: 2026-02-22 - Completed 20-04: getRestockOverview converted to internalQuery+action; N+1 eliminated with Promise.all (build passes)*
