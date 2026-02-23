# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-22)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.3 — Phase 23 complete (bundle splitting + lazy routes)

## Current Position

Phase: Phase 23 — Bundle Size & Lazy Routes (COMPLETE — 3/3 plans done, UAT passed 7/7)
Plan: 23-03 complete (3/3 plans done)
Status: All routes lazy-loaded, vendor chunks split, bundlesize CI guard active, UAT verified — merged to main
Last activity: 2026-02-23 - Phase 23 UAT complete (7/7 passed), merged and closed

Progress (v1.3): [██████████] ~100% — Phase 19 complete (9/9), Phase 20 complete (8/8), Phase 20.1 complete (1/1), Phase 21 complete (7/7)

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
- [Phase 21-04]: ShiftHistoryList queries getShiftHistory with user.token directly — no prop needed; isManager check is UI-only gate while backend enforces requireRole; defaultPackagingMix starts empty in form since getConfig doesn't expose it
- [Phase 21-05]: buildIngredientNeeds extracted as private helper shared by deduct and restore to avoid BOM traversal duplication
- [Phase 21-05]: restoreIngredientsForShift uses best-effort batch restore (newest active batch) — exact FIFO reversal not feasible for edits
- [Phase 21-05]: updateShiftRecord ingredient diff uses produced[] arrays (not net maps) to correctly scope ingredient changes to production only, independent of waste
- [Phase 21-06]: Form bindings in ManagerTargetSettings were already correct at time of execution; only interface, useEffect, and product filter changes were needed
- [Phase 21-06]: dispatch fallthrough: preserve ball totals from dispatch plan while using config defaultPackagingMix for packaging breakdown when BOM traversal yields empty result
- [Phase 21-06]: Form bindings in ManagerTargetSettings were already correct at time of execution; only interface, useEffect, and product filter changes were needed
- [Phase 21-06]: dispatch fallthrough: preserve ball totals from dispatch plan while using config defaultPackagingMix for packaging breakdown when BOM traversal yields empty result
- [Phase 21-07]: KitchenOrderSummary uses listForKanban (existing kanban query) cast to Record<string, OrderRow[]> — avoids creating a new backend query for a read-only view
- [Phase 21-07]: showJumbo toggle uses inline button[role=switch] — no shadcn/ui Switch import needed; PackagingMixEditor not filtered by showJumbo (toggle controls ProductionTargetsBar stat card only)
- [Phase 21-08]: enabledProductionComponents null = all enabled; frontend resolves actual codes from componentTypes table
- [Phase 21-08]: showJumbo preserved in schema and auto-derived from enabledProductionComponents for backward compat during migration
- [Phase 21]: Per-component toggles loaded dynamically from componentTypes.getByCategory(production) — not hardcoded; future components appear automatically
- [Phase 21]: Override packaging fallthrough: when packagingOverrides empty on override doc, getKitchenTargetsForDate falls through to config.defaultPackagingMix so breakdown badges remain visible
- [Phase 21]: productBallTypes map built in KitchenViewV2 via listAll — avoids per-product subscriptions; single flat query for all products
- [Phase 21]: enabledComponents defaults to BIG_BALL+MID_BALL when config undefined or null — null-means-all pattern from 21-08
- [Phase 21]: latestChefName from todayShiftRecords[0].chefName — no new query; most recent shift record first
- [Phase 21]: Waste counts toward total made in review delta (totalMade = produced + waste) — staff want to know if their real output met the target regardless of spoilage reason
- [Phase 21]: ShiftEditDialog uses plain text Input for chefName (not a user Select) — manager may type any name not in the system; no chefUserId update from dialog (name only)
- [Phase 22-remove-legacy-editors-tags-and-dashboard]: All 11 legacy tables verified empty in production before dropping — no data export required
- [Phase 22-remove-legacy-editors-tags-and-dashboard]: costInvalidation.ts stripped to 2 surviving functions: invalidateMenuProductCosts + invalidateProductionComponentCosts; ingredients/materials callers cleaned
- [Phase 22-remove-legacy-editors-tags-and-dashboard]: IngredientSelector.tsx in src/components/recipes/ had zero consumers — deleted as orphaned dead code alongside RecipeCard.tsx
- [Phase 22-remove-legacy-editors-tags-and-dashboard]: MobileBottomNav /tags entry with canAccessRecipes removed — discovered via grep and auto-fixed during Task 2 verification
- [Phase 22-remove-legacy-editors-tags-and-dashboard]: Home nav link added as first item in mainNavItems and primaryTabs — forward-declared before /home route exists; parallel 22-03/22-04 execution is safe
- [Phase 22-03]: HubPage /home route uses canAccessDashboard protection inside Layout; RoleBasedRedirect sends manager/admin to /home — kitchen and order_staff redirects unchanged
- [Phase 22-03]: HubPage has zero Convex bandwidth — no useQuery or useMutation; static role-filtered nav cards only
- [Phase 22-remove-legacy-editors-tags-and-dashboard]: 22-05: Test files in tests/convex/ referencing legacy tables are out of scope; plan grep targets src/ and convex/ only
- [Phase 22-remove-legacy-editors-tags-and-dashboard]: 22-05: EditorPageSkeleton and DashboardSkeleton JSDoc comments updated to remove stale references to deleted pages
- [Phase 24-05]: direct-manual sentinel stripped in handleSaveCell (frontend) — keeps mutation validator clean
- [Phase 24-05]: getYesterday() exported from DispatchPlanner.tsx for single-source date anchor; WeekNav imports it
- [Phase 24-05]: renderColumnAction prop pattern on PlannerGrid — loose coupling between grid and Save-to-Kitchen semantics
- [Phase 24-05]: PlannerCell blur reverts (not saves) — Enter-only saves prevent accidental data commits; amber ring indicates unsaved state
- [Phase 24-07]: createMutationHook skips toast.success when successMessage is empty string — lets EntityManager own the single update toast
- [Phase 24-07]: FGAdjustDialog uses useMutation+token pattern (not useSessionMutation) matching existing productInventory caller pattern

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
| 25 | EoS form gap closure: waste filter, inline confirm error, produced row redesign with targets and deltas | 2026-02-23 | 861afec | Verified | [25-eos-form-gap-closure-waste-filter-inline](./quick/25-eos-form-gap-closure-waste-filter-inline/) |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P02 | 25 | 2 tasks | 5 files |
| Phase 20 P01 | 750 | 1 tasks | 3 files |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P04 | 12 | 2 tasks | 4 files |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P05 | 8 | 2 tasks | 4 files |
| Phase 20 P06 | 8 | 1 tasks | 4 files |
| Phase 20-optimize-top-convex-query-reads-to-reduce-production-bandwidth P07 | 6 | 1 tasks | 1 files |
| Phase 20 P08 | 8 | 1 tasks | 1 files |
| Phase 21-kitchen-production-targets P02 | 3 | 2 tasks | 3 files |
| Phase 21-kitchen-production-targets P03 | 4 | 2 tasks | 8 files |
| Phase 21-kitchen-production-targets P04 | 5 | 2 tasks | 4 files |
| Phase 21-kitchen-production-targets P05 | 3 | 2 tasks | 3 files |
| Phase 21-kitchen-production-targets P06 | 2 | 2 tasks | 2 files |
| Phase 21-kitchen-production-targets P07 | 3 | 3 tasks | 6 files |
| Phase 21-kitchen-production-targets P08 | 3 | 2 tasks | 6 files |
| Phase 21-kitchen-production-targets P09 | 4 | 2 tasks | 5 files |
| Phase 21 P10 | 8 | 2 tasks | 6 files |
| Phase 21 P11 | 8 | 2 tasks | 6 files |
| Phase 22-remove-legacy-editors-tags-and-dashboard P01 | 531 | 3 tasks | 27 files |
| Phase 22-remove-legacy-editors-tags-and-dashboard P02 | 264 | 2 tasks | 27 files |
| Phase 22-remove-legacy-editors-tags-and-dashboard P03 | 145 | 2 tasks | 3 files |
| Phase 22-remove-legacy-editors-tags-and-dashboard P04 | 2 | 1 tasks | 6 files |
| Phase 22-remove-legacy-editors-tags-and-dashboard P05 | 4 | 1 tasks | 1 files |
| Phase 24-ingredient-simulation-id-linking P05 | 4 | 2 tasks | 7 files |
| Phase 24-ingredient-simulation-id-linking P07 | 5 | 2 tasks | 7 files |

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 24-07-PLAN.md — Ingredients UAT-3 gap closure (double toast, Untrack, FG Adjust); build passes.
Resume file: None
Resume notes: Phase 24 plan 07 complete. Continue with remaining plans in phase 24 or proceed to UAT verification.

---
*Last updated: 2026-02-23 - Completed 24-07: Ingredients/FG gap closure (double toast fix, Untrack button, FGAdjustDialog)*
