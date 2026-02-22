# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-22)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.3 — Phase 20 (Bandwidth Optimization) complete; 8/8 plans done

## Current Position

Phase: Phase 21 — Kitchen Production Targets (In Progress - 3/5 plans done)
Plan: 21-03 complete (3/5 plans done)
Status: Plan 03 complete; KitchenViewV2 restructured to 3-section layout; ProductionTargetsBar, EndOfShiftForm (3-step), ShiftReviewModal, ShiftSuccessScreen, useKitchenTargets all created; build passes
Last activity: 2026-02-22 - Completed 21-03: kitchen page redesign — targets top, end-of-shift form middle, collapsible orders bottom; boxing/stickering removed from view

Progress (v1.3): [█████████░] ~95% — Phase 19 complete (9/9), Phase 20 complete (8/8), Phase 20.1 complete (1/1), Phase 21 in progress (3/5 done)

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
- [Phase 20.1-01]: Delivery fee separation at query time using order.deliveryFee field — no schema changes; totalDiscounts recalculated against netProduct to remain accurate; deleted-order fallback leaves totalDeliveryFees at 0; Delivery Fees card uses muted value color (pass-through, not a loss)

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
- [Phase 20-05]: OutletStockSummary local type defined in hook (action returns Promise<unknown>; FunctionReturnType resolves to unknown — explicit type + cast pattern, same as 20-04)
- [Phase 20-05]: refreshOutletStock wired into handleSync after Promise.allSettled — outlet data reloads after every sync without page reload
- [Phase 20]: 20-06: RevenueByOutlet local type defined in hook (action returns Promise<unknown>; explicit type + cast — same pattern as 20-04/20-05)
- [Phase 20]: 20-06: refresh callback exposed but not externally wired — PlatformHierarchy is self-contained; preset changes trigger re-fetch automatically
- [Phase 20]: 20-07: listForKanban result type annotated with explicit lean shape (not Doc<orders> spread) to enforce pruned return contract at compile time
- [Phase 20]: 20-08: productionOrders subset skips Draft/AwaitingPayment item+production lookups in getKitchenStats; return shape confirmed lean (primitives only, no Doc objects)
- [Phase 21-01]: getKitchenTargetsForDate aggregates ALL channels from dispatchPlans.by_date (no channel filter) — direct + gofood + k3mart + consignment all contribute to daily ball totals
- [Phase 21-01]: Removed bigBall + midBall === maxProductionTarget sum validation from updateConfig — targets are now independent absolute numbers (dispatch plan BOM is the authoritative source)
- [Phase 21-01]: Packaging breakdown in override source returns empty list when packagingOverrides not set — partial override is valid (ball-only override)
- [Phase 21-02]: Raw ingredient deduction from componentStock deferred to follow-up phase — only Finished Goods (productInventory) updated at shift submit time
- [Phase 21-02]: updateShiftRecord appends adjustment rows to inventoryUpdates array rather than replacing it — full audit trail preserved
- [Phase 21-02]: getShiftRecordsByDate is public (no auth token) — all kitchen roles can view today's records
- [Phase 21-03]: EndOfShiftForm waste section is expandable toggle — reduces cognitive load for kitchen staff who won't have waste every shift
- [Phase 21-03]: Orders section hidden by default via collapsible toggle (per user decision)
- [Phase 21-03]: Loading guard only on packingOrders (isProductionLoading) — targets and shift records show inline skeleton/loading states
- [Phase 21-03]: BoxingPanel/StickeringPanel files NOT deleted — Phase 24 handles legacy cleanup

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
| 23 | Highlight my orders and orders with notes on order manager kanban with sorting and legend toggles | 2026-02-22 | 3fa94de | Verified | [23-highlight-my-orders-and-orders-with-note](./quick/23-highlight-my-orders-and-orders-with-note/) |
| 24 | Disable Sales Analytics and K3Mart Cockpit pages; redirect / and disabled routes to /orders for bandwidth conservation until March 1st | 2026-02-22 | 7d7fcba | Done | [24-disable-sales-analytics-page-and-redirec](./quick/24-disable-sales-analytics-page-and-redirec/) |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P02 | 25 | 2 tasks | 5 files |
| Phase 20 P01 | 750 | 1 tasks | 3 files |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P04 | 12 | 2 tasks | 4 files |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P05 | 8 | 2 tasks | 4 files |
| Phase 20 P06 | 8 | 1 tasks | 4 files |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P07 | 6 | 1 tasks | 1 files |
| Phase 20 P08 | 8 | 1 tasks | 1 files |
| Phase 21-kitchen-production-targets P02 | 3 | 2 tasks | 3 files |
| Phase 21-kitchen-production-targets P03 | 4 | 2 tasks | 8 files |

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 21-03 — KitchenViewV2 restructured to 3-section layout; ProductionTargetsBar, EndOfShiftForm (3-step), ShiftReviewModal, ShiftSuccessScreen, useKitchenTargets created; build passes
Resume file: None
Resume notes: Phase 21 plan 03 complete. Kitchen page redesign shipped. Ready for plan 21-04.

---
*Last updated: 2026-02-22 - Completed 20-08: getKitchenStats Draft/AwaitingPayment skip — eliminates wasted item+production DB reads for unconfirmed orders; build passes; Phase 20 complete*
