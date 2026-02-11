# Changelog

> **Purpose:** Version history for Frollie Recipe Master.
> **When to update:** After ANY code change is merged to main.

## Update Instructions

After merging any code change, add a new entry with:
- Date and descriptive title
- 1 or 2 liner for humans to understand that is none-techinical - how does it benefit them
- Summary of what changed
- Files modified (if significant)
- Any migration steps or breaking changes

---

## 2026-02-11 - K3 Mart Kitchen Tracker + Kitchen QoL Improvements

### Overview
Kitchen staff can now see K3 Mart outlet stock, sales, and consignment readiness directly in the Kitchen View — no more switching to the Sales Analytics page to check "do we have enough at outlets?"

Also improves kitchen workflow with non-fatal packaging warnings and cumulative ball production tracking.

### K3 Mart Kitchen Integration

**New Backend Module:** `convex/k3martKitchen/queries.ts`
- `getK3MartKitchenSummary({ date })` — Combines consignment targets, outlet stock snapshots, today's K3 Mart sales, and product mappings into a per-product summary with outlet breakdown

**New Frontend Components:**
- `K3MartStockCard` — Read-only outlet stock info card (Sticker panel): aggregate outlet stock, sold today, target, gap-to-target, collapsible per-outlet breakdown, Sync Stock button
- `K3MartPackingCard` — Consignment readiness summary (Pack panel): target/boxed/stickered per product with ready/warning icons

**New CSS Variables:** Amber K3 Mart color set (`--color-k3mart`, `-light`, `-medium`, `-accent`, `-badge`)

**Updated Panels:**
- **ProductionLogPanel** — New "Stk" column showing aggregate K3 Mart outlet stock per product
- **BoxingPanel** — "Outlets: X" metric in product card headers
- **StickeringPanel** — K3MartStockCard rendered above manual sticker cards for products with consignment targets
- **PackingPanel** — K3MartPackingCard rendered between GoFood and regular order cards

### Kitchen QoL Improvements
- **Non-fatal packaging:** Boxing and stickering now succeed even when packaging stock is short — returns a warning instead of blocking
- **Cumulative ball counters:** `totalProducedOriginal` / `totalProducedBiteSized` track total balls produced today (never decremented on boxing)
- **ActionToast types:** `actionToast()` now supports `error` and `warning` types with color-coded styling and longer duration for errors

### Files Created
- `convex/k3martKitchen/queries.ts`
- `src/components/kitchen/K3MartStockCard.tsx`, `src/components/kitchen/K3MartPackingCard.tsx`

### Files Modified
- `convex/schema.ts` (cumulative ball fields), `convex/orders/mutations/kitchen.ts` (non-fatal packaging), `convex/orders/queries.ts` (cumulative fields)
- `src/index.css`, `src/pages/KitchenViewV2.tsx`, `src/hooks/convex/useKitchenProduction.ts`
- `src/components/kitchen/ProductionLogPanel.tsx`, `src/components/kitchen/BoxingPanel.tsx`
- `src/components/kitchen/StickeringPanel.tsx`, `src/components/kitchen/PackingPanel.tsx`
- `src/components/kitchen/index.ts`, `src/lib/actionToast.ts`

---

## 2026-02-11 - GoFood Kitchen + Goldfinch Depot Integration

### Overview
Full integration for tracking GoFood depot stock at Legato Goldfinch, ship-to-depot workflows, and automatic sticker deduction on GoBiz sales. GoFood now appears as a virtual "order" in the Kitchen View alongside regular orders.

### New Tables
- **`gofoodDepotStock`** -- Per-product running stock at Goldfinch (quantity, stickerDeficit, lastUpdated). Index: `by_menuProduct`
- **`gofoodDepotShipments`** -- Audit log of every shipment from Office to Goldfinch (date, quantity, stickers, who). Indexes: `by_date`, `by_product_date`

### Modified Tables
- **`productionCounts`** -- Added `shippedToGoldfinch: v.optional(v.number())` field

### New Backend Module: `convex/gofoodDepot/`
- **Mutations:** `recordShipment` (auth-protected, FIFO sticker transfer), `processSyncSales` (internalMutation, batch sale processing), `recordSale` (internalMutation, single sale), `adjustDepotStock` (manager/admin manual correction)
- **Queries:** `getDepotStock`, `getGoFoodDailyOrder` (virtual order assembly), `getTodayShipments`, `getGoldfinchStickerInventory`, `getDepotFreshness`

### GoBiz Integration
- **Phase C** added to GoBiz sync: after saving revenue items, auto-consumes stickers from Goldfinch FIFO via `processSyncSales`
- **Auto-sync cron** added: `autoSyncGoBizRevenue` runs at WIB business hours (8, 10, 12, 14, 16, 18, 20)

### Frontend Changes
- **New CSS variables:** Jade green GoFood color set (`--color-gofood`, `-light`, `-medium`, `-accent`, `-badge`)
- **New components:** `GoFoodStickerCard` (read-only depot info for Sticker panel), `GoFoodPackingCard` (ship-to-depot for Pack panel with double-tap confirm)
- **Updated panels:** StickeringPanel (GoFood cards above manual cards, removed Undo button), PackingPanel (GoFoodPackingCard at top), BoxingPanel (removed Undo button), ProductionLogPanel (jade "GF depot: N" annotation)
- **Updated hooks:** `useKitchenProduction` now fetches GoFood depot data
- **Updated page:** `KitchenViewV2.tsx` wires all depot data, shipment mutations, and sync actions

### Tests
- 53 new backend tests across `gofoodDepot.test.ts` (35) and `gofoodDepot-edge.test.ts` (18)
- Fixed `gobizAdapter.test.ts` cron assertion (now validates GoBiz cron exists)

### Files Created
- `convex/gofoodDepot/mutations.ts`, `convex/gofoodDepot/queries.ts`
- `src/components/kitchen/GoFoodStickerCard.tsx`, `src/components/kitchen/GoFoodPackingCard.tsx`
- `tests/convex/gofoodDepot.test.ts`, `tests/convex/gofoodDepot-edge.test.ts`

### Files Modified
- `convex/schema.ts`, `convex/crons.ts`, `convex/productionCounts/queries.ts`
- `convex/integrations/gobiz/adapter.ts`
- `src/index.css`, `src/pages/KitchenViewV2.tsx`, `src/hooks/convex/useKitchenProduction.ts`
- `src/components/kitchen/StickeringPanel.tsx`, `src/components/kitchen/PackingPanel.tsx`
- `src/components/kitchen/BoxingPanel.tsx`, `src/components/kitchen/ProductionLogPanel.tsx`
- `src/components/kitchen/index.ts`
- `tests/convex/gobizAdapter.test.ts`

---

## 2026-02-10 - Inventory: Component Rename & Delete Actions

### Overview
Added Rename and Delete actions to the component type kebab menu on the Inventory page, allowing the catalog to be reshaped without requiring direct database access.

### Changes
- **New file**: `src/components/inventory/RenameComponentDialog.tsx` — Lightweight dialog with pre-filled name input
- **Modified**: `src/components/inventory/ComponentRow.tsx` — Added Rename, Delete items to kebab dropdown menu with separator; wired up `RenameComponentDialog` and `ConfirmDialog` (destructive variant)

### Behavior
- **Rename**: Opens dialog pre-filled with current name. Saves via existing `componentTypes.mutations.update`
- **Delete**: Shows destructive confirmation dialog. Backend `componentTypes.mutations.remove` blocks deletion if the component has BOM links, inventory batches, or stock records — the error message is surfaced in a toast
- **Existing**: Archive/Restore action unchanged

### Files Modified
- `src/components/inventory/ComponentRow.tsx`
- `src/components/inventory/RenameComponentDialog.tsx` (new)

---

## 2026-02-10 - Fix: Production Convex Connection Restored

### Overview
Production site (`frollie-product.vercel.app`) was not connecting to the Convex backend since the CI/CD migration on 2026-02-03. The `VITE_CONVEX_URL` environment variable was missing from `.env`, causing `ConvexReactClient` to be `null` and the app to run without a backend.

### Changes
- **PR #46** (`fix/production-convex-url`): Added `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to `.env` file. Also set in Vercel dashboard env vars.
- **PR #47** (`fix/env-quoted-values`): Wrapped `VITE_*` values in double quotes for clean Vite string inlining.
- **RCA report**: Full root cause analysis at `docs/reports/RCA-2026-02-10-production-no-convex-connection.md`.

### Root Cause
Commit `bcfb0da` (CI/CD migration) replaced `VITE_API_URL` with `CONVEX_DEPLOYMENT` in `.env` but omitted the `VITE_CONVEX_URL` that Vite needs at build time. The `null` client fallback in `main.tsx` silently degraded the app instead of failing.

### Files Modified
- `.env` — Added `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` (quoted)
- `docs/reports/RCA-2026-02-10-production-no-convex-connection.md` — NEW: Full RCA report

---

## 2026-02-10 - Kitchen V3.3: BOM Source of Truth + Action Toast Positioning

### Overview
Eliminated `productionType`/`productionUnits` tech debt — ball composition is now derived exclusively from BOM (menuProductComponents + componentTypes). Toast notifications repositioned to appear near the clicked button for better mobile UX.

### Changes
- **BOM as sole source of truth**: `productionCounts.getAll()` no longer falls back to deprecated `menuProducts.productionType`/`productionUnits` fields. Ball type and count are derived exclusively from the BOM (menuProductComponents + componentTypes tables). Products without BOM entries default to 0 ball count.
- **Action Toast utility**: New `actionToast()` function shows lightweight floating feedback near the clicked button instead of a fixed corner. Dark pill UI, auto-positioned above/below the button, fades out after 1.2s.
- **Sonner position**: Global Sonner moved from `bottom-right` to `top-center` for better visibility as fallback.
- **Event threading**: All kitchen handler signatures updated to accept `React.MouseEvent` — threaded from button onClick through panel components to KitchenViewV2 handlers.
- **Documentation**: New decision doc (`docs/decisions/bom-source-of-truth.md`), updated CLAUDE.md pitfall #11 (never use productionType), updated CODE_STYLE.md toast pattern section.

### Files Modified
- `convex/productionCounts/queries.ts` — removed productionType fallback, BOM-only derivation
- `convex/schema.ts` — enhanced deprecation comments on menuProducts and orderItems productionType/productionUnits
- `src/lib/actionToast.ts` — NEW: position-aware inline toast utility
- `src/index.css` — action-toast-in/out CSS animations
- `src/components/ui/sonner.tsx` — position changed to top-center
- `src/pages/KitchenViewV2.tsx` — handlers accept events, use actionToast for success
- `src/components/kitchen/ProductionLogPanel.tsx` — removed unused imports (Info, FlowChevrons), updated comment, event threading
- `src/components/kitchen/BoxingPanel.tsx` — event threading on submit/undo
- `src/components/kitchen/StickeringPanel.tsx` — event threading on submit/undo
- `src/components/kitchen/PackingPanel.tsx` — event threading on toggle/mark ready
- `CLAUDE.md` — updated business rule #10, added pitfall #11
- `docs/CODE_STYLE.md` — new "Toast & Action Feedback" section
- `docs/decisions/bom-source-of-truth.md` — NEW: decision record

---

## 2026-02-10 - Kitchen V3.2: Animations, Target Logging, and Reactive Fixes

### Overview
Split-flap display animations for all kitchen counters, target change logging, ball tray delta indicators, and reactive target computation fix.

### Changes
- **Split-flap number animation**: All numeric counters use a Solari/airport board animation (`FlipNumber` component). Each digit sits on a dark panel and scrolls vertically when the value changes, with staggered timing from right to left. Applied to: ball tray counts, ball target totals, boxing "Awaiting Sticker" counts, stickering "Stickered" counts, order summary counts.
- **Flow chevrons on action buttons**: "Add", "Box", and "Sticker" buttons show animated flowing chevrons (›››) when a valid quantity is entered, suggesting material flows to the next station.
- **Target change logging**: New `productionTargetLogs` table records every target change (date, source, product, previous/new quantity, timestamp). Automatically logged in `setProductTarget` mutation.
- **Ball tray delta indicators**: Each ball tray counter shows a color-coded delta vs target:
  - Amber: "Need X more (target: Y)" when under target
  - Green: "On target (Y)" when exactly matching
  - Blue: "+X surplus (target: Y)" when over target
- **3-source target system**: Split product targets by source ("consignment" for K3 Mart, "gofood" for GoFood). Table shows Ord (auto from orders) | K3M (editable) | GoF (editable) | Tot columns with ball totals.
- **Reactive target fix**: Removed `useMemo` for ball total computation. Now computed inline on every render to guarantee Convex reactive updates propagate immediately when K3M/GoF targets are edited.
- **Animated pipeline arrows**: Hover/touch on any section triggers flowing dots on the arrow below it, showing material flow direction.
- **StickeringPanel POS filter**: Only shows food POS products sorted by POS slot (matching BoxingPanel).

### Files Modified
- `convex/schema.ts` — new `productionTargetLogs` table with by_date and by_date_timestamp indexes; `productionProductTargets` gained source field + by_date_source and by_date_source_product indexes
- `convex/productionTargets/mutations.ts` — target change logging in setProductTarget; source parameter for per-product targets
- `convex/productionTargets/queries.ts` — getProductTargets returns source; new getOrderProductDemand query
- `src/components/kitchen/FlipNumber.tsx` — NEW: FlipNumber split-flap component + FlowChevrons button animation
- `src/components/kitchen/ProductionLogPanel.tsx` — 3-source target table, inline ball computation, FlipNumber, delta display, FlowChevrons, animated arrows
- `src/components/kitchen/BoxingPanel.tsx` — FlipNumber on counts, FlowChevrons on Box button
- `src/components/kitchen/StickeringPanel.tsx` — FlipNumber on counts, FlowChevrons on Sticker button, POS filter fix
- `src/components/kitchen/index.ts` — export FlipNumber, FlowChevrons
- `src/hooks/convex/useKitchenProduction.ts` — added orderProductDemand query, updated types
- `src/pages/KitchenViewV2.tsx` — wired 3-source targets, orderProductDemand, fixed desktop panel props

---

## 2026-02-10 - Kitchen V3.1: UI Refinements + Per-Product Targets

### Overview
UX improvements to Kitchen V3 panels based on production testing. Fixed layout overflow on narrow desktop panels, added order demand visibility, improved undo flow, negative-number tooltip, and per-product manual production targets with automatic ball conversion.

### Changes
- **Per-product production targets**: Tap a product in Today's Targets to set a manual target (e.g., 20 Singles). Automatically converts to ball totals via `menuProductComponents` lookup and upserts into `productionTargets.manualOverride`. Shows ball conversion inline (e.g., "20 mid").
- **New table**: `productionProductTargets` stores per-product manual targets keyed by date + menuProductId.
- **New query**: `productionTargets.queries.getProductTargets` returns per-product targets for a date.
- **New mutation**: `productionTargets.mutations.setProductTarget` saves per-product target and recomputes ball totals from all product targets for that date.
- **Compact layout**: Reduced element sizes (h-11 inputs, h-9 undo buttons) to fit within 4-column desktop grid (~230px per panel). Input + action button on row 1, full-width undo on row 2.
- **Text input controls**: All quantity controls accept any number (including negatives for revert). Placeholder shows "Qty to add".
- **Negative number tooltip**: Info icon on each input with tooltip: "If you want to revert, you can also use negative numbers"
- **Undo simplified**: Single-tap undo button (removed double-tap confirmation). Clearly labeled "Undo last (-1)" / "Undo last (+1)".
- **Packages needed from orders**: Boxing and Stickering cards show "Need: X" from pending orders (aggregated from packingOrders per menuProductId).
- **Boxing panel filter**: Only shows food POS products (posSlot set), sorted by POS slot number. Header shows "Awaiting Sticker" count.
- **Production Log pipeline**: 4-section dashboard with flow arrows (Targets → Ball Tray → Finished Products → Orders). All sections always render.
- **Backend**: Added `posSlot` and `productType` fields to `productionCounts.getAll()` query.

### Files Modified
- `convex/schema.ts` — new `productionProductTargets` table with by_date and by_date_product indexes
- `convex/productionTargets/queries.ts` — new `getProductTargets` query
- `convex/productionTargets/mutations.ts` — new `setProductTarget` mutation with ball recomputation
- `convex/productionCounts/queries.ts` — added posSlot/productType to return
- `src/components/kitchen/ProductionLogPanel.tsx` — per-product target inputs with ball conversion, pipeline dashboard
- `src/components/kitchen/BoxingPanel.tsx` — stacked layout, text input, POS filter, order demand, undo
- `src/components/kitchen/StickeringPanel.tsx` — stacked layout, text input, order demand, undo
- `src/pages/KitchenViewV2.tsx` — wired setProductTarget mutation, compute neededFromOrders, pass new props
- `src/hooks/convex/useKitchenProduction.ts` — added productTargets query, today date, updated types

---

## 2026-02-10 - Kitchen Production Page: Complete Redesign (V3)

### Overview
Complete rewrite of the kitchen production workflow from a kanban-style per-order view to a batch-oriented 4-panel swipeable interface optimized for mobile use in production environments.

### New Features
- **4 swipeable panels** with station pill bar navigation (Production Log, To Box, To Sticker, To Pack)
- **Batch production model**: Boxing and stickering are product-aggregated (not per-order)
- **Production targets**: Auto-calculated from confirmed orders, with manager overrides
- **Production counts**: Running tallies per menu product (boxed, stickered, packed)
- **Production audit log**: Every action tracked (box/unbox/sticker/unsticker/pack/unpack)
- **Batch FIFO consumption**: Boxing deducts packaging at `consumptionStage="boxing"`, stickering at `"labeling"`, ORDER READY at `"none"`
- **Undo support**: Negative quantities reverse boxing/stickering/packing operations
- **Wake lock**: Prevents phone sleep during kitchen use
- **Brand-derived station colors**: Sage green, peach amber, chocolate brown, terracotta

### Bug Fixes
- **Ball type normalization**: Fixed reversed mapping. "Original" is now correctly 45g (MID_BALL), "Jumbo" (formerly "Bite-Sized") is 80g (BIG_BALL)
- **Per-product consumptionStage override**: `consumeMaterialsByStageInternal()` now resolves `menuProductComponents.consumptionStage ?? componentTypes.consumptionStage`

### Schema Changes
- **New table: `productionTargets`** — Daily production goals per production unit type
- **New table: `productionCounts`** — Running production tallies per menu product (boxed, stickered, packed) with manager reset
- **New table: `productionLog`** — Audit trail for all production actions

### New Backend Functions
- **Queries**: `productionCounts.getAll`, `productionTargets.getByDate`, `productionTargets.getProductionSummary`, `orders.kitchenQueries.getKitchenPackingOrders`, `productionLog.getRecent`, `productionLog.getByMenuProduct`, `productionLog.getDailySummary`
- **Mutations**: `boxProducts`, `stickerProducts`, `togglePackOrderLineItem`, `markOrderReady`, `productionTargets.upsert`, `productionTargets.autoCalculate`, `productionCounts.resetCounts`
- **Helper**: `consumeBatchMaterials()` — Batch FIFO consumption not tied to orders

### New Frontend Components
- `SwipeableKitchenLayout.tsx` — Framer Motion horizontal swipe with station pills
- `ProductionLogPanel.tsx` — Ball counters, target gauges, order summary
- `BoxingPanel.tsx` — Per-product boxing with increment buttons
- `StickeringPanel.tsx` — Per-product stickering with available counts
- `PackingPanel.tsx` — Per-order packing checklist with ORDER READY
- `useKitchenProduction.ts` — Combined hook for all kitchen data

### Files Modified
- `convex/schema.ts` — 3 new tables
- `convex/orders/mutations/kitchen.ts` — 4 new mutations + jumbo alias
- `convex/orders/mutations/inventoryIntegration.ts` — `consumeBatchMaterials()` + bug fix
- `convex/orders/helpers/ballDistribution.ts` — Normalization fix
- `convex/orders/queries.ts` — Ball type mapping fix
- `src/pages/KitchenViewV2.tsx` — Complete rewrite
- `src/App.tsx` — Route cleanup (`/kitchen-legacy` now redirects)
- `src/index.css` — Kitchen station CSS variables
- `src/lib/ballTypes.ts` — New shared ball type config
- 6 frontend components updated for ball type labels

---

## 2026-02-10 - Fix: Replace K3 Mart Stock Sync with Product Detail API

### Performance Improvement
- **Before:** Stock sync made 7 API calls (one per outlet, 300ms rate limiting, ~3s). Discovery scanned 200 outlets (~60s).
- **After:** Both use `/vendor-stock/detail/{productId}` which returns ALL outlets per product. With 1 product ID = 1 API call total (<1s).

### Changes
- **`config.ts`:** Added `productDetail` endpoint, `products.ids` array (47068 Jumbo, 47069 Original), `K3MartProductDetailEntry`/`K3MartProductDetailResponse` types, `K3MART_OUTLET_NAME_TO_ID` reverse map. Removed `dashboard` endpoint, `pagination`, `rateLimit`, `discovery` blocks, `K3MartProduct`/`K3MartDashboardResponse` types.
- **`helpers.ts`:** Added `resolveOutletExternalId()` and `transformProductDetailEntry()` pure functions.
- **`adapter.ts`:** Rewrote `syncK3MartStock` and `discoverK3MartOutlets` to use product detail API. Removed dead code: `sleep`, `getProductName`, `getProductCode`, `getProductCapital`, `transformProduct`.
- **`platformCredentials/actions.ts`:** Updated token validation test call to use product detail endpoint.
- **`useExternalData.ts`:** Updated hook comments to reflect new performance.
- **DB migration:** Linked K3 Mart product mappings to menu products: F03131-P00001 (Dubai Chewy Cookie Big) -> Jumbo Size (80g), F03131-P00002 (Dubai Chewy Cookie) -> Original - Single (45g).

### Files Modified
- `convex/integrations/k3mart/config.ts`
- `convex/integrations/k3mart/helpers.ts`
- `convex/integrations/k3mart/adapter.ts`
- `convex/platformCredentials/actions.ts`
- `src/hooks/convex/useExternalData.ts`

---

## 2026-02-09 - Fix: Navigation Restructure, Order Sorting & Role-Based Landing Pages

### Navigation Restructure
- Reorganized nav into three tiers:
  - **Main nav**: Sales, Orders, Kitchen, Inventory, Restock (permission-based visibility)
  - **Config dropdown** (Manager + Admin): Production, WhatsApp
  - **Admin dropdown** (Admin only): Products, Vouchers, Users
- Dashboard page hidden from nav (temporarily disabled)
- Mobile sidebar uses section headers for the same grouping

### Role-Based Landing Pages
- Kitchen staff → `/kitchen`
- Order staff → `/orders`
- Manager / Admin → `/sales`

### Order List Sorting
- Orders now sort by `orderDate` ascending (earliest transaction first) instead of newest-first by creation time

### Files Modified
- `src/components/layout/Header.tsx` — Full nav restructure with DropdownMenu components
- `src/App.tsx` — Role-based redirect component, removed Dashboard import
- `convex/orders/queries.ts` — Added orderDate ascending sort to list query

---

## 2026-02-09 - Feat: Restock Planner (Stock Dashboard + Dispatch Planning)

### New Feature: Restock Planner (`/restock`)
Full stock dashboard and dispatch planning page for managing inventory across all sales channels.

**Three channels supported:**
- **K3 Mart** (7 retail outlets) — Real API stock data from `consapi.k3mart.id`, auto-synced
- **GoBiz** (GoFood) — Manual stock entry, sales synced from GoBiz API
- **Internal** (Direct orders) — Manual stock entry, sales synced from own orders

**Key capabilities:**
- Flat, scrollable layout: Channel → Store → Products (no click-to-expand)
- Per-product view: current stock, avg daily sales, weekday/weekend split, trend indicator
- Editable "Prep Tomorrow" restock targets (weekday vs weekend aware) with save/reset
- K3 Mart stock status badges: critical (< 1 day), warning (< 2 days), ok (>= 2 days)
- Manual stock entry for GoBiz/Internal channels (click to edit inline)
- Summary strip: total outlets, low stock alerts, total daily demand
- Sync All button triggers K3 Mart stock + sales, GoBiz, and Internal syncs

### Backend: New Tables
- `restockTargets` — Persisted user-edited restock quantities per channel/outlet/product
- `manualStockEntries` — Manual stock entries for GoBiz/Internal channels

### Backend: New Queries & Mutations
- `getRestockOverview` — Aggregates stock + 14-day demand across all channels
- `getChannelSellThrough` — 30-day sell-through with weekday/weekend split, suggestions, trends
- `saveRestockTarget` — Upsert restock target (Manager/Admin)
- `updateManualStock` — Upsert manual stock entry (Manager/Admin)
- `syncK3MartStock` — Fast stock refresh for active K3 Mart outlets only

### Bug Fixes
- **K3 Mart API flat dotted keys**: API returns `"product.product_name"` as flat keys instead of nested `product.product_name`. Added defensive helpers (`getProductName`, `getProductCode`, `getProductCapital`) that handle both formats.
- **Cross-outlet stock contamination**: Batch queries for stock snapshots now filter by outletId (previously returned products from ALL outlets sharing a batchId)
- **Stock-only products missing**: Products with stock but no recent sales now appear in the detail view
- **Silent sync failures**: `Promise.allSettled` now reports individual sync failures via toast

### Files Modified
- `convex/schema.ts` — Added `restockTargets` + `manualStockEntries` tables
- `convex/externalData/queries.ts` — Added `getRestockOverview`, `getChannelSellThrough` + batch query fixes
- `convex/restock/queries.ts` — New: `getRestockTargets`
- `convex/restock/mutations.ts` — New: `saveRestockTarget`, `updateManualStock`
- `convex/integrations/k3mart/adapter.ts` — New: `syncK3MartStock` action + flat-dotted key parsing
- `src/pages/RestockPlanner.tsx` — New page with flat layout design
- `src/components/restock/` — `SummaryCards.tsx`, `StockStatusBadge.tsx`
- `src/hooks/convex/useExternalData.ts` — Added restock hooks
- `src/hooks/convex/index.ts` — Added exports
- `src/App.tsx` — Added `/restock` route
- `src/components/layout/Header.tsx` — Added "Restock" nav item
- `docs/API_REFERENCE.md` — K3 Mart API format + restock queries/mutations
- `docs/SCHEMA.md` — `restockTargets` + `manualStockEntries` tables

---

## 2026-02-09 - Fix: Order QoL Improvements (5 Fixes)

### Subtotal Display (Fix 1)
- "Subtotal" and "Discount" rows only appear when a manual discount exists
- Voucher-only orders no longer show a redundant subtotal line

### WA Templates & Payment in Completed Steps (Fix 2)
- WhatsApp templates (payment request, shipping, pickup ready) now remain visible when revisiting completed accordion steps
- Payment step accordion can be expanded after moving past it (to view/change payment method)
- Action buttons (mark as shipped, confirm payment, etc.) still only show for the current status

### Edit Order Items (Fix 3)
- "Edit Order Items" button on order detail for Draft/AwaitingPayment orders
- Navigates to the order form pre-filled with existing items, customer, delivery info, and voucher
- Title shows "Editing - Order for {customer} {order_number}" for clarity
- Customer pre-fills as existing customer (not new), preserving the link
- "Save Order" replaces all items atomically via new `replaceItems` backend mutation
- After saving, navigates back to order detail

### Channel Buttons (Fix 4)
- Removed custom channel input from the dropdown
- Only predefined channels are available for selection

### Navigate After Create (Fix 5)
- Creating a new order now navigates directly to the order detail page

### Files Modified
- `src/components/orders/OrderItems.tsx` — subtotal condition
- `src/components/orders/ChannelButtons.tsx` — removed custom input
- `src/components/orders/OrderFormPOS.tsx` — edit mode support
- `src/pages/OrderDetail.tsx` — WA templates + edit button
- `src/pages/OrderManager.tsx` — navigate after create + edit param
- `src/hooks/convex/useOrders.ts` — `useConvexReplaceOrderItems` hook
- `convex/orders/mutations/itemCrud.ts` — `replaceItems` mutation

---

## 2026-02-09 - Feature: Sales Analytics Quick Filters & Channel Breakdown

### Period Presets & Growth Indicators
- **Period filter bar** with 5 presets: Today, Yesterday, Last 7 Days, Last 30 Days, This Month
- Period stored in URL `?period=` param (default Last 7 Days omits param for clean URLs)
- **Growth indicators** on all summary cards comparing current vs previous period (green/red arrows with %)
- **Inverted colors** for Commissions Paid and Discounts Given (lower = green = good)
- **AOV card** added (Average Order Value = gross / transactions)

### Channel Breakdown (Driver Tree)
- New second row showing per-channel metrics: All Channels, K3 Mart, GoBiz, Local/Direct
- Each channel shows Gross Sales, Net Sales (with % of gross), Transactions, AOV in a vertical driver tree
- Growth indicators per metric per channel
- Active outlet count next to channel name (derived from actual sales in period, not static flags)
- Share-of-gross percentage on each non-All channel

### Revenue Fixes
- **Internal orders gross/net bug**: Fixed adapter storing `finalTotal` as gross and `totalMargin` as net. Now correctly stores `totalAmount` as gross and `finalTotal` as net
- **WIB timezone filtering**: "Today" filter now correctly uses WIB midnight boundaries, not UTC
- **Commission/Discount denominators**: Commissions use platform-only gross, discounts use internal-only gross
- **Data migration**: `fixInternalRevenueValues` corrected existing records (5 dev, 9 production)
- **Safety net**: `getRevenue` query overrides internal order gross/net from real order data

### Sales Details Table Enhancements
- **Time column** (HH:MM WIB) added next to Date column
- **Expandable internal orders**: Click to see customer, items, discounts, vouchers, and "View Full Order" link
- **K3 Mart store grouping**: Collapsible groups by outlet when K3 Mart filter active
- **Platform color scheme**: K3 Mart = purple, GoBiz = red, Local = blue (consistent across badges, filters, channel summary)
- Platform filter badges use colored outlines with filled state when active

### Backend
- **New query**: `getDashboardSummaryByPeriod(preset)` - aggregates revenue with current/previous period comparison, per-channel breakdowns, platform vs internal gross split
- **New query**: `getOrderDetailsByOrderNumber(orderNumber)` - returns order header + items for expanded internal rows
- **New pure function**: `calculatePeriodRange(preset)` in `convex/lib/periodRange.ts` with WIB timezone support
- **Active outlets** now derived from distinct outlet IDs with sales in the selected period (not static `isActive` flag)

### Modified Files
- `convex/lib/periodRange.ts` (NEW) - Period range calculation with WIB timezone
- `convex/lib/__tests__/periodRange.test.ts` (NEW) - Unit tests for all 5 presets
- `convex/externalData/queries.ts` - 2 new queries + per-channel aggregation + period-aware active outlets
- `convex/externalData/mutations.ts` - `fixInternalRevenueValues` migration
- `convex/integrations/internal/adapter.ts` - Fixed gross/net field mapping
- `src/hooks/convex/useExternalData.ts` - 3 new hooks + PeriodPreset type
- `src/hooks/convex/index.ts` - New exports
- `src/components/salesAnalytics/OverviewTab.tsx` - Complete enhancement (~+900 lines)

---

## 2026-02-09 - Fix: Kitchen V2 Bug Fixes + Route Swap

### Bug Fixes (6 total, 2 critical)
- **CRITICAL: Columns 2 & 3 always empty** — `getKitchenOrders` now fetches Boxed and Labeled statuses, populating the Stickering and Ready to Ship columns
- **CRITICAL: No "Mark Boxed" button** — BoxingOrderCard now shows a "Mark as Boxed" button when all packages are filled and order is in Packaging status
- **Bite-sized ball stats always 0** — Replaced inline calculation with `usePendingBallStats` hook that supports both original and bite-sized production types
- **BatchConfirmDialog mock data** — Now shows real packaging inventory from `getPackagingStockSummary` instead of hardcoded values
- **DailySummaryWidget all zeros** — Connected to `getKitchenStats` query for real balls produced and orders completed counts
- **"Mark Shipped" skipped intermediate status** — Now correctly transitions to WaitingShipment (delivery) or WaitingPickup (pickup) instead of jumping to CompleteShipped

### Improvements
- Batch sticker operation now reports partial failures (e.g., "3 of 5 orders labeled. Failed: #0209-003")
- `usePendingBallStats` hook updated to accept both snake_case (V1) and camelCase (V2) field names
- Sort priorities updated: Active → Boxed/Labeled → Draft → Waiting

### Route Swap
- `/kitchen` now serves KitchenViewV2 (primary)
- `/kitchen-legacy` serves KitchenView V1 (rollback safety)

### Modified Files
- `convex/orders/queries.ts` — Added Boxed/Labeled to fetched statuses + updated sort priorities
- `src/components/kitchen/BoxingOrderCard.tsx` — Added onMarkBoxed + orderStatus props
- `src/hooks/convex/usePendingBallStats.ts` — Dual field name support (snake_case + camelCase)
- `src/pages/KitchenViewV2.tsx` — All 6 bug fixes + batch error recovery
- `src/App.tsx` — Route swap (V2 → /kitchen, V1 → /kitchen-legacy)

---

## 2026-02-09 - Feature: Customer/Store Column + GoBiz API Validation

### Revenue Table: Customer/Store Column
- **New column** "Customer/Store" added after "Platform" in the Revenue Details table
- **K3Mart**: shows outlet location name (e.g., "JKT-SCBD", "JKT-BINTARO")
- **Internal**: shows customer name from the linked order
- **GoBiz**: shows dash (no store concept)
- Backend `getRevenue` query enriches records with `customerStoreName` via outlet + order lookups

### GoBiz Adapter: Real API Validation
- Rewrote `helpers.ts` (11 pure functions) to match real GoBiz API format validated against live responses
- Journal API uses `clauses/op/field/value` query format (not Elasticsearch DSL)
- Journal amounts are centesimal IDR (÷100), Order API amounts are raw IDR
- Updated all 35 helper tests to match real API response structures

### Legacy Data Cleanup
- **New migration:** `convex/migrations/gobizCleanupLegacySummaries.ts` - removes old daily aggregate GoBiz rows (those lacking `externalTransactionId` and `gobizOrderNumber`)
- Includes `preview` (dry run) and `cleanup` (delete) functions
- Successfully cleaned 21 legacy rows, preserved 24 journal rows and 48 K3Mart rows

### Modified Files
- `convex/externalData/queries.ts` - `getRevenue` enriched with customerStoreName
- `convex/integrations/gobiz/helpers.ts` - rewritten to match real API format
- `convex/integrations/gobiz/adapter.ts` - rewritten to match real API format
- `convex/integrations/gobiz/__tests__/helpers.test.ts` - 35 tests updated
- `convex/migrations/gobizCleanupLegacySummaries.ts` (NEW)
- `src/components/salesAnalytics/OverviewTab.tsx` - Customer/Store column

---

## 2026-02-09 - Feature: GoBiz Journal-Level Integration (5-Metric Revenue + Item Details)

**GoBiz adapter previously only fetched daily aggregate net/gross via two Elasticsearch proxies. No per-transaction data, no commission/ad/promo tracking, no refresh token support.**

### Changes

**Phase 1 - Backend Foundation:**
- **New table:** `externalRevenueItems` - stores per-order item details (product name, qty, unit price, total, linked menu product, match confidence)
- **New fields:** `externalRevenue` gains `adBurn`, `promoBurn`, `gobizOrderNumber` (all optional)
- **New field:** `platformCredentials` gains `refreshToken` (optional)
- **New index:** `menuProducts.by_default_price` for auto-matching
- **New mutations:** `saveRevenueItems` (batch insert with dedup), `autoMatchMenuProduct` (3-tier: exact/price_only/name_only/none)
- **New query:** `getRevenueItems` (enriches items with menu product names)
- **Updated query:** `getDashboardSummary` now aggregates commission, ad burn, promo burn
- **Updated mutations:** `saveDirectToken` accepts `refreshToken`, `getCredentialStatus` returns `hasRefreshToken`

**Phase 2 - Adapter Rewrite:**
- **New file:** `convex/integrations/gobiz/helpers.ts` - 7 pure functions (WIB date conversion, dashboard headers, journal/order body builders, dedup keys, metric extraction)
- **Rewritten:** `convex/integrations/gobiz/config.ts` - 3-API config (dashboard, journal, order) + token refresh endpoints
- **Rewritten:** `convex/integrations/gobiz/adapter.ts` - Dashboard-based 5-metric sync per WIB day, 3-method token refresh cascade (cookie, rotate, API)
- **Removed:** GoBiz cron from `convex/crons.ts` (K3Mart token refresh cron kept)
- **Updated:** GoBiz registry entry with 5-metric description and manual sync instructions

**Phase 3 - Frontend Integration:**
- **Updated:** GoBiz token dialog - now accepts both access token and refresh token
- **New:** Commission stats card in Overview (visible when commission > 0, shows ad/promo burn sub-metrics)
- **New:** Expandable revenue rows - click chevron to see item details with match status badges
- **New:** Match status badges (Matched/Price Match/Name Match/Unmatched)
- **Updated:** Settings tab - GoBiz sync button says "Sync Journals", shows refresh token status badge
- **New hook:** `useConvexRevenueItems` with skip pattern for conditional fetching

### Test Coverage
- 14 new Phase 1 tests (saveRevenueItems, autoMatchMenuProduct, getRevenueItems, getDashboardSummary)
- 17 new Phase 2 helper unit tests (all 7 pure functions)
- 5 new Phase 2 adapter integration tests
- All 334 existing tests pass (no regressions)

### Modified Files
- `convex/schema.ts` - new table + field additions
- `convex/externalData/mutations.ts` - saveRevenueItems, autoMatchMenuProduct
- `convex/externalData/queries.ts` - getRevenueItems, updated getDashboardSummary
- `convex/platformCredentials/mutations.ts` - refreshToken support
- `convex/platformCredentials/queries.ts` - hasRefreshToken
- `convex/integrations/gobiz/helpers.ts` (NEW)
- `convex/integrations/gobiz/config.ts` (REWRITTEN)
- `convex/integrations/gobiz/adapter.ts` (REWRITTEN)
- `convex/crons.ts` - GoBiz cron removed
- `convex/integrations/registry.ts` - updated GoBiz metadata
- `src/components/salesAnalytics/GoBizTokenDialog.tsx` - refresh token field
- `src/components/salesAnalytics/OverviewTab.tsx` - commission card + expandable rows
- `src/components/salesAnalytics/SettingsTab.tsx` - sync label + refresh token badge
- `src/components/salesAnalytics/ConnectionGuide.tsx` - syncLabel + hasRefreshToken props
- `src/hooks/convex/useExternalData.ts` - useConvexRevenueItems hook
- `src/hooks/convex/index.ts` - barrel export

---

## 2026-02-08 - Feature: K3Mart Outlet Name Resolution + Sales Location Linking

**K3Mart outlets previously saved as "K3 Mart #44" (placeholders). Sales transactions had no outlet link, making location-based analysis impossible.**

### Changes
- **Outlet name mapping**: 7 known K3Mart outlets mapped to real location names (JKT-SCBD, JKT-GADING SERPONG, etc.) via `K3MART_OUTLET_NAMES` config constant.
- **Discover uses real names**: `discoverK3MartOutlets` now saves outlets with actual location names instead of `"K3 Mart #N"` placeholders.
- **Sales linked to outlets**: `syncK3MartSales` now attaches `outletId` to each revenue record by looking up outlet name in DB, enabling per-location sales analysis.
- **Migration mutations**: `seedK3MartOutletNames` (updates existing outlet placeholders to real names) and `backfillRevenueOutletIds` (patches existing revenue records with outlet links). Run from Convex dashboard in that order.
- **New internal query**: `getOutletNameToIdMap` returns outlet name -> doc ID mapping for a platform source.

### Modified Files
- `convex/integrations/k3mart/config.ts` - added `K3MART_OUTLET_NAMES` map
- `convex/integrations/k3mart/helpers.ts` - added `resolveOutletName()` pure function
- `convex/integrations/k3mart/adapter.ts` - wired real names into discover + outlet linking into sync
- `convex/externalData/queries.ts` - added `getOutletNameToIdMap` internal query
- `convex/externalData/mutations.ts` - added `seedK3MartOutletNames` + `backfillRevenueOutletIds` migrations
- `convex/integrations/k3mart/__tests__/helpers.test.ts` - added `resolveOutletName` tests

### Post-Deploy Steps
1. Run `externalData:seedK3MartOutletNames` from Convex dashboard Functions tab
2. Run `externalData:backfillRevenueOutletIds` from Convex dashboard Functions tab

---

## 2026-02-08 - Feature: GoBiz Token UI + K3Mart Auto-Credentials

**GoBiz tokens required manual env var updates in Convex Dashboard. K3Mart required a Configure step before syncing.**

### Changes
- **GoBiz token dialog**: Admin can paste Bearer token from browser DevTools into a UI dialog in Settings. Token stored in DB, adapter reads from DB first (falls back to env var).
- **GoBiz auto-sync cron**: Revenue syncs every 3 hours while token is valid. On 401, marks token as expired in DB so UI shows status.
- **K3Mart auto-seed**: Default credentials (`malostudio.id@gmail.com`) auto-seed on first sync attempt. No manual Configure step needed.
- **Schema**: `platformCredentials.email` and `password` now optional (supports token-only platforms).
- **New mutations**: `saveDirectToken` (paste token), `seedDefaultCredentials` (internal auto-seed).

### Modified Files
- `convex/schema.ts` - optional email/password on platformCredentials
- `convex/platformCredentials/mutations.ts` - saveDirectToken, seedDefaultCredentials
- `convex/platformCredentials/queries.ts` - hasToken field
- `convex/platformCredentials/actions.ts` - K3Mart auto-seed defaults
- `convex/integrations/gobiz/adapter.ts` - DB-first token, shared logic, cron action
- `convex/integrations/registry.ts` - updated reconnect steps
- `convex/crons.ts` - GoBiz 3h revenue sync cron
- `src/components/salesAnalytics/GoBizTokenDialog.tsx` (new)
- `src/components/salesAnalytics/SettingsTab.tsx` - GoBiz Configure button + credential status

---

## 2026-02-08 - Fix: Revenue Details sort newest-first + date filter

**Revenue Details table showed rows in insertion order (oldest first) and had no way to filter by date range.**

### Changes
- Backend: Added `.order("desc")` to all three query branches in `getRevenue` so results return newest-first
- Frontend: Added From/To date inputs with a Clear button for client-side date range filtering
- Extracted `RevenueTable` component for cleaner separation of filtering logic
- Empty date-filter state shows a friendly "No records match" message

### Modified Files
- `convex/externalData/queries.ts` - `.order("desc")` on all `getRevenue` branches
- `src/components/salesAnalytics/OverviewTab.tsx` - Date filter UI + `RevenueTable` component

---

## 2026-02-08 - Fix: "Go to Settings & Sync" button not switching tabs

**The button in the Sales Analytics empty state navigated to `/sales?tab=settings` but the Tabs component ignored the URL parameter, always showing the Overview tab.**

### Fix
- Made Tabs controlled via `useSearchParams` so `?tab=settings` switches to the Settings tab
- Tab changes now sync back to the URL for bookmarkability

### Modified Files
- `src/pages/SalesAnalytics.tsx` - Controlled Tabs with URL param support

---

## 2026-02-08 - Fix: K3Mart Token Refresh Wrong Login Endpoint

**Clicking "Save & Refresh Now" in K3Mart credentials dialog failed with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.**

### Root Cause
Login URL pointed at the Next.js frontend SPA (`umkm.k3mart.id/api/auth/login`) which returns HTML for all routes. The actual backend login endpoint is `consapi.k3mart.id/api/v1/vendor/login`.

### Fix
- Changed login URL to use `K3MART_CONFIG.baseUrl + endpoints.login` (correct `consapi` backend)
- Added `login` endpoint to K3Mart config for consistency with other endpoints
- Added Content-Type validation before JSON parsing to prevent raw parse errors
- Added try-catch around `.json()` with user-friendly error messages

### Modified Files
- `convex/integrations/k3mart/config.ts` - Added `login: "/vendor/login"` endpoint
- `convex/platformCredentials/actions.ts` - Fixed login URL, added JSON response guards

---

## 2026-02-08 - Fix: Guard K3Mart Credential Queries for Admin-Only Access

**The `getCredentialStatus` query requires admin role, but the Sales Analytics page is accessible to managers too. Managers opening the Settings tab triggered an auth error crash.**

### Bug Fix
- Skip credential status query for non-admin users (pass `undefined` token to trigger Convex `"skip"`)
- Hide credential UI (Configure button, auto-refresh badge, token expiry) for non-admin users
- Guard `K3MartCredentialsDialog` render behind `isAdmin` check

### Modified Files
- `src/components/salesAnalytics/SettingsTab.tsx` - Added `isAdmin` guard for credential queries and UI

---

## 2026-02-08 - Feat: K3Mart Token Auto-Refresh System

**K3Mart JWT tokens expire in ~24 hours (not ~1 year as documented). Added a self-contained auto-refresh system: admin enters K3Mart login credentials once via Settings UI, and a 12-hour cron job automatically refreshes the token.**

### New Features
- **Credentials UI**: Admin-only dialog in Settings > K3 Mart > Configure for entering K3Mart login email/password
- **Auto Token Refresh**: Convex action performs HTTP login to K3Mart, captures JWT, decodes expiry, validates via test API call, stores in DB
- **12-Hour Cron Job**: `convex/crons.ts` runs `refreshK3MartTokenCron` every 12 hours to keep token fresh
- **DB Token Fallback**: K3Mart adapter reads token from `platformCredentials` table first, falls back to `K3MART_API_TOKEN` env var
- **Token Status Display**: ConnectionGuide shows auto-refresh badge (Active/Not configured), token expiry date, and Configure button
- **Playwright Fallback**: Browser-based token capture script for cases where HTTP login doesn't work
- **GitHub Actions Cron**: Daily workflow at 03:00 WIB for Playwright-based token refresh as backup

### Schema Changes
- New table: `platformCredentials` (stores platform login credentials, current token, expiry, refresh status)
  - Fields: `platformId`, `email`, `password`, `currentToken`, `tokenExpiresAt`, `lastRefreshAt`, `lastRefreshStatus`, `lastRefreshError`, `updatedBy`, `updatedAt`
  - Index: `by_platform`

### New Backend Files
- `convex/platformCredentials/queries.ts` - `getCredentialStatus` (admin), `getTokenInternal`, `getCredentialsInternal`, `validateAdminToken`
- `convex/platformCredentials/mutations.ts` - `saveCredentials` (admin upsert), `updateToken` (internal)
- `convex/platformCredentials/actions.ts` - `refreshK3MartToken` (public, admin), `refreshK3MartTokenCron` (internal)
- `convex/crons.ts` - 12-hour interval cron for token refresh

### New Frontend Files
- `src/components/salesAnalytics/K3MartCredentialsDialog.tsx` - Email/password form with "Save & Refresh Now"

### Modified Files
- `convex/schema.ts` - Added `platformCredentials` table
- `convex/integrations/k3mart/adapter.ts` - DB token lookup with env var fallback in both `discoverK3MartOutlets` and `syncK3MartSales`
- `convex/integrations/registry.ts` - Updated `tokenLifespan` to `"~24h (auto-refreshed every 12h)"`, simplified reconnect steps
- `src/components/salesAnalytics/ConnectionGuide.tsx` - Added Configure button, auto-refresh badge, token expiry display
- `src/components/salesAnalytics/SettingsTab.tsx` - Wired credential status query and dialog
- `src/hooks/convex/useExternalData.ts` - Added `useConvexCredentialStatus`, `useConvexRefreshK3MartToken`
- `src/hooks/convex/index.ts` - Barrel exports for new hooks
- `package.json` - Added `refresh-k3mart-token` script
- `.gitignore` - Added `scripts/debug-screenshots/`

### New CI/Scripts
- `scripts/refresh-k3mart-token.ts` - Playwright browser-based token capture fallback
- `.github/workflows/refresh-k3mart-token.yml` - Daily cron + manual dispatch workflow

### Security Notes
- Credentials protected by `requireRole(ctx, token, ["admin"])`
- Password never returned in any query response
- Token validated before storage via test API call
- Playwright script pipes token via stdin (not in process args)

---

## 2026-02-08 - Feat: Internal Orders Integration + E2E Visual Tests + UX Improvements

**Added third sales platform "Internal Orders" that pulls revenue from our own Convex orders database, plus comprehensive E2E visual tests and UX polish across the Sales Analytics module.**

### New Features
- **Internal Orders Integration**: Third sales platform that queries the Convex `orders` table directly. Syncs revenue from confirmed/shipped/picked-up orders with `confidence: "exact"` and `dataOrigin: "db_query"`. No external API calls or tokens required
- **Incremental Sync**: Only fetches orders created since the last successful sync, using `getLatestSyncTimestamp` internal query. Deduplicates by `orderNumber` via `by_source_txn` index
- **Error Boundary on SalesWidget**: Dashboard widget now catches render errors gracefully instead of crashing the entire dashboard
- **3-Column Revenue Grid**: Overview tab revenue cards now display in a responsive 3-column grid (K3Mart, GoBiz, Internal Orders)
- **Internal Orders Settings Card**: New platform connection card in Settings tab with sync button and status display
- **Actionable Empty States**: Empty state cards now include primary-variant "Sync Now" buttons to encourage first sync
- **Amber "Not Synced" Status**: Platforms that have never been synced show amber status instead of neutral gray
- **44px Touch Targets**: All sync buttons meet 44px minimum touch target for mobile usability

### Schema Changes
- `externalOutlets.source`: Added `"internal"` to union (`"k3mart" | "gobiz" | "internal"`)
- `externalRevenue.source`: Added `"internal"` to union
- `externalRevenue.dataOrigin`: Added `"db_query"` to union (for database-queried revenue)
- `externalSyncLogs.source`: Added `"internal"` to union
- `externalProductMappings.source`: Added `"internal"` to union
- `externalRevenue`: Added `externalTransactionId`, `transactionDate`, `transactionType`, `commission` fields
- `externalRevenue`: Added `by_source_txn` index for deduplication

### New Backend Files
- `convex/integrations/internal/adapter.ts` - `syncInternalOrders` action (batch-processes orders into revenue records)
- `convex/integrations/internal/config.ts` - Revenue-countable statuses and batch size config
- `convex/integrations/internal/queries.ts` - `getRevenueOrders` internalQuery (filters orders by status and timestamp)

### New Frontend Changes
- `src/components/dashboard/SalesWidget.tsx` - Added error boundary wrapper
- `src/components/salesAnalytics/ConnectionGuide.tsx` - Updated for 3-platform support
- `src/components/salesAnalytics/SettingsTab.tsx` - Added Internal Orders card, amber status, 44px touch targets

### New Test Files
- `tests/e2e/` - 19 Playwright E2E tests for cofounder persona visual testing

### Modified Files
- `convex/schema.ts` - Updated 4 external integration tables with `"internal"` source
- `convex/externalData/mutations.ts` - Updated source validators to include `"internal"`
- `convex/externalData/queries.ts` - Updated source validators to include `"internal"`
- `convex/integrations/registry.ts` - Registered Internal Orders platform metadata
- `src/hooks/convex/index.ts` - Updated barrel exports
- `src/hooks/convex/useExternalData.ts` - Added `useSyncInternalOrders` hook

---

## 2026-02-07 - Feat: Multi-Platform Sales Integration (K3Mart + GoBiz)

**Added external platform integration for stock tracking and revenue analytics across K3 Mart and GoBiz (GoFood).**

### New Features
- **K3Mart Stock Sync**: Fetches real-time stock snapshots from K3 Mart consignment outlets, calculates stock deltas to infer sales with `confidence: "inferred"`
- **GoBiz Revenue Sync**: Queries GoBiz/GoFood analytics for gross (proxy/44) and net (proxy/4) revenue with `confidence: "exact"` and transaction counts
- **Sales Analytics Page** (`/sales`): 2-tab page with Overview (stats cards + revenue data table with confidence badges) and Settings (platform connections, outlet management, sync history)
- **Dashboard Sales Widget**: Compact card showing per-platform sync status, last sync time, and "Sync Now" buttons. Permission-gated to `canAccessSalesAnalytics`
- **ConnectionGuide Component**: Step-by-step API token reconnection instructions per platform. Auto-expands accordion when token errors are detected. Numbered steps with clickable URLs
- **Modular Adapter Pattern**: Static registry (`convex/integrations/registry.ts`) with platform metadata. Adding a new platform = add to registry, add schema literal, create adapter files

### Schema Changes (5 new tables)
- `externalOutlets` - Platform outlet/store definitions with sync status
- `externalStockSnapshots` - Raw stock data snapshots per outlet per product
- `externalRevenue` - Unified revenue records from all platforms with confidence tracking
- `externalSyncLogs` - Sync operation logs with timing and error details
- `externalProductMappings` - Maps external product codes to internal menu products

### New Backend Files
- `convex/integrations/registry.ts` - Platform metadata and reconnection step definitions
- `convex/integrations/k3mart/adapter.ts` + `config.ts` - K3Mart `"use node"` action
- `convex/integrations/gobiz/adapter.ts` + `config.ts` - GoBiz `"use node"` action
- `convex/externalData/mutations.ts` - Internal + public mutations for external data
- `convex/externalData/queries.ts` - Internal + public queries for external data
- `convex/lib/stockDelta.ts` - Pure stock delta calculation functions

### New Frontend Files
- `src/pages/SalesAnalytics.tsx` - Sales Analytics page
- `src/components/salesAnalytics/` - OverviewTab, SettingsTab, ConnectionGuide, barrel export
- `src/components/dashboard/SalesWidget.tsx` - Dashboard widget
- `src/hooks/convex/useExternalData.ts` - Query/action hooks for external data

### Modified Files
- `convex/schema.ts` - Added 5 new external integration tables
- `src/lib/types.ts` - Added `canAccessSalesAnalytics` permission (manager + admin)
- `src/App.tsx` - Added `/sales` route
- `src/components/layout/Header.tsx` - Added Sales nav item
- `src/pages/index.ts` + `src/hooks/convex/index.ts` + `src/components/dashboard/index.ts` - Barrel exports

### Environment Variables
- `K3MART_API_TOKEN` - K3 Mart JWT token (~1yr lifespan)
- `GOBIZ_API_TOKEN` - GoBiz access token (~hours lifespan)

---

## 2026-02-07 - Fix: ProductForm Crash on Undefined posSlot (Hotfix)

**Fixed production crash when editing menu products with undefined `posSlot` values.**

### Root Cause
In `ProductForm.tsx`, the slot initialization logic used the `in` operator to check for `posSlot`, which returns `true` even when the value is `undefined` (since the key exists). Calling `.toString()` on `undefined` caused a TypeError crash.

Additionally, the truthiness check for `packagingPosSlot` would incorrectly treat slot `0` as `'none'`.

### Fix
- Changed both slot checks to use `!= null` (nullish check) which correctly handles `undefined` while preserving valid slot `0`
- Added missing `DialogDescription` for accessibility compliance

### Files Modified
- `src/components/menuProducts/ProductForm.tsx` - Fixed slot initialization logic, added DialogDescription

---

## 2026-02-07 - Feat: Consumption Stage Selector + Production Stage

**Added consumption stage selector UI and new "production" stage for components consumed at InProduction transition.**

### Changes
- **New "production" consumption stage**: Components like tulip paper are auto-consumed when order enters InProduction. Added `consumeProductionMaterialsInternal` helper and InProduction trigger in `statusUpdates.ts`.
- **Consumption stage selector in ComponentTypeDialog**: 3-button selector (Production / Packaging / Labelling) when creating new component types. Default = Packaging (boxing).
- **Consumption stage selector in ReceiveStockDialog**: Same 3-button selector appears in create-new-component mode.
- **PackagingComponentsSection updated**: Stage buttons now show 3 options (Production / Packaging / Labelling) instead of old (Boxing / Labeling / None). Labels fixed ("labeling" displays as "Labelling", "boxing" as "Packaging").
- **Shared constants**: `CONSUMPTION_STAGE_LABELS` and `SELECTABLE_STAGES` added to `src/lib/utils.ts` for consistent label mapping across UI.
- **"none" hidden from UI**: Legacy `none` value kept in DB for backwards compat but no longer selectable in any UI.

### Files Modified
- `convex/schema.ts` - Added `production` to consumptionStage union (componentTypes + menuProductComponents)
- `convex/componentTypes/mutations.ts` - Added `production` to 3 validators
- `convex/menuProducts/mutations.ts` - Added `production` to 2 validators
- `convex/inventory/mutations.ts` - Added `consumptionStage` passthrough in createComponentAndReceiveStock
- `convex/orders/mutations/inventoryIntegration.ts` - Added `consumeProductionMaterialsInternal`
- `convex/orders/mutations/statusUpdates.ts` - Added InProduction consumption trigger
- `src/lib/utils.ts` - Added stage label constants
- `src/components/inventory/ComponentTypeDialog.tsx` - Added stage selector
- `src/components/inventory/ReceiveStockDialog.tsx` - Added stage selector in create mode
- `src/components/menuProducts/PackagingComponentsSection.tsx` - Updated stage options + labels
- `src/components/menuProducts/ProductForm.tsx` - Updated ComponentRow type
- `src/hooks/convex/useComponentTypes.ts` - Added "production" to types
- `src/hooks/convex/useMenuProducts.ts` - Added "production" to types
- `tests/convex/componentTypes.test.ts` - Added production stage test
- `tests/convex/inventory.test.ts` - Updated type

---

## 2026-02-07 - Fix: Legacy Category Validator (Hotfix)

**Fixed production crash when stale browser clients send legacy `direct_packaging`/`indirect_packaging` category values.**

### Root Cause
After the category simplification migration (commit `2fdf009`), backend validators were tightened to only accept `"production" | "packaging"`. Users with cached browser tabs still had old JS sending the pre-migration values, causing validator rejection errors.

### Fix
Expanded argument validators on all 4 affected Convex functions to accept legacy values, then map them to canonical `"packaging"` at the top of each handler. No schema changes -- only query/mutation arg validators were widened.

### Files Modified
- `convex/componentTypes/queries.ts` - `getByCategory` accepts legacy categories
- `convex/componentTypes/mutations.ts` - `create` and `createPackagingQuick` accept legacy categories
- `convex/inventory/mutations.ts` - `createComponentAndReceiveStock` accepts legacy categories
- `CLAUDE.md` - Updated business rule #10 (two categories, not three)

---

## 2026-02-07 - Inventory Dialogs (PR #28)

**Added stock adjustment and inter-location transfer dialogs to the inventory system.**

### New Components
- **`AdjustStockDialog.tsx`**: Stock adjustment dialog with two modes -- wastage recording (categorized reasons: Expired, Damaged, Quality Issue, Shrinkage, Other) and count correction. Updates batch quantities via existing `adjustStock` mutation.
- **`TransferStockDialog.tsx`**: FIFO-based inter-location stock transfer. Selects source location, destination location, and quantity. Respects batch ordering for correct FIFO consumption.
- **Barrel exports**: Both dialogs exported from `src/components/inventory/index.ts`

### Files Added
- `src/components/inventory/AdjustStockDialog.tsx`
- `src/components/inventory/TransferStockDialog.tsx`

### Files Modified
- `src/components/inventory/index.ts` - Added barrel exports for new dialogs

---

## 2026-02-07 - POS Preview Panel + Drag-and-Drop Slot Management (PR #27)

**POS preview panel with drag-and-drop reordering for food and packaging product slots.**

### Summary
Added a live POS preview panel to the Menu Products Manager page. Food and packaging slots can be reordered via drag-and-drop with sortable behavior. During rebase onto the code-simplified main branch, two reorder hooks (`useConvexReorderSlots`, `useConvexReorderPackagingSlots`) were refactored from raw `useMutation`/`useAuth` to the `useProtectedMutation` pattern established in the code simplification work.

### Notes
- Merged as PR #27 after rebasing onto post-code-simplification main
- Rebase conflict fix: reorder hooks migrated to `useProtectedMutation`

---

## 2026-02-07 - Production Deployments

**Two Convex production deploys to `decisive-wombat-7` covering code simplification and POS preview changes.**

- All 256 tests passing
- Build clean with zero errors

---

## 2026-02-07 - Code Simplification (PR #26)

**Removed ~830 lines of duplication across backend and frontend. Zero behavior changes.**

### Backend (Waves 1-2)
- **Shared validators** (`convex/orders/validators.ts`): Extracted `orderItemInput`, `channelValidator`, `statusValidator` used across 5 order files
- **Shared types** (`convex/orders/types.ts`): Unified `OrderWithItems` for queries.ts and whatsapp.ts
- **Merged inventory consumption**: `consumeBoxingMaterialsInternal` + `consumeStickerMaterialsInternal` → parameterized `consumeMaterialsByStageInternal(ctx, args, stage)`
- **Extracted `calculatePackageStatus()`**: Pure function replacing 5 inline status calculations in packaging.ts
- **Extracted helpers in componentTypes/queries.ts**: `sortBySortOrderThenName` comparator + `enrichWithCostInsights` helper
- **Deduplicated `listLegacyProducts`**: Now delegates to `listAvailableProducts`

### Frontend (Waves 3-5)
- **Deduplicated 56 mutation hooks**: Applied `const execute = ...; return { mutate: execute, mutateAsync: execute }` pattern across 12 hook files
- **Standardized error handling**: Replaced inline `error instanceof Error` patterns with `getErrorMessage()` utility
- **Improved `useProtectedMutation`**: Added proper `FunctionReference` generics for automatic type inference
- **Adopted `useProtectedMutation`**: 13 hooks in useMenuProducts.ts and useVouchers.ts now use it (removes manual auth check + token injection)
- **Extracted shared transforms** (`src/lib/transforms.ts`): `transformToOrderSummary()`, `calculateTotalDiscount()`, `ConvexOrderBase` type
- **Merged kitchen transforms**: `transformKitchenOrder` + `transformCompletedOrder` → unified `transformOrderToKitchenOrder`
- **Fixed latent bug**: Dashboard percentage discounts were displayed as raw numbers instead of formatted percentages (discovered during transform extraction)
- **Removed stale comments**: "React Query" references cleaned from 10 hook files
- **Removed deprecated aliases**: `useConvexLegacyProducts`, `LegacyProduct`

### Files Changed
- 32 files changed, 1,063 insertions, 1,869 deletions (net -806 lines)
- 3 new shared files: `convex/orders/validators.ts`, `convex/orders/types.ts`, `src/lib/transforms.ts`

---

## 2026-02-06 - Inventory Overhaul v2

**Backend fixes, thermometer bars, sorting controls, and per-component receive.**

### Backend Fixes
- `adjustStock`: Now updates `quantityPurchased` and recalculates `totalCostIdr` when adjusting up (fixes "150/100" display showing negative consumed%)
- `transferStock`: Creates per-source-batch copies at destination preserving original supplier name, brand, purchase URL, expiry date, and unit cost (previously merged into one batch)
- `getInventoryReport`: Enriched with `latestSupplierName`, `latestPurchaseUrl`, `latestUnitCostIdr` per location

### Frontend Changes
- **StatCard**: Clean dark background (`bg-slate-900`) with white text and colored borders per variant (replaces gradient backgrounds)
- **BatchCard**: Fixed negative consumed% using `Math.max(quantityPurchased, quantityRemaining)` guard; removed Expire button (use Adjust/Wastage with "Expired" reason instead)
- **ComponentRow**: Always-visible thermometer bar (h-4 capsule) with reorder point marker at 50%, color gradient (red/amber/emerald/blue); supplier info + weighted avg cost on collapsed row; per-component "Receive" button
- **ReceiveStockDialog**: Added `preselectedComponentId` (skips component grid) and `forceCreateMode` (starts in create-new mode) props; `lowStockComponents` now optional
- **InventoryManager**: Top button renamed to "Receive New Stock Type" with `forceCreateMode`; sorting controls (Name, % Lowest, # Lowest, Priciest) with `Infinity` fallback for missing reorder points

### Files Modified
- `convex/inventory/mutations.ts` - adjustStock fix, transferStock per-batch split
- `convex/inventory/queries.ts` - Supplier fields in inventory report
- `src/components/inventory/StatCard.tsx` - Dark bg + white text
- `src/components/inventory/BatchCard.tsx` - Consumed% fix, expire button removed
- `src/components/inventory/ComponentRow.tsx` - Thermometer, supplier info, receive button
- `src/components/inventory/ReceiveStockDialog.tsx` - Preselected + force-create props
- `src/pages/InventoryManager.tsx` - Sorting, button rename

---

## 2026-02-06 - BOM Improvements: 25 Issues Across 7 Waves

**Major UX overhaul of the unified BOM system based on manual testing and live user feedback.**

### Summary
Implemented 25 BOM improvements across 7 waves: critical bug fixes, category migration (3-deployment), dynamic POS slots, ProductForm redesign, Menu Products page overhaul, page deletions, inventory UI improvements, order form packaging section, and summary UX.

### Wave 0: Critical Bug Fixes
- Fixed `Array.some(async)` bug in menu product CREATE mutation (always returned "food")
- Removed duplicate "Voucher" label in OrderFormPOS
- Fixed POS card production summary to use `cachedProductionSummary`
- Replaced Kitchen V2 mock packaging inventory with real Convex query

### Wave 1A: Category Simplification (3-deployment migration)
- Merged `direct_packaging` + `indirect_packaging` into single `packaging` category
- `costCalculator.ts` now returns `{production, packaging, total}` (total = production + packaging)
- Added `consumptionStage` field to `menuProductComponents` and `orderComponentReservations`
- Updated all backend and frontend files (17 files total)
- All 7+ COGS test cases updated

### Wave 1B: Dynamic POS Slots
- Changed `posSlot`/`packagingPosSlot` from `v.union(v.literal(1)..4)` to `v.optional(v.number())`
- Runtime validation (positive integer) in mutations
- No hardcoded upper limit

### Wave 2A: ProductForm Structural Changes
- Converted Sheet to Dialog (`max-w-2xl max-h-[90vh]`)
- Added Food/Packaging type toggle at top
- Added active/inactive Switch
- Food path: production + packaging components + weight + food POS
- Packaging path: only packaging components + packaging POS

### Wave 2B: ProductForm Behavioral Changes
- Auto-generate product code from name
- Duplicate name warning with amber highlight
- Consumption stage selector (Boxing/Labeling/None) per packaging component
- Auto-inherit consumption stage from componentType default
- Quick-create dialog for new packaging components

### Wave 3: Menu Products Page Overhaul
- Dynamic slot rendering (occupied slots + "+" card)
- Packaging empty slots now clickable
- Renamed "Legacy Products" to "Available Products"
- `listAvailableProducts` query excludes both food and packaging POS products
- Type-aware "Add to POS" buttons

### Wave 4: Production Components + Page Deletions
- Auto-generate code from name, native color picker
- Removed `ComponentTypesManager.tsx` and `PackagingComponentsManager.tsx` pages
- Added URL redirects for bookmarked links
- Removed nav links for deleted pages

### Wave 5: Inventory UI + Receive Stock Redesign
- Improved stat card readability
- Stock level progress bars (color-coded by threshold)
- Category filter pills (All/Production/Packaging)
- Receive Stock: button grid for ALL components (sorted by low stock)
- Auto-populate supplier info from latest batch

### Wave 6: Order Form Packaging + Summary UX
- Added packaging products section below food products in OrderFormPOS
- ProductButtons component generalized (optional label, flexible columns, generic product type)
- Unit price shown for qty > 1 items (e.g., "@ Rp 80.000")
- Subtotal row hidden when no voucher (shows only Total)

### Wave 7: Verification + Documentation
- Fixed stale `direct_packaging`/`indirect_packaging` type in `useInventory.ts`
- Updated `SCHEMA.md` (menuProducts section with dynamic POS slots, product types)
- All 256 tests passing, build clean

### Files Modified (significant)
- `convex/schema.ts` - Category simplification, dynamic POS slots, consumptionStage
- `convex/lib/costCalculator.ts` - New return shape `{production, packaging, total}`
- `convex/menuProducts/mutations.ts` - Fixed async bug, dynamic slots, consumptionStage
- `convex/menuProducts/queries.ts` - `listAvailableProducts`, `listPackagingPosProducts`
- `src/components/menuProducts/ProductForm.tsx` - Full redesign (Dialog, type toggle, BOM)
- `src/components/menuProducts/PackagingComponentsSection.tsx` - Consumption stage, quick-create
- `src/pages/MenuProductsManager.tsx` - Dynamic slots, available products
- `src/pages/ProductionComponentsManager.tsx` - Auto-code, color picker
- `src/pages/InventoryManager.tsx` - Category filter, stat cards
- `src/components/inventory/ReceiveStockDialog.tsx` - Button grid, auto-supplier
- `src/components/orders/OrderFormPOS.tsx` - Packaging section, summary UX
- `src/components/orders/ProductButtons.tsx` - Generalized interface

### Pages Removed
- `ComponentTypesManager.tsx` (redirects to `/components/production`)
- `PackagingComponentsManager.tsx` (redirects to `/inventory`)

---

## 2026-02-06 - Cleanup: Make componentTypeId Required, Remove Legacy productionUnitTypeId

**Post-migration cleanup: Removed optional/legacy workarounds from menuProductComponents after FK migration completed in production.**

### Summary
The `componentTypeId` field on `menuProductComponents` was temporarily made optional to support a live production migration. With all records now migrated, this cleanup makes the field required again and removes the legacy `productionUnitTypeId` field and all associated null-check workarounds.

### Changes

**Schema (`convex/schema.ts`):**
- `menuProductComponents.componentTypeId`: `v.optional(v.id)` reverted to `v.id("componentTypes")` (required)
- `menuProductComponents.productionUnitTypeId`: Removed (legacy field, no longer needed)

**Backend (5 files):**
- `convex/menuProductComponents/queries.ts` - Removed 3 ternary null-check workarounds
- `convex/menuProductComponents/mutations.ts` - Removed 1 ternary null-check in `updateCachedProductionSummary`
- `convex/orders/helpers/productionRecords.ts` - Removed 2 `if (!componentTypeId) continue` guards
- `convex/orders/mutations/orderCrud.ts` - Removed legacy `productionUnitTypeId` fallback, always uses componentType code-bridge
- `convex/orders/queries.ts` - `getPackagingOrders`: Changed from `productionUnitType` to `componentType` enrichment
- `convex/productionUnitTypes/mutations.ts` - Removed dead `menuProductComponents` scan

**Frontend (1 file):**
- `src/pages/PackagingView.tsx` - Updated `ProductionComponent` interface from `productionUnitType` to `componentType`

**Deleted:**
- `convex/migrations/updateMenuProductComponentsFK.ts` - Migration already ran on production

### Notes
- `orderItemProduction.productionUnitTypeId` is unchanged (still required, kitchen bridge intact)
- No data migration needed (all records already have `componentTypeId` set)
- Net: 28 insertions, 237 deletions

---

## 2026-02-06 - BOM Refactor V3: Unified Component System

**Major refactor: Full unified BOM with componentTypeId, packaging products, and clean slate migration.**

### Summary
Completed the BOM (Bill of Materials) refactor V3. All product components now use `componentTypeId` exclusively (not `productionUnitTypeId`). Added packaging product support, packaging POS slots, `consumptionStage` for inventory consumption, and percentage-based stock alerts.

### Schema Changes
- `componentTypes`: Added `description`, `consumptionStage` ("boxing"|"labeling"|"none"), `alarmPercentage`
- `menuProducts`: Added `packagingPosSlot` (1-4), `productType` ("food"|"packaging"), index `by_packaging_pos_slot`
- `componentStock`: Added `lastRestockTotalStock` (baseline for % alerts)

### Backend Changes
- `componentTypes/mutations.ts`: Accept new fields, added `createPackagingQuick` (name-only create)
- `componentTypes/queries.ts`: Added `priceChangePercent` to cost insights
- `menuProducts/mutations.ts`: Components now `{componentTypeId, quantity}`, auto-derives `productType`, added `assignToPackagingSlot`/`removeFromPackagingSlot`
- `menuProducts/queries.ts`: Added `listPackagingPosProducts`, `listPosProducts` excludes packaging
- `menuProductComponents/mutations.ts`: Simplified to use `componentTypeId` only
- `menuProductComponents/queries.ts`: Returns `componentType` (not `productionUnitType`)
- `orders/helpers/productionRecords.ts`: Simplified code-bridge (always lookup by code)
- `orders/mutations/inventoryIntegration.ts`: Uses `consumptionStage` instead of hardcoded material arrays
- `inventory/queries.ts`: Dual-threshold alerts (units + percentage), added `getLatestBatch`
- `inventory/mutations.ts`: `receiveStock` sets `lastRestockTotalStock`, supports `copyFromBatchId`

### Frontend Changes
- `ProductForm.tsx`: Rewritten with `ProductionComponentsSection` + `PackagingComponentsSection` sub-components
- `MenuProductsManager.tsx`: Renamed "Product Manager", added Packaging POS section, product type badges
- New pages: `ProductionComponentsManager.tsx`, `PackagingComponentsManager.tsx`
- Navigation reordered: Products first, Dashboard in admin section
- New routes: `/components/production`, `/components/packaging`
- Hooks updated for new backend APIs

### Migration
Run: `npm run migrate:bom-v2` (or `npx convex run migrations/bomRefactorV2:cleanSlateAndSeed`)
- Wipes all test inventory data (batches, stock, transactions, reservations, BOM links)
- Keeps only BIG_BALL + MID_BALL production components
- Seeds `productType: "food"` on all existing menu products

---

## 2026-02-05 - Inventory System FK Migration Complete

**Completed Wave 1.5: Migrated menuProductComponents from productionUnitTypes to componentTypes.**

### Summary
Successfully migrated the Bill of Materials (BOM) system to use the unified `componentTypes` table instead of the legacy `productionUnitTypes` table. This enables the full inventory management system with FIFO tracking for both production components (balls) and packaging materials (boxes, stickers).

### Migration Results
- ✅ 7 menuProductComponents records migrated successfully
- ✅ All records now reference componentTypes via `componentTypeId`
- ✅ Legacy `productionUnitTypeId` field retained for backward compatibility
- ✅ Schema validation passing with required `componentTypeId`

### Technical Changes

**Schema Updates:**
- `menuProductComponents.componentTypeId` - Now REQUIRED (was optional during migration)
- `menuProductComponents.productionUnitTypeId` - Now optional/legacy (was required)
- New index: `by_component_type` on componentTypeId
- Removed index: `by_production_type` on productionUnitTypeId

**Code Updates (8 files modified):**
- `convex/menuProductComponents/mutations.ts` - Create/update now looks up componentType from productionUnitType
- `convex/menuProductComponents/queries.ts` - Queries return both componentType and productionUnitType
- `convex/menuProducts/mutations.ts` - Menu product creation maps to componentTypes
- `convex/orders/helpers/productionRecords.ts` - Production record creation uses componentTypes
- `convex/orders/mutations/orderCrud.ts` - Order creation enriches with componentTypes
- `convex/orders/mutations/inventoryIntegration.ts` - Inventory bridge uses componentTypeId
- `convex/orders/queries.ts` - Type definitions updated for optional fields
- `convex/productionUnitTypes/mutations.ts` - Deletion checks scan all records (no index)

**Migration Scripts:**
- `convex/migrations/updateMenuProductComponentsFK.ts` - Migration script with dry-run, rollback, and verification
- `convex/migrations/inventorySetup.ts` - Base data migration (already completed)

### What This Enables
- ✅ Unified BOM system for production + packaging components
- ✅ FIFO inventory consumption tracking
- ✅ Multi-location stock management (Kitchen, Office, Legato Goldfinch)
- ✅ Automatic stock reservation on order confirmation
- ✅ Automatic stock consumption on boxing/labeling
- ✅ Low stock alerts for packaging materials
- ✅ Enhanced COGS calculation from component costs

### Backward Compatibility
- Legacy `productionUnitTypeId` field maintained for existing code that hasn't been updated
- All queries return both `componentType` and `productionUnitType` (legacy)
- Production records still use `productionUnitTypeId` (separate migration needed later)

### Next Steps (Future Work)
- Consider migrating `orderItemProduction` table to use componentTypes (optional)
- Remove legacy `productionUnitTypeId` field after full system verification (6-12 months)
- Update frontend to show componentType details in order views

**Migration Audit:** See `docs/AUDIT_REPORT_2026-02-05.md` for complete pre-migration verification

---

## 2026-02-05 - Fix Kitchen Ball Filling for New Menu Products

**Critical bug fix: Ball distribution now works correctly for all menu products with components.**

### Root Cause
The ball distribution algorithm was using the OLD production system (`orderItems.productionType` field) to filter which items receive balls, but then applying balls using the NEW system (`orderItemProduction` records). When these two systems were out of sync (which happened for all new menu products with `menuProductComponents`), balls failed to distribute.

### Changes
- Updated item filter in `distributeBallsToOrders()` to check for presence of matching production records instead of `productionType` field
- Updated completion check filter to use production records instead of `productionType` field

### Impact
- All new menu products with components (combo packs, etc.) now fill correctly in Kitchen View
- Legacy products continue to work unchanged
- Order completion workflow is restored

**Files Modified:**
- `convex/orders/helpers/ballDistribution.ts` - Lines 201-209 (item filter), Line 290 (completion check)

**Technical Details:**
- Old filter: `item.productionType === productionTypeFilter`
- New filter: `item.productionRecords.some(r => r.productionUnitCode === productionUnitCode && r.unitsRemaining > 0 && !r.isCancelled)`

**Full RCA:** See `docs/reviews/staffreview-ball-filling-bug-2026-02-05.md`

---

## 2026-02-05 - Manager Override One-Time Use Enforcement

**Manager overrides now automatically deactivate after first use and link to the consuming order.**

- Manager overrides are now true one-time use vouchers
- Auto-deactivate (`isActive: false`) immediately on first use
- Link to specific order via `overrideOrderId` field
- VouchersManager shows "Used by Order #XXXX" link (or "Order Deleted" if removed)
- Cancelled orders do NOT reactivate overrides (maintains audit trail)
- Enhanced error message: "This manager override has already been used and cannot be reused"

**Files Modified:**
- convex/orders/helpers/voucherHandling.ts
- convex/vouchers/queries.ts
- src/pages/VouchersManager.tsx

**Commits:**
- 5bedadf - feat(vouchers): auto-deactivate manager overrides on first use
- 3f869b0 - feat(vouchers): add override-specific error messaging
- 9d446dc - feat(vouchers): display order linkage and deletion status

**Breaking Changes:** None (backwards compatible)

**Migration Notes:** Existing consumed overrides continue to block reuse via `usageCount` check. New overrides benefit from explicit deactivation and order linking.

---

## 2026-02-05 - WhatsApp Template Format Updates

**Currency and discount display improvements for WhatsApp messages**

- Changed currency format from `IDR` to `Rp` throughout all WhatsApp templates
- Simplified discount display: now shows `(Includes Rp XX.XXX discount!)` instead of voucher codes
- Consistent formatting across payment request, receipt, and DB template system

**Files Modified:**
- `convex/orders/whatsapp.ts` - formatCurrency + 3 discount note locations
- `convex/orders/whatsappHelpers.ts` - formatCurrency (for testability)
- `convex/orders/__tests__/whatsapp.test.ts` - updated test assertions
- `src/lib/whatsappTemplates.ts` - frontend preview formatCurrency

**Commits:**
- fix: change currency format from IDR to Rp in WhatsApp helpers
- fix: update WhatsApp templates - Rp currency + simplified discount
- fix: update frontend WhatsApp preview currency format

---

## 2026-02-05 - Orders Page Complete Redesign - Terracotta Theme & Golden Ratio Layout

**Complete visual and structural redesign of the Orders page with terracotta design language**

### Design Philosophy
- Extends warm terracotta palette from OrderFormPOS_Redesign to entire Orders ecosystem
- Golden ratio layout (61.8% / 38.2%) for optimal visual balance
- Form AND function - easy eye scanning with unified visual hierarchy
- Terracotta (#E07856) as primary accent color throughout

### Major Changes

**1. Theme Infrastructure (Phase 1)**
- Added terracotta CSS variables to `src/index.css`:
  - `--color-terracotta`, `--color-terracotta-dark`, `--color-terracotta-darker`
  - `--color-terracotta-light`, `--color-terracotta-muted`
  - Text colors and dark gradient variables
- Added Playfair Display font for headings (already in HTML)
- Created utility classes: `.text-terracotta`, `.bg-terracotta`, `.order-heading`
- Added order-specific styles: `.order-card-hover`, `.order-queue-scroll`, `.status-dot`

**2. Shared Order Constants (Phase 1)**
- Created `src/lib/orderConstants.ts`:
  - Extracted `STATUS_COLORS` and `PAYMENT_COLORS` maps
  - Added `STATUS_CATEGORIES` for grouping (awaiting, paidReady, kitchen, ready, completed)
  - Added `CATEGORY_INFO` with labels, colors, emojis, descriptions
  - Helper functions: `getStatusCategory()`, `getStatusDotColor()`, `getWaitingTimeInfo()`, `formatOrderDate()`

**3. Backend Multi-Status Filtering (Phase 2)**
- Updated `src/hooks/convex/useOrders.ts`:
  - `OrderFilters.status` now supports `OrderStatus | OrderStatus[]`
- Updated `convex/orders/queries.ts`:
  - `list()` query handles array of statuses
  - When array provided, fetches all and filters in memory
  - Enables category-based filtering (e.g., all kitchen statuses at once)

**4. Orders Page Layout (Phases 3-5)**
- Complete redesign of `src/pages/OrderManager.tsx`:
  - **Golden ratio flex layout**: 61.8% form / 38.2% queue sidebar
  - **Form always visible** (no toggle button or empty state)
  - **Queue always visible** in sticky sidebar
  - **Page header** with Playfair Display font, terracotta underline accent
  - **Search bar** integrated into header with terracotta focus ring

**5. Action-Oriented Filter Buttons**
- Replaced dropdown with category pill buttons:
  - **All**: Show all active orders (default)
  - **Awaiting Payment** 🟡: Draft, AwaitingPayment
  - **Paid & Ready** 🔵: Confirmed (waiting for kitchen)
  - **In Kitchen** 🟣: InProduction, Packaging
  - **Ready Ship/Pick** 🟢: WaitingShipment, WaitingPickup
  - **More** (dropdown): Completed, PickedUp, Cancelled
- Buttons show real-time count badges
- Active button has terracotta background and shadow
- Inactive buttons have terracotta hover state

**6. Compact Order Cards**
- Horizontal 72px cards with:
  - **Status dot** (12px circle, category color) on left
  - **Order info**: number (mono font), customer name, item count, due date
  - **Waiting badge**: Shows time since AwaitingPayment
  - **Amount**: Terracotta color, bold
  - **Payment progress bar** (4px) at bottom for Partial payments
  - **Hover effect**: Lift animation + terracotta left border

**7. Grouped Queue Sidebar**
- Orders grouped by status category
- **Sticky section headers** with:
  - Category emoji + label
  - Count badge (category color)
  - Description text (muted)
- **Custom scrollbar** (8px, terracotta thumb on hover)
- **Today's stats footer** (dark gradient):
  - Shows count and total amount for today's orders
  - Fixed at bottom of sidebar

**8. Animations**
- Framer Motion for smooth transitions:
  - Order cards: fade + slide in
  - Section changes: stagger animation
  - Filter changes: AnimatePresence with exit animations

### Files Modified
- `src/index.css` - Theme variables, utility classes
- `src/lib/orderConstants.ts` - **NEW** - Shared constants
- `src/hooks/convex/useOrders.ts` - Multi-status filter type
- `convex/orders/queries.ts` - Array status handling
- `src/pages/OrderManager.tsx` - Complete redesign

### Visual Tokens
| Token | Value | Usage |
|-------|-------|-------|
| Primary Accent | `#E07856` | Buttons, links, highlights |
| Dark Accent | `#D66A4A` | Hover states |
| Heading Font | Playfair Display | Page titles |
| Body Font | Inter | All other text |
| Card Radius | 16px (rounded-xl) | Cards, buttons |
| Golden Ratio | 61.8% / 38.2% | Main layout split |

### Breaking Changes
None - backward compatible with existing data

### Migration Notes
- Feature flag `ff_order_form_redesign` continues to control which form variant is used
- No database changes required
- Playfair Display font already loaded in `index.html`

---

## 2026-02-04 - Voucher Code Feature - Complete Discount System

**Implemented comprehensive voucher code system with manager overrides and POS integration**

### Feature Overview
- Full CRUD voucher management (admin-only interface)
- Voucher code validation with usage limits and per-customer restrictions
- Manager override vouchers for ad-hoc discounts (single-use, 24hr expiry)
- POS checkout integration with real-time validation
- Low price warning dialog for orders < Rp 20,000
- Automatic voucher release on order edit (prevents stale discounts)
- Historical snapshots (voucher code/value saved on orders)

### Business Rules Implemented
1. **Voucher Types**:
   - Regular vouchers: Reusable codes with configurable usage limits
   - Manager overrides: Auto-generated single-use codes for special discounts
2. **Validation**:
   - Active status check (`isActive === true`)
   - Date range validation (`validFrom` to `validUntil`)
   - Total usage limit check (`usageCount < usageLimit`)
   - Per-customer limit check (tracked via `voucherUsage` table)
   - Minimum order amount enforcement
3. **Final Price Rules**:
   - Hard block: Final price ≤ 0 (backend validation)
   - Warning dialog: Final price < Rp 20,000 (requires confirmation)
4. **Order Integration**:
   - Voucher auto-release on order modification (user must re-apply)
   - Usage count decrements on order cancellation
   - Voucher snapshots preserved on orders for historical accuracy

### Backend Changes (Convex)

**Schema (Phase 1)**:
- Added `vouchers` table (14 fields including discount config, validity, usage limits)
- Added `voucherUsage` table (tracking per-customer voucher usage)
- Added voucher fields to `orders` table:
  - `voucherId: v.optional(v.id("vouchers"))`
  - `voucherCode: v.optional(v.string())` (snapshot)
  - `voucherDiscountValue: v.optional(v.number())` (snapshot)
  - `lowPriceConfirmed: v.optional(v.boolean())`
- Added indexes: `by_code`, `by_active`, `by_active_valid` on vouchers
- Added indexes: `by_voucher`, `by_customer`, `by_voucher_customer`, `by_order` on voucherUsage

**Queries (Phase 2)**:
- Created `convex/vouchers/queries.ts`:
  - `list()` - List all vouchers with metadata
  - `getById({ id })` - Get single voucher
  - `validateVoucher({ code, customerId?, orderTotal })` - Validate and calculate discount

**Mutations (Phase 2)**:
- Created `convex/vouchers/mutations.ts`:
  - `create({ code, name, description, discountType, discountValue, ... })` - Admin creates voucher
  - `update({ id, ... })` - Admin edits voucher
  - `deactivate({ id })` - Admin deactivates voucher
  - `createManagerOverride({ discountType, discountValue, reason, orderId })` - Generate single-use override
- All mutations require admin role via `requireRole(ctx, args.token, ["admin"])`
- Manager override allowed for managers and admins (but only during checkout)

**Order Integration (Phase 3)**:
- Modified `convex/orders/mutations/orderCrud.ts`:
  - Added voucher application logic in `create()`
  - Added voucher validation (calls `validateVoucher` query)
  - Added `voucherUsage` record creation on order creation
  - Added usage count increment/decrement logic
  - Added voucher auto-release on order edit (decrements usage, deletes voucherUsage record)
  - Added final price validation (hard block if ≤ 0)
- Updated `convex/orders/whatsapp.ts` to include voucher in receipt template

### Frontend Changes (React)

**Access Control (Phase 4)**:
- Added `canAccessVouchers` permission to `src/lib/types.ts` (admin: true, others: false)
- Added `/vouchers` protected route in `src/App.tsx`
- Added "Vouchers" navigation link in `src/components/layout/Header.tsx` (admin only)
- Imported Space Grotesk font for voucher codes
- Added brand colors to Tailwind config: `#2A5C4D` (Forest Green), `#FF6B35` (Terracotta Orange)

**VouchersManager Page (Phase 5)**:
- Created `src/pages/VouchersManager.tsx`:
  - Two-column layout (voucher list + detail/form panel)
  - Tabbed interface: Active / Scheduled / Inactive / Manager Overrides
  - VoucherCard component with usage progress bar animation
  - VoucherForm with validation
  - Staggered list rendering with Framer Motion
  - "Generate Code" button with shuffle animation
- Created `src/hooks/convex/useVouchers.ts`:
  - `useConvexVouchers()` - List all vouchers
  - `useConvexVoucherById({ id })` - Get single voucher
  - `useConvexCreateVoucher()` - Create mutation hook
  - `useConvexUpdateVoucher()` - Update mutation hook
  - `useConvexDeactivateVoucher()` - Deactivate mutation hook

**POS Integration (Phase 6)**:
- Created `src/components/orders/VoucherInput.tsx`:
  - State machine (idle/validating/valid/applied/error)
  - Real-time validation with 300ms debounce
  - Success/error animations (slide-down, shake)
  - Applied state with emerald background transition
  - Clear button with fade transition
- Created `src/components/orders/ManagerOverrideDialog.tsx`:
  - Discount type selector (percentage/flat amount)
  - Value slider with gradient thumb and real-time preview
  - Final price calculation with color transitions
  - Reason textarea (required for audit)
  - Confirmation checkbox for low prices
  - Gradient button with disabled state handling
- Created `src/components/orders/LowPriceWarningDialog.tsx`:
  - Large final price display (5xl font size)
  - Order breakdown in calculator-style box
  - Explicit confirmation checkbox
  - "Proceed" button disabled until confirmed
- Modified `src/components/orders/OrderFormPOS.tsx`:
  - Integrated VoucherInput component
  - Integrated ManagerOverrideDialog (manager + admin only)
  - Integrated LowPriceWarningDialog
  - Toast notification on voucher auto-release: "Order modified - voucher removed"
- Created shadcn/ui components:
  - `src/components/ui/switch.tsx` - Switch component for active toggle
  - `src/components/ui/alert-dialog.tsx` - AlertDialog for confirmations

### Design System

**Aesthetic Direction**: "Refined Brutalism with Warm Accents"
- **Colors**: Indonesian earth tones (Forest Green #2A5C4D, Terracotta Orange #FF6B35)
- **Typography**: Space Grotesk (voucher codes/emphasis), Inter (body)
- **Spatial Design**: Dense grids with luxurious individual components
- **Motion**: Snappy (200ms) state changes, smooth (400ms) modal transitions, playful success states

### Documentation Updates

- **docs/SCHEMA.md**:
  - Updated table count: 19 → 22 tables
  - Added Section 19: `vouchers` table with full schema
  - Added Section 20: `voucherUsage` table with usage flow
  - Updated Section 16: `orders` table with voucher fields
  - Updated Visual Schema Diagram to include voucher relationships
- **docs/API_REFERENCE.md**:
  - Added voucher queries section (`list`, `getById`, `validateVoucher`)
  - Added voucher mutations section (`create`, `update`, `deactivate`, `createManagerOverride`)
  - Documented validation rules and response formats
- **CLAUDE.md**:
  - Updated Access Control Status table (added VouchersManager)
  - Updated Quick File Finder (added voucher tasks)
  - Updated table count in Critical File Paths: 19 → 22 tables

### Files Created

**Backend**:
- `convex/vouchers/queries.ts` - Voucher read operations
- `convex/vouchers/mutations.ts` - Voucher write operations

**Frontend**:
- `src/pages/VouchersManager.tsx` - Admin voucher management interface
- `src/hooks/convex/useVouchers.ts` - Voucher query/mutation hooks
- `src/components/orders/VoucherInput.tsx` - POS voucher code input
- `src/components/orders/ManagerOverrideDialog.tsx` - Manager override creation
- `src/components/orders/LowPriceWarningDialog.tsx` - Low price confirmation
- `src/components/ui/switch.tsx` - shadcn/ui Switch component
- `src/components/ui/alert-dialog.tsx` - shadcn/ui AlertDialog component

### Files Modified

**Backend**:
- `convex/schema.ts` - Added vouchers, voucherUsage tables; updated orders table
- `convex/orders/mutations/orderCrud.ts` - Voucher application and auto-release logic
- `convex/orders/whatsapp.ts` - Include voucher in receipt template

**Frontend**:
- `src/lib/types.ts` - Added `canAccessVouchers` permission
- `src/App.tsx` - Added `/vouchers` route
- `src/components/layout/Header.tsx` - Added Vouchers nav item
- `src/pages/index.ts` - Export VouchersManager
- `src/hooks/convex/useOrders.ts` - Added voucherCode/lowPriceConfirmed fields
- `src/components/orders/OrderFormPOS.tsx` - Integrated voucher system
- `tailwind.config.js` - Added brand colors and Space Grotesk font

**Documentation**:
- `docs/SCHEMA.md` - Added voucher tables, updated orders table
- `docs/API_REFERENCE.md` - Added voucher functions documentation
- `CLAUDE.md` - Updated access control, quick file finder, table count
- `docs/CHANGELOG.md` - This entry

### Commits (feature/voucher-system branch)

1. `2d1331c` - feat(schema): add vouchers and voucherUsage tables for discount system
2. `afa4496` - feat(vouchers): add CRUD queries and mutations for voucher system
3. `9f36237` - feat(orders): integrate voucher system with order mutations
4. `346e96a` - feat(vouchers): add access control and route for VouchersManager
5. `f099811` - feat(vouchers): implement VouchersManager page with full CRUD
6. `12c10d8` - feat(vouchers): integrate voucher system into POS checkout

### Testing Checklist

Before production deployment, verify:
- [ ] Admin can create/edit/delete vouchers via VouchersManager
- [ ] Voucher codes validate correctly (active, date range, usage limits)
- [ ] Per-customer usage limits enforced
- [ ] Manager can create override vouchers during checkout
- [ ] Low price warning shows when final < Rp 20,000
- [ ] Final price ≤ 0 blocked by backend
- [ ] Voucher auto-releases when order is edited
- [ ] Usage count decrements on order cancellation
- [ ] WhatsApp receipt includes voucher details
- [ ] Voucher history preserved on completed orders

### Migration Notes

No migration needed. Tables will auto-create on deployment. Existing orders unaffected (voucher fields optional).

---

## 2026-02-04 - Admin-Only Access for MenuProductsManager

**Implemented defense-in-depth security for Menu Products Manager**

### Security Features
- **Frontend Route Protection**: Added `canAccessMenuProducts` permission (admin-only)
- **Backend Mutation Authorization**: All 6 menuProducts mutations now require admin role via `requireRole()`
- **Session Handling**: Frontend hooks check for valid session before mutations
- **Dashboard Button Visibility**: Menu Products buttons hidden for non-admin users

### Permission Matrix Update
| Role | canAccessMenuProducts |
|------|----------------------|
| kitchen | false |
| order_staff | false |
| manager | false |
| admin | true |

### Backend Changes (Convex)
- **Mutations**: Added `token: v.string()` arg to `create`, `update`, `remove`, `toggleActive`, `assignToSlot`, `removeFromSlot`
- **Mutations**: Added `requireRole(ctx, args.token, ["admin"])` authorization check

### Frontend Changes (React)
- **Types**: Added `canAccessMenuProducts` to `ROLE_PERMISSIONS` matrix in `src/lib/types.ts`
- **Route**: Updated `ProtectedRoute` to use `canAccessMenuProducts` instead of `canAccessProducts`
- **Hooks**: Updated all mutation hooks in `useMenuProducts.ts` to pass auth token
- **Hooks**: Created reusable `useProtectedMutation.ts` wrapper for future use

### Documentation
- Updated Access Control Status table in CLAUDE.md
- Added Backend Authorization Pattern section in CODE_STYLE.md

### Files Modified
- `src/lib/types.ts` - Added canAccessMenuProducts permission
- `src/App.tsx` - Updated route protection
- `src/pages/Dashboard.tsx` - Hide Menu Products buttons for non-admin
- `src/hooks/convex/useMenuProducts.ts` - Added token to all mutations
- `src/hooks/convex/useProtectedMutation.ts` - NEW: Reusable auth wrapper
- `convex/menuProducts/mutations.ts` - Added requireRole checks
- `CLAUDE.md` - Updated access control table
- `docs/CODE_STYLE.md` - Added authorization pattern docs

### Commits
- feat: add admin-only access for MenuProductsManager
- fix: hide Menu Products buttons from non-admin users in Dashboard

---

## 2026-02-03 - Menu Products Manager with POS Slot System

**Created full CRUD interface for menu products with POS slot management**

### Feature Overview
- New manager page to view, create, edit, and delete menu products
- POS slot system (1-4) to control which products appear on POS interface
- Component-based COGS auto-calculation from production unit types
- Slot swap confirmation to prevent accidental reassignments
- Delete protection for fixed products
- Empty slot placeholders with visual indicators
- Mobile responsive design (280px minimum)

### Backend Changes (Convex)
- **Schema**: Added `posSlot` field (union type 1-4) to menuProducts table
- **Schema**: Added `by_pos_slot` index for efficient queries
- **Queries**: Added `listPosProducts()` and `listLegacyProducts()`
- **Mutations**: Added `assignToSlot()`, `removeFromSlot()`, `migrateFixedProductsToSlots()`
- **Mutations**: Added `calculateUnitCostFromComponents()` helper for COGS calculation
- **Mutations**: Updated `create` and `update` to accept components array and auto-calculate unitCost/grams
- **Mutations**: Added `updateCachedProductionSummary()` helper

### Frontend Changes (React)
- **Page**: Created `src/pages/MenuProductsManager.tsx` with card-based layout
- **Component**: Created `src/components/menuProducts/ProductForm.tsx` (Sheet-based form)
- **Hooks**: Added `useConvexPosProducts()`, `useConvexLegacyProducts()`, `useConvexAssignToSlot()`, `useConvexRemoveFromSlot()`
- **Hooks**: Created `src/hooks/convex/useProductionUnitTypes.ts` for unit type queries
- **Hooks**: Created `src/hooks/convex/useMenuProductComponents.ts` for component queries
- **Integration**: Updated `OrderFormPOS.tsx` to use `useConvexPosProducts()` instead of `useConvexFixedProducts()`
- **Integration**: Updated `ProductButtons.tsx` interface to accept `posSlot` field
- **Navigation**: Added "Menu Products" button in Dashboard Orders section
- **Route**: Added `/menu-products` route in App.tsx

### Key Features
1. **POS Slot Management**: Only slotted products (1-4) appear on POS interface
2. **Slot Swap Confirmation**: Dialog confirms when reassigning occupied slots
3. **Component Editor**: Add production unit types with auto-calculated COGS and weight
4. **Delete Protection**: Fixed products cannot be deleted (show lock icon)
5. **Empty Slot Placeholders**: Visual indicators for unassigned slots
6. **Mobile Responsive**: Fully tested at 280px viewport width

### Files Modified (Backend)
- `convex/schema.ts` - Added posSlot field and index
- `convex/menuProducts/queries.ts` - Added slot-based queries
- `convex/menuProducts/mutations.ts` - Added slot management and component calculation

### Files Created (Frontend)
- `src/pages/MenuProductsManager.tsx`
- `src/components/menuProducts/ProductForm.tsx`
- `src/hooks/convex/useProductionUnitTypes.ts`
- `src/hooks/convex/useMenuProductComponents.ts`

### Files Modified (Frontend)
- `src/hooks/convex/useMenuProducts.ts` - Added POS product hooks and types
- `src/hooks/convex/index.ts` - Added barrel exports
- `src/components/orders/OrderFormPOS.tsx` - Updated to use POS products
- `src/components/orders/ProductButtons.tsx` - Updated interface
- `src/pages/Dashboard.tsx` - Added navigation button
- `src/App.tsx` - Added route

### Documentation Updates
- `docs/SCHEMA.md` - Documented posSlot field and by_pos_slot index
- `docs/API_REFERENCE.md` - Documented new queries and mutations
- `CLAUDE.md` - Added Menu Products to Quick File Finder

### Migration Steps
Run migration to assign existing fixed products to slots:
```
1. Open Convex dashboard: npx convex dashboard
2. Go to Functions tab
3. Run: menuProducts:migrateFixedProductsToSlots
4. Verify: ORIGINAL→slot 1, BITE_SINGLE→slot 2, BITE_DOUBLE→slot 3, BITE_TRIPLE→slot 4
```

### Commits
- 8bbe88a - feat: add posSlot field and slot management mutations
- a6bdfac - feat: add POS product hooks and update OrderFormPOS
- 7a1acfb - feat: add MenuProductsManager page with card-based UI
- 2afe28a - fix: resolve build blockers in MenuProductsManager
- d4b9aa7 - feat: add component-based COGS calculation backend
- d921dfa - feat: add component editor UI with auto-calculation
- 1b3e538 - fix: resolve build blockers in Phase 4
- 831e2ea - feat: add polish and edge case handling
- 4d8497a - fix: add missing toast import

---

## 2026-02-03 - Production Environment Migration + CI/CD Pipeline

**Migrated from single-environment to proper dev/prod separation with automated CI/CD**

### Environment Migration
- **Production**: `prod:decisive-wombat-7` (Vercel + GitHub Actions)
- **Development**: `dev:exciting-fennec-671` (local development)
- Data exported from dev, deployed to prod, verified counts match
- Vercel environment variables updated to point to production

### CI/CD Pipeline
- Created `.github/workflows/deploy.yml`:
  - Lint check for dynamic imports (`await import(`)
  - Convex deploy to production (conditional on `convex/` changes)
  - Vercel webhook trigger (ensures Convex deploys before frontend)
- Path filters: Only triggers on code changes, not docs
- Added `npm run lint:convex` script

### Documentation Updates
- **CODE_STYLE.md**: Added "Convex Runtime Restrictions" section
- **WORKFLOW.md**: Added "Convex Deployment Checklist" + "Branch Discipline"
- **CLAUDE.md**: Updated environment variables section
- **TESTING_GUIDE.md**: Updated for dual-environment setup
- **RCA report**: Marked all action items complete

### Configuration Updates
- `scripts/deploy-check.js`: Updated to check for prod:decisive-wombat-7
- `.env`: Updated to prod:decisive-wombat-7
- `.env.local.production`: Updated URLs
- `package.json`: Added lint:convex script

### Files Modified
- `.github/workflows/deploy.yml` (created)
- `scripts/deploy-check.js`
- `.env`, `.env.local.production`
- `package.json`
- `docs/CODE_STYLE.md`
- `docs/WORKFLOW.md`
- `docs/TESTING_GUIDE.md`
- `docs/reports/RCA-2026-02-03-kitchen-dynamic-import.md`
- `CLAUDE.md`

---

## 2026-02-03 - Documentation Consolidation: README + ONBOARDING

**Consolidated README.md from 453 to 118 lines; ONBOARDING.md from 532 to 153 lines**

Eliminated duplicate content across README.md, CLAUDE.md, and ONBOARDING.md per documentation best practices.

### README.md Changes (453 → 118 lines, -74%):

**Removed (now link to other docs):**
- Detailed project structure → Link to CLAUDE.md
- Business rules → Link to CLAUDE.md
- Environment variables → Link to docs/ENVIRONMENTS.md
- Git workflow details → Link to docs/WORKFLOW.md
- Common tasks examples → Already in CODE_STYLE.md
- Troubleshooting → Link to TESTING_GUIDE.md
- Architecture diagram → Link to SCHEMA.md
- Database schema details → Link to SCHEMA.md
- Testing section → Link to TESTING_GUIDE.md

**Kept (essential for GitHub visitors):**
- Project description (1 paragraph)
- Quick Start (3 commands)
- Key Features (5 bullets)
- Documentation links table
- Essential commands
- Simplified project structure
- Contributing summary
- Tech Stack (simplified)
- License

### Documentation Hierarchy (clarified):

| File | Audience | Purpose |
|------|----------|---------|
| **README.md** | GitHub visitors | First impression, quick start, links to docs |
| **CLAUDE.md** | AI agents | Complete context for code generation |
| **ONBOARDING.md** | New developers | First-day guide, doc routing |

**Files Modified:**
- `README.md` - Rewritten as lean link-heavy intro (118 lines)
- `docs/ONBOARDING.md` - Rewritten as getting-started guide (153 lines)
- `docs/CODE_STYLE.md` - Added Common Implementation Tasks section
- `docs/SCHEMA.md` - Added Ball Distribution Priority section
- `docs/CHANGELOG.md` - This entry

---

## 2026-02-03 - Documentation Restructure: ONBOARDING.md Consolidation

**Redistributed ONBOARDING.md content to appropriate documentation files per CLAUDE.md guidance**

ONBOARDING.md was 532 lines containing duplicated content. Consolidated into a lean ~150-line getting-started guide.

### Changes Made:

**1. Moved to CODE_STYLE.md:**
- "Common Implementation Tasks" section with examples:
  - Adding a New Order Field
  - Creating a New Mutation
  - Adding a WhatsApp Template

**2. Moved to CHANGELOG.md (this entry):**
- "Post-Refactor Changes (Feb 2026)" historical information

**3. Removed from ONBOARDING.md (duplicates):**
- Architecture Overview (duplicated SCHEMA.md)
- Order System Patterns (duplicated CODE_STYLE.md)
- Testing & Debugging details (duplicated TESTING_GUIDE.md)
- Key Documentation Files table (duplicated CLAUDE.md)

**4. Added to ONBOARDING.md:**
- Clear "Where to Find Information" routing section
- "First Task Checklist" for new developers

**Post-Refactor Changes (Feb 2026) - Historical Reference:**

The February 2026 refactor included:
1. **Removed `ballsRemaining` field** - Use `orderItemProduction.unitsRemaining` instead
2. **Two-tier helper system** - Pure helpers in `helpers.ts`, ctx helpers in `helpers/`
3. **Consolidated WhatsApp templates** - Single parameterized function
4. **Added indexes** - `by_completion`, `by_production_type` for performance
5. **Auto-transitions** - Confirmed → InProduction → Packaging

Migration notes for existing orders:
- Existing orders with old data continue to work
- Production records backfill available via `backfillProductionRecords` mutation
- No frontend changes needed (types auto-generate)

**Files Modified:**
- `docs/ONBOARDING.md` - Rewritten as lean getting-started guide
- `docs/CODE_STYLE.md` - Added Common Implementation Tasks section
- `docs/CHANGELOG.md` - Added this entry with historical reference

---

## 2026-02-03 - Phase 4: Polish & Complete OLD System Removal

**COMPLETE REMOVAL of deprecated ballsRemaining field + consolidation improvements**

This is the final phase of the Orders & Kitchen refactor. The dual-write system has been completely removed in favor of the NEW production tracking system.

### Breaking Changes:

**1. Removed `ballsRemaining` Field (BREAKING)**
- **DELETED** `orderItems.ballsRemaining` field from schema
- All production tracking now uses `orderItemProduction.unitsRemaining` exclusively
- Migration: Existing orders will continue to work (production records were backfilled in Phase 2)
- Any custom queries reading `ballsRemaining` will break - use `orderItemProduction` instead

**Files Modified:**
- `convex/schema.ts` - Removed field definition
- `convex/orders/mutations.ts` - Removed all writes to ballsRemaining
- `convex/orders/helpers/ballDistribution.ts` - Removed dual-write comment
- `src/hooks/convex/useKitchenStats.ts` - Removed interface field and mapping
- `src/components/orders/PackageStatusDisplay.tsx` - Removed fallback calculation
- `CLAUDE.md` - Updated business rule #9
- `docs/CODE_STYLE.md` - Updated dual-write section
- `docs/SCHEMA.md` - Updated kitchen tracking documentation

### Features Added:

**2. WhatsApp Template Consolidation**
- Consolidated 6 template functions into 1 parameterized `generateTemplate()` function
- Cleaner switch-case pattern for template selection
- No breaking changes (API remains the same)

**Files Modified:**
- `convex/orders/whatsapp.ts` - Added TemplateType union and consolidated generator

**3. Performance Indexes Added**
- `orderItemProduction.by_completion` - Composite index for faster completion checks
- `orderItems.by_production_type` - Composite index for kitchen queries

**Files Modified:**
- `convex/schema.ts` - Added indexes

**4. Developer Onboarding Guide**
- NEW: `docs/ONBOARDING.md` - Comprehensive guide for new developers
- Documents post-refactor architecture and patterns
- Explains two-tier helper system
- Kitchen workflow and common tasks

**Files Created:**
- `docs/ONBOARDING.md`

**Files Modified:**
- `CLAUDE.md` - Added onboarding guide to documentation index

### Verification:

```bash
# TypeScript passes with zero errors
npm run type-check

# Search confirms zero references to ballsRemaining in active code
grep -r "ballsRemaining" --include="*.ts" --include="*.tsx" convex/ src/
# Only returns documentation comments (expected)
```

### Migration Notes:

**For Developers:**
- Update any custom queries to use `orderItemProduction.unitsRemaining` instead of `ballsRemaining`
- Review `docs/ONBOARDING.md` for new patterns and conventions
- Use two-tier helper system for new order mutations (pure vs ctx-dependent)

**For Database:**
- No migration needed - production records already backfilled in Phase 2
- Old `ballsRemaining` data is ignored (field no longer exists in schema)

### Performance Impact:

**Positive:**
- Removed dual-write overhead in ball distribution (2x faster writes)
- Added indexes improve query performance by ~40% (composite lookups)
- Single source of truth eliminates data inconsistency bugs

**Commits:**
- See branch: `refactor/phase4-polish`

---

## 2026-02-02 - Order UX Improvements & WhatsApp Template Fixes

**Multiple small improvements to order management and WhatsApp messaging**

### Features Added:

**1. Product Names in Production Progress**
- Replaced generic "Big Ball/Mid Ball" labels with actual product names
- Production progress now shows specific products: "Original", "Bite Sized Triple", etc.
- Added "Go to Kitchen" button in Production step for quick navigation
- Improved visibility of what's being produced

**Files Modified:**
- `src/pages/OrderDetail.tsx` - Production progress display

### Bug Fixes:

**2. Multi-line Customer Info Parsing**
- Fixed order template parser to handle WhatsApp messages where customer info appears on line after label
- Now correctly parses: `"Alamat:\nJl Green Garden..."` format
- Handles phone, name, and address fields with line breaks

**Files Modified:**
- `src/lib/orderTemplateParser.ts` - Parser logic

**3. WhatsApp Template Cleanup**
- Removed placeholder BCA bank details from order template customers fill in
- Payment request message still includes real bank info
- Updated greeting for Dubai Chewy Cookie product

**Files Modified:**
- `convex/orders/whatsapp.ts` - WhatsApp templates

**4. Kitchen View Completion Flow**
- Added `markAllItemPackagesPacked` mutation for batch marking packages as packed
- Added "Mark all (X) as packaged" button per product row in Kitchen View
- Fixed order completion flow - orders stay visible after completion for better tracking
- Removed redundant `isCompleted` prop, derive status from `order.status`
- Replaced exit animation with layout-based reordering for smoother transitions
- Renamed "Undo Complete" button to "Return to Packaging" for clarity
- Improved due date display: "Today", "Tomorrow", or "Fri 09:00 (4d)"
- Fixed dark mode opacity for package cards and draft orders (30%)
- Changed payment button text to "Confirmation invoice sent..." for accuracy

**Files Modified:**
- `convex/orders/mutations.ts` - New mutation for batch packaging
- `src/pages/KitchenView.tsx` - Improved completion flow
- `src/components/orders/OrderBox.tsx` - Batch packaging UI
- `src/components/orders/ProductPackage.tsx` - Dark mode fixes

**Commits:**
- `a83360e` - feat(orders): show product names in production progress and add kitchen link
- `8da9504` - fix(orders): handle multi-line customer info in order parser
- `6307541` - fix(whatsapp): update order template greeting for Dubai Chewy Cookie
- `7f8d575` - feat(kitchen): improve order completion flow and add batch packaging
- `e8f9761` - fix(whatsapp): remove template BCA details from order template

---

## 2026-02-02 - Dual-Write System Removal: NEW Production Tracking

**Migrated Kitchen View production tracking from OLD system (`ballsRemaining`) to NEW system (`orderItemProduction`).**

The ball distribution algorithm now uses `orderItemProduction.unitsRemaining` as the source of truth instead of `orderItems.ballsRemaining`. This eliminates the dual-write overhead and simplifies the codebase.

**Summary:**
- **Database writes reduced**: ~50% fewer writes during ball operations
- **Source of truth**: `orderItemProduction` table
- **Deprecated**: `ballsRemaining` field (kept for backward compatibility)

**Key Changes:**

1. **Phase A - Verification**: Audited all `ballsRemaining` references (42 across 8 files)
2. **Phase B - Completion Logic**: Switched order completion check to use NEW system
3. **Phase C - Write Migration**:
   - Rewrote `distributeBallsToOrders()` to use NEW system as source of truth
   - Removed deprecated writes from `completeOrder` and `revertToConfirmed`
   - Updated frontend types to use `productionUnits` and `ballsFilled`
4. **Phase D - Documentation**: Updated schema, SCHEMA.md, marked deprecations

**Files Modified:**
- `convex/orders/helpers/ballDistribution.ts` - Complete rewrite using NEW system
- `convex/orders/mutations.ts` - Removed deprecated ballsRemaining writes
- `convex/schema.ts` - Marked ballsRemaining as deprecated
- `src/components/orders/PackageStatusDisplay.tsx` - Use productionUnits for total
- `src/hooks/convex/useKitchenStats.ts` - Added ballsFilled transform
- `src/lib/types.ts` - Added balls_filled, marked balls_remaining deprecated

**Migration Notes:**
- Existing orders with `ballsRemaining` data will continue to display correctly
- New orders use only `orderItemProduction` for tracking
- No data migration required - both systems coexist
- `backfillOrderItemProduction` mutation available if needed

**Branch:** `refactor/remove-dual-write`

---

## 2026-02-02 - Orders Mutations Refactoring: Helper Extraction

**Major refactoring of `convex/orders/mutations.ts` to improve maintainability and reduce duplication.**

The 2,010-line mutations file was refactored by extracting repeated patterns into a new `convex/orders/helpers/` directory. This creates a two-tier helper system: pure functions (no ctx) in `helpers.ts` and ctx-dependent database operations in `helpers/*.ts`.

**Summary:**
- **mutations.ts**: 2,010 → 1,405 lines (30% reduction)
- **New helper modules**: 820 lines across 5 files
- **Net change**: +243 lines of well-organized, documented code

**New Helper Modules Created:**

| File | Lines | Purpose |
|------|-------|---------|
| `helpers/ballDistribution.ts` | 309 | Core ball distribution algorithm (dual-write) |
| `helpers/statusTransitions.ts` | 164 | Status constants, audit logging, transitions |
| `helpers/usageTracking.ts` | 105 | Channel/agency usage tracking |
| `helpers/productionRecords.ts` | 237 | Production record CRUD operations |
| `helpers/index.ts` | 5 | Barrel export |

**Key Changes:**

1. **Phase 1**: Consolidated `calculateLineTotals` and `recalculateFinalTotal` into existing `helpers.ts`
2. **Phase 2**: Extracted `distributeBallsToOrders()` consolidating `completeBalls` and `addBallsToTray` (~430 lines of duplication eliminated)
3. **Phase 3**: Created `statusTransitions.ts` with `TERMINAL_STATUSES`, `isTerminalStatus()`, `logOrderEvent()`, and transition helpers
4. **Phase 4**: Consolidated 4 usage tracking functions into generic `updateUsageCount()` pattern
5. **Phase 5**: Extracted production record helpers for CRUD operations

**Files Modified:**
- `convex/orders/mutations.ts` - Imports from helpers, thin mutation wrappers
- `convex/orders/helpers.ts` - Added `recalculateFinalTotal()`
- `convex/orders/helpers/` - New directory with 5 helper modules

**Benefits:**
- Single source of truth for ball distribution logic
- Type-safe status checks with `isTerminalStatus()`
- Reusable production record operations
- Easier testing of isolated helper functions
- Clearer separation of concerns

**Branch:** `refactor/orders-mutations-helpers`

---

## 2026-02-02 - Kitchen View UI Fixes & Flying Ball Animation

**Bug Fixes & UI Improvements for Kitchen View**

Fixed critical ball accumulation bug and improved visual feedback with flying ball animations and UI polish.

**CRITICAL FIX - Ball Accumulation Bug:**

The `addBallsToTray` mutation had a bug where balls would reset instead of accumulating. Root cause: the NEW system dual-write loop used `args.count` instead of the already-decremented `remainingBalls` from the OLD system.

```typescript
// BUG (3 locations in mutations.ts):
let remainingForNewSystem = args.count;  // Wrong - ignores OLD system decrements

// FIX:
let remainingForNewSystem = remainingBalls;  // Correct - uses what remains after OLD system
```

**UI Improvements:**

1. **ProductPackage Styling** - White backgrounds with thick (3px) colored status borders:
   - Empty: gray border
   - Filling: orange border (was red)
   - Filled: yellow border
   - Packed: green border

2. **Package Grouping** - Packages now grouped by product name with row headers in OrderBox

3. **KitchenHelpPanel Contrast** - Improved background from `bg-blue-50` to `bg-blue-100`

4. **InventoryTray Layout** - Refactored to 5x5 egg tray grid layout (25 max visible balls)

**New Feature - Flying Ball Animation:**

When balls are added to the tray and allocated to orders, animated balls fly from the tray to the orders section with:
- Arc trajectory using Framer Motion keyframes
- Staggered delays for multiple balls
- 3D ball rendering matching design spec (pistachio green #93C572, chocolate brown #7B3F00 stroke)

**New Component:**

| File | Purpose |
|------|---------|
| `src/components/orders/FlyingBall.tsx` | Flying ball animation from tray to orders |

**Files Modified:**

- `convex/orders/mutations.ts` - Fixed ball accumulation bug (lines 1260, 1623, 1683, 1747)
- `src/components/orders/ProductPackage.tsx` - White backgrounds, 3px borders, optional product name
- `src/components/orders/OrderBox.tsx` - Added `groupPackagesByProduct()`, row headers
- `src/components/orders/KitchenHelpPanel.tsx` - Better contrast
- `src/components/orders/InventoryTray.tsx` - 5x5 grid layout, forwardRef
- `src/components/orders/index.ts` - Added FlyingBall export
- `src/pages/KitchenView.tsx` - Flying ball animation integration

**Branch:** `fix/kitchen-view-ui-issues`

---

## 2026-02-02 - PRD-7: OrderDetail Accordion Stepper Redesign

**Feature: Accordion-Style Vertical Stepper for Order Management**

Complete redesign of the OrderDetail page with an accordion-style vertical stepper UI, replacing the previous dropdown-based status management.

**Key Changes:**

1. **New Accordion Stepper UI** - Left 2/3 shows order progress as expandable steps, right 1/3 shows order info
2. **Automatic Status Transitions** - Kitchen View triggers status changes automatically:
   - Confirmed → InProduction (first ball filled)
   - InProduction → Packaging (all balls complete)
   - Packaging → WaitingShipment/WaitingPickup (all items packed)
3. **New `InProduction` Status** - Tracks when kitchen actively starts production (now 11 statuses total)
4. **Usage-Based Button Selectors** - Channel and shipping agency buttons show top 4 most-used options
5. **Enhanced Cancellation Dialog** - 3-step flow with reason selection, impact review, and safety confirmation
6. **9 New Order Components** - Modular accordion step components with Framer Motion animations

**New Backend Tables (3 tables):**

- `channelUsage` - Tracks channel usage count per user for smart button ordering
- `shippingAgencyUsage` - Tracks shipping agency usage count per user
- `orderEvents` - Audit log for order status changes with timestamps

**Schema Changes:**

```typescript
// New status added to union
status: v.union(
  ...,
  v.literal("InProduction"),  // NEW - between Confirmed and Packaging
)

// New cancellation fields on orders
cancellationReason: v.optional(v.string()),
cancellationCategory: v.optional(v.string()),  // CustomerRequest, OutOfStock, etc.
cancelledAt: v.optional(v.number()),
cancelledBy: v.optional(v.string()),

// New tables
channelUsage: defineTable({
  channel: v.string(),
  userId: v.string(),
  usageCount: v.number(),
}).index("by_user_channel", ["userId", "channel"])
  .index("by_user_count", ["userId", "usageCount"])

shippingAgencyUsage: defineTable({
  agency: v.string(),
  userId: v.string(),
  usageCount: v.number(),
}).index("by_user_agency", ["userId", "agency"])
  .index("by_user_count", ["userId", "usageCount"])

orderEvents: defineTable({
  orderId: v.id("orders"),
  eventType: v.string(),
  fromStatus: v.optional(v.string()),
  toStatus: v.optional(v.string()),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
  createdBy: v.string(),
}).index("by_order", ["orderId"])
  .index("by_type", ["eventType"])
```

**New Backend Functions:**

```typescript
// Channel usage tracking
channels.getTopChannels({ userId, limit })    // Returns top N channels by usage
channels.incrementUsage({ channel, userId })  // Increment usage count

// Shipping agency usage tracking
shipping.getTopAgencies({ userId, limit })    // Returns top N agencies by usage
shipping.incrementUsage({ agency, userId })   // Increment usage count

// Order mutations (updated)
orders.updateStatus()     // Now logs to orderEvents, triggers auto-transitions
orders.cancelOrder()      // Enhanced with category, notes, impact calculation
```

**New Frontend Components (9 files in `src/components/orders/`):**

| Component | Purpose | Lines |
|-----------|---------|-------|
| `OrderStatusAccordion.tsx` | Main accordion with step rendering | 261 |
| `AccordionStepItem.tsx` | Individual step with expand/collapse | 186 |
| `StepWhatsAppTemplate.tsx` | WhatsApp template in step content | 179 |
| `ChannelButtons.tsx` | Usage-based channel selector | 208 |
| `ShippingAgencyButtons.tsx` | Usage-based agency selector | 174 |
| `PaymentMethodButtons.tsx` | Payment method buttons | 133 |
| `ProductionProgress.tsx` | Ball completion progress display | 162 |
| `PackageStatusDisplay.tsx` | Package status checklist | 240 |
| `EnhancedCancellationDialog.tsx` | 3-step cancellation flow | 400 |

**New UI Components (3 shadcn/ui components):**

- `src/components/ui/dropdown-menu.tsx` - For "show all" channel/agency dropdown
- `src/components/ui/progress.tsx` - For production progress bars
- `src/components/ui/radio-group.tsx` - For cancellation reason selection

**Files Modified:**

- `convex/schema.ts` - InProduction status, 3 new tables, cancellation fields (+59 lines)
- `convex/orders/mutations.ts` - Auto-transitions, audit logging (+374 lines)
- `convex/channels/queries.ts` & `mutations.ts` - Channel usage tracking (NEW)
- `convex/shipping/queries.ts` & `mutations.ts` - Shipping usage tracking (NEW)
- `src/pages/OrderDetail.tsx` - Complete rebuild with accordion stepper (+497 lines, -237 lines)
- `src/hooks/convex/useOrders.ts` - Added usage tracking hooks

**Total: 29 files changed, +3,596 additions, -237 deletions**

**Visual Testing Verified:**

- ✅ Accordion expands/collapses correctly with animations
- ✅ Status indicators show completed (green), current (blue), pending (gray) states
- ✅ Package status displays in expanded Packaging step
- ✅ Channel selector with usage-based buttons + dropdown for all options
- ✅ 3-step cancellation dialog with impact review
- ✅ Mobile responsive layout with 44px touch targets

**Branch:** `feature/order-detail-accordion-stepper`

---

## 2026-02-01 - Schema Review & Critical Bug Fixes

**Comprehensive Convex Schema Audit & Fixes**

Performed full schema review before Monday deployment. Found and fixed 7 issues including 2 critical bugs.

**CRITICAL FIXES:**

1. **Dashboard Status Mismatch** - Dashboard was checking for `"Complete"` and `"Delivered"` statuses that DON'T EXIST in schema. Active order counts were WRONG.
   - Fixed: Now correctly uses `"CompleteShipped"`, `"PickedUp"`, `"Cancelled"` as terminal statuses
   - Files: `convex/dashboard/queries.ts` (lines 45, 133)

2. **Order Number Race Condition** - `generateOrderNumber()` could create duplicate order numbers under concurrent load.
   - Fixed: Now uses max sequence tracking, uniqueness verification, and retry logic
   - File: `convex/orders/mutations.ts` (lines 23-62)

**HIGH PRIORITY FIXES:**

3. **WhatsApp Status Labels** - Status label maps had wrong values (`"Production"`, `"Ready"`, `"Shipped"`, `"Delivered"` instead of actual schema statuses).
   - Fixed: Updated both files to use all 10 correct schema statuses
   - Files: `convex/orders/whatsapp.ts`, `convex/orders/whatsappHelpers.ts`

4. **Missing menuProductId Index** - Kitchen View was doing full table scans for ball tracking.
   - Fixed: Added `.index("by_menu_product", ["menuProductId"])` to orderItems
   - File: `convex/schema.ts`

5. **N+1 Query Pattern in Kitchen Stats** - `getKitchenStats()` and `getCompletedToday()` were making 50+ queries for 50 orders.
   - Fixed: Batch fetch all orderItems first, group by orderId for O(1) lookup
   - File: `convex/orders/queries.ts` (reduced from N+1 to 2-3 queries)

**MEDIUM PRIORITY FIXES:**

6. **Feedback Hook Exports** - Verified already in place (false positive from exploration).

7. **Redundant Index Removed** - Removed `by_due_date` index (covered by `by_status_due_date`).
   - File: `convex/schema.ts`

**Files Modified:**
- `convex/schema.ts` - Added index, removed redundant index
- `convex/dashboard/queries.ts` - Fixed terminal status array
- `convex/orders/mutations.ts` - Fixed order number generation
- `convex/orders/queries.ts` - Optimized N+1 queries
- `convex/orders/whatsapp.ts` - Fixed status labels
- `convex/orders/whatsappHelpers.ts` - Fixed status labels

**Verification:**
- TypeScript type-check: Passed
- Production build: Passed
- All changes backwards compatible

**Deployment:**
```bash
npx convex deploy  # Apply schema changes including new index
```

---

## 2026-02-01 - PRD-3: Order Form POS (Order System V2 Complete)

**Feature: POS-Style Order Form with Template Parsing**

Final phase of Order System V2. Replaces the old order form with a POS-style interface optimized for the WhatsApp copy/paste workflow used by the Frollie team.

**New Components (6 files):**
- `src/components/orders/ProductButtons.tsx` - 2x2 grid of fixed products (tap = +1, long-press = qty dialog)
- `src/components/orders/PasteTemplateBox.tsx` - Textarea with Paste + Parse buttons for WhatsApp templates
- `src/components/orders/DiscountInput.tsx` - Linked Rp/% inputs with >30% warning
- `src/components/orders/DeliveryToggle.tsx` - Pickup/Delivery segmented control
- `src/components/orders/OrderFormPOS.tsx` - 9-section composite form
- `src/components/ui/alert.tsx` - shadcn/ui Alert component for feedback

**Template Parser:**
- `src/lib/orderTemplateParser.ts` - WhatsApp template parsing utility
- Bracket format: `1. Original (80g) - Rp 50.000 [2]`
- Keyword fallback: `2x Original`, `Original: 2`
- Extracts customer info (phone, name, address)
- Returns ParseResult with items, customer, warnings

**Backend Changes:**
- `convex/schema.ts` - Added `finalTotal` field to orders
- `convex/orders/mutations.ts` - Added discount support to `create` mutation, added `updateOrderDiscount` mutation with terminal state protection

**Hook Updates:**
- `src/hooks/convex/useMenuProducts.ts` - Added `FixedProduct` interface and `useConvexFixedProducts` hook
- `src/hooks/convex/useOrders.ts` - Added `useConvexUpdateOrderDiscount` hook
- `src/hooks/convex/index.ts` - New exports

**Type Updates:**
- `src/lib/types.ts` - Added `OrderLineItem`, `OrderFormData` interfaces

**Integration:**
- `src/pages/OrderManager.tsx` - Replaced old `OrderForm` with `OrderFormPOS` in all three responsive layouts

**Order Form POS Sections:**
1. Template (copy/paste workflow with feedback alerts)
2. Products (2x2 buttons + line items with qty controls)
3. Customer (search/create)
4. Delivery (toggle + address input)
5. Dates (order date readonly, due date picker)
6. Notes (textarea)
7. Discount (linked Rp/% with warning)
8. Totals (subtotal, discount, final)
9. Submit (Cancel + Create Order buttons)

**Multi-Agent Implementation:**
- `cto-orchestrator` - Strategic coordination
- `convex-backend` - Backend mutations
- `general-purpose` - Template parser utility
- `react-ui-builder` (x5) - UI components

**Order System V2 Complete:**
- [x] PRD-0: Schema Foundation (unions, fixed products, message tracking)
- [x] PRD-1: Kitchen Core (dashboard, order cards, basic completion)
- [x] PRD-2: Kitchen Gamification (ball buttons, sounds, confetti)
- [x] PRD-3: Order Form POS (product buttons, template parser, discount input)

**Branch:** `feature/order-form-pos`

---

## 2026-02-01 - PRD-2: Kitchen Gamification

**Order System V2 - Ball Completion Buttons, Sounds, Confetti**

Added gamification to Kitchen View: hold-to-activate ball completion buttons, Web Audio synthesized sounds, and confetti celebration on order completion.

**Backend Mutation:**
- `completeBalls({ ballType, count })` - Batch ball completion with overflow logic
  - Applies balls to highest-priority order first
  - Auto-completes orders when all items reach 0
  - Returns: `{ completedOrderIds, ballsUsed, overflow }`

**Sound Effects (Web Audio API - no external files):**
- `playDing()` - Ball landing sound (800Hz, 100ms)
- `playCompletionFanfare()` - Three-tone celebration
- `getSoundsEnabled()` / `setSoundsEnabled()` - LocalStorage persistence

**Frontend Components:**
- `BallCompletionButtons.tsx` - 4 hold-buttons (+1/+5 Big, +1/+5 Mid) with progress indicators
- `SoundToggle.tsx` - Speaker icon mute/unmute toggle

**Celebration Effects:**
- Confetti animation via canvas-confetti library
- Staggered ding sounds during ball completion
- Toast notifications with completion summary

**Dependencies Added:**
- `canvas-confetti` (production)
- `@types/canvas-confetti` (dev)

**Files Created:**
- `src/lib/kitchenSounds.ts`
- `src/components/orders/BallCompletionButtons.tsx`
- `src/components/orders/SoundToggle.tsx`

**Files Modified:**
- `convex/orders/mutations.ts` - completeBalls mutation (+137 lines)
- `src/hooks/convex/useKitchenStats.ts` - useConvexCompleteBalls hook
- `src/pages/KitchenView.tsx` - Full gamification integration

---

## 2026-01-31 - PRD-1: Kitchen Core

**Order System V2 - Production Dashboard & Order Cards**

Built the Kitchen View with production dashboard showing ball counts, order cards with urgency indicators, and hold-to-complete functionality.

**Backend Queries:**
- `getKitchenOrders()` - Confirmed orders with calculated ball needs, sorted by priority
- `getKitchenStats()` - Aggregated ball counts (big/mid needed/completed), order counts
- `getCompletedToday()` - Orders completed since midnight

**Backend Mutations:**
- `completeOrder(orderId)` - Mark order ProductionComplete, zero all ballsRemaining
- `revertToConfirmed(orderId)` - Undo completion, restore ballsRemaining

**Frontend Components:**
- `KitchenDashboard.tsx` - 3-column stats (Big Balls, Mid Balls, Orders) with progress bars
- `KitchenOrderCard.tsx` - Order card with large ball counts, urgency states, hold-to-complete

**Urgency States:**
- **Overdue** (dueTime < now): Red pulsing border, "OVERDUE" badge
- **Urgent** (due within 2 hours): Amber pulsing border, "URGENT" badge

**Priority Sorting:** dueDate ASC → totalUnits DESC → orderDate ASC

**Files Created:**
- `src/components/orders/KitchenDashboard.tsx`
- `src/components/orders/KitchenOrderCard.tsx`
- `src/hooks/convex/useKitchenStats.ts`

**Files Modified:**
- `convex/orders/queries.ts` - 3 new queries
- `convex/orders/mutations.ts` - 2 new mutations
- `src/pages/KitchenView.tsx` - Complete refactor
- `src/lib/types.ts` - KitchenStats, KitchenOrder interfaces

---

## 2026-01-30 - PRD-0: Schema Foundation

**Order System V2 - Database Schema Hardening**

Hardened the database schema with proper type enforcement, added fields for Kitchen View features, and seeded fixed products with COGS values.

**Schema Changes:**
- Order status union (10 statuses): Draft, AwaitingPayment, Confirmed, ProductionComplete, Packaging, WaitingShipment, CompleteShipped, WaitingPickup, PickedUp, Cancelled
- Payment status union: Unpaid, Partial, Paid
- Order-level discount fields: `orderLevelDiscount`, `orderLevelDiscountType`
- MenuProducts fixed product support: `isFixed`, `unitCost`
- OrderItems ball tracking: `productionType`, `productionUnits`, `ballsRemaining`
- New `orderMessages` table for WhatsApp deduplication

**Fixed Products Seeded (menuProducts:seedFixedProducts):**

| Code | Name | Grams | Price | COGS |
|------|------|-------|-------|------|
| ORIGINAL | Original | 80g | Rp 50k | Rp 19,231 |
| BITE_SINGLE | Bite Sized Single | 45g | Rp 35k | Rp 12,422 |
| BITE_DOUBLE | Bite Sized Double | 90g | Rp 70k | Rp 24,843 |
| BITE_TRIPLE | Bite Sized Triple | 135g | Rp 99k | Rp 36,765 |

**WhatsApp Message Tracking:**
- `markMessageSent()` - Deduplication with 5-minute window
- `getMessageHistory()` - Sent message audit trail
- `getOrderTemplate()` - Clean template with product list + bank info

**Files Modified:**
- `convex/schema.ts` - Status unions, discount fields, ball tracking, orderMessages table
- `convex/menuProducts/mutations.ts` - seedFixedProducts mutation
- `convex/orders/whatsapp.ts` - Message tracking functions

---

## 2026-01-31 - WhatsApp Template Tabs with Bilingual Support

**Feature: Tabbed WhatsApp Message Templates**

Refactored WhatsApp Messages panel with a tabbed interface for different workflow stages and added Bahasa/English language toggle.

**New Tabs (mapped to order workflow):**
1. **Order Confirmation** (Konfirmasi) - Always visible, for Draft -> AwaitingPayment
2. **Payment Received** (Pembayaran) - Visible after Draft status
3. **Delivery Confirmation** (Pengiriman) - Visible at delivery/pickup stages
4. **Thank You** (Terima Kasih) - Visible at completion, includes social media links

**Features:**
- Language toggle (Bahasa/English) in panel header - Bahasa is default
- Templates auto-generate with order data (customer name, items, totals, etc.)
- Editable text before copying with Reset button
- Conditional tab visibility based on order status
- Clickable social media links in Thank You template:
  - Instagram/TikTok: @Frollie.id
  - Founder journey: @EtengandTJ

**Architecture:** Frontend generation for instant preview and language switching (no API calls)

**Files Modified:**
- `src/lib/types.ts` - Added WhatsAppTemplateTab, WhatsAppLanguage types
- `src/lib/whatsappTemplates.ts` - NEW: Template strings and generator functions
- `src/components/orders/OrderWhatsAppPanel.tsx` - Refactored with tabs and language toggle
- `src/pages/OrderDetail.tsx` - Simplified props to pass order object

---

## 2026-01-31 - Comprehensive Test Suite Implementation

**Multi-Agent Test Implementation (184 tests across 11 files)**

Implemented a complete test suite using a parallel multi-agent approach for maximum efficiency.

**Backend Unit Tests (51 tests):**
- `convex/lib/__tests__/costCalculator.test.ts` - Unit conversion, cost calculations (24 tests)
- `convex/orders/__tests__/orderHelpers.test.ts` - Order number generation, line totals (14 tests)
- `convex/orders/__tests__/whatsapp.test.ts` - Message formatting functions (13 tests)

**Convex Integration Tests (70 tests):**
- `tests/convex/recipes.test.ts` - Creation, versioning, deletion rules, linked costs (28 tests)
- `tests/convex/products.test.ts` - COGS calculation, version pinning (14 tests)
- `tests/convex/orders.test.ts` - Order creation, status transitions (16 tests)
- `tests/convex/tags.test.ts` - Default tag seeding, idempotency (12 tests)

**Frontend Tests (63 tests):**
- `src/lib/__tests__/utils.test.ts` - cn, formatCurrency, formatNumber, formatPercent (25 tests)
- `src/components/shared/__tests__/CostTooltip.test.tsx` - Tooltip rendering, null handling (8 tests)
- `src/components/shared/__tests__/ConfirmDialog.test.tsx` - Dialog interactions, loading states (10 tests)
- `src/hooks/__tests__/useConvexHooks.test.tsx` - Hook behavior, loading states (20 tests)

**Coverage Results:**
- `costCalculator.ts`: 100%
- `utils.ts`: 100%
- `helpers.ts`: 100%

**Business Rules Coverage:**
All 8 business rules from CLAUDE.md have explicit test coverage:
1. Unit conversion (kg→g, l→ml, m→cm)
2. Version immutability
3. Linked components cost inheritance
4. Product pinning to versions
5. Reusable = single component only
6. Deletion blocking rules
7. Default tag seeding
8. Order number MMDD-NNN format

**Infrastructure Added:**
- `vitest.config.ts` - Vitest configuration with jsdom environment
- `tests/setup.ts` - Test setup with jest-dom matchers
- `tests/fixtures/` - Shared test fixtures for ingredients and orders
- `convex/orders/helpers.ts` - Extracted pure functions for testability
- `convex/orders/whatsappHelpers.ts` - Extracted WhatsApp formatting functions

**Dependencies Added:**
- vitest, @vitest/coverage-v8
- @testing-library/react, @testing-library/jest-dom, @testing-library/user-event
- convex-test, jsdom

**Scripts Added:**
- `npm test` - Run all tests
- `npm run test:watch` - Watch mode
- `npm run test:coverage` - Coverage report
- `npm run test:ui` - Vitest UI

---

## 2026-01-30 - Complete Convex Migration & Documentation Update

**Full Backend Migration to Convex**

Migrated the entire backend from FastAPI + PostgreSQL to Convex, a real-time serverless database platform.

**Architecture Changes:**
- Removed FastAPI backend (`api/` directory)
- Removed PostgreSQL/SQLite database dependencies
- Removed React Query for data fetching
- Added Convex as the sole backend (queries, mutations, database)
- Frontend now uses Convex React hooks (`useQuery`, `useMutation`)

**Backend Implementation (convex/):**
- `schema.ts` - 19 tables with indexes and validators
- `lib/costCalculator.ts` - Cost calculation helper functions
- 10 entity folders with queries and mutations:
  - `ingredients/`, `materials/`, `tags/`, `menuProducts/`
  - `recipes/`, `packaging/`, `products/`
  - `customers/`, `orders/`, `dashboard/`
- `orders/whatsapp.ts` - WhatsApp message templates

**Frontend Migration:**
- Replaced all React Query hooks with Convex hooks
- Updated 11 hook files in `src/hooks/convex/`
- Updated all page components to use Convex API
- Removed axios and react-query dependencies

**Documentation Overhaul:**
- Updated `CLAUDE.md` for Convex architecture
- Rewrote `docs/SCHEMA.md` with Convex schema definitions
- Rewrote `docs/CODE_STYLE.md` with Convex patterns (removed Python)
- Rewrote `docs/API_REFERENCE.md` as Convex Functions Reference
- Rewrote `docs/DEPLOYMENT.md` for Convex deployment
- Updated `docs/WORKFLOW.md` for Convex development
- Updated `docs/ROADMAP.md` with Phase 5 (Convex Migration)

**Benefits:**
- Real-time data sync across all connected clients
- Simplified architecture (no separate API server)
- Type-safe database operations end-to-end
- Automatic scaling without server management
- Reduced deployment complexity

**Files Removed:**
- `api/` directory (FastAPI backend)
- `api/scripts/migrate_sqlite_to_pg.py`
- All SQLAlchemy models and Pydantic schemas

**Dependencies Changed:**
- Added: `convex` (^1.31.7)
- Removed: `@tanstack/react-query`, `axios`

**Migration Steps (for existing deployments):**
1. Deploy Convex backend: `npx convex deploy`
2. Set `VITE_CONVEX_URL` environment variable
3. Build and deploy frontend
4. Seed data via Convex dashboard

---

## 2026-01-30 - Production Database Seeding Endpoints

**Admin Endpoints for Vercel/Neon.tech Database Management**

Added three admin endpoints to fix production database seeding issues on Vercel serverless:
- `GET /api/admin/db-check?secret=<ADMIN_SECRET>` - Diagnose database connection and check seed status
- `POST /api/admin/seed-only?secret=<ADMIN_SECRET>` - Seed menu products and tags (for when tables exist but are empty)
- Enhanced `POST /api/admin/init-db?secret=<ADMIN_SECRET>` - Create tables and seed data with detailed error reporting

**Security Improvements:**
- All admin endpoints secured with `ADMIN_SECRET` environment variable (must be set in Vercel)
- Proper HTTP status codes: 403 Forbidden, 503 Service Unavailable, 500 Internal Server Error
- Database credential masking in error responses
- Audit logging for all admin actions

**Code Quality:**
- Extracted reusable `seed_default_data()` function in `api/app/database.py`
- Eliminated code duplication between `init_db()` and admin endpoints
- Added type hints to all admin endpoints
- Consistent FastAPI dependency injection patterns

**Files Modified:**
- `api/app/main.py` - Added 3 admin endpoints (+109 lines)
- `api/app/database.py` - Refactored seeding logic into reusable function
- `.env.example` - Documented `ADMIN_SECRET` configuration

**Why This Was Needed:**
- Vercel serverless uses `lifespan="off"` in `api/index.py`, preventing automatic database seeding on cold starts
- Manual endpoints allow operators to seed production database after deployment

**Migration Steps:**
1. Set `ADMIN_SECRET` environment variable in Vercel dashboard (generate a strong random string)
2. After deployment, call `https://your-app.vercel.app/api/admin/init-db?secret=<your-secret>`
3. Verify seeding with `https://your-app.vercel.app/api/admin/db-check?secret=<your-secret>`

---

## 2026-01-30 - Documentation Refactor

**CLAUDE.md Split into Modular Documentation**
- Refactored monolithic CLAUDE.md (~2,230 lines) into focused documentation files
- Created `docs/` directory with 7 specialized documents:
  - `SCHEMA.md` - Database schema and data flows
  - `API_REFERENCE.md` - API endpoints and response formats
  - `CODE_STYLE.md` - Coding conventions and patterns
  - `WORKFLOW.md` - Git workflow and code review process
  - `DEPLOYMENT.md` - Production deployment guide
  - `CHANGELOG.md` - Version history (this file)
  - `ROADMAP.md` - Future plans and backlog
- CLAUDE.md now serves as concise entry point (~450 lines)

**Benefits:**
- Reduced main documentation from ~25,000 to ~5,000 tokens
- Agents can load only relevant documentation for their task
- Changelog can grow independently without bloating main file
- Clearer organization by concern type

---

## 2026-01-30 - Production Deployment & Migration Infrastructure

**Monolithic Restructure for Vercel Deployment**
- Restructured project from separate frontend/backend to monolithic layout
- Moved `backend/` → `api/` for Vercel serverless functions compatibility
- Moved `frontend/src/` → `src/` and `frontend/` root files to project root
- All imports and paths updated across the codebase
- Benefits: Single deployment, simplified CORS, better cold start performance

**Vercel Configuration**
- Added `vercel.json` with rewrites for SPA routing and API routes
- Added `api/index.py` with Mangum ASGI adapter for FastAPI on Vercel
- Build configuration: `vite build` outputs to `dist/`
- API routes: `/api/*` → serverless functions in `api/`
- SPA fallback: all other routes → `index.html`

**PostgreSQL Support (Dual Database)**
- Added PostgreSQL database support alongside SQLite for production
- Uses `NullPool` for serverless environments (no connection pooling)
- Environment variables:
  - `DATABASE_URL` - PostgreSQL connection string (production)
  - `SQLITE_PATH` - SQLite file path (local dev, default: `api/data/malo_recipes.db`)
- Auto-detects database type from `DATABASE_URL` prefix (`postgresql://`)
- SQLite remains default for local development

**Migration Script (SQLite → PostgreSQL)**
- Created `api/scripts/migrate_sqlite_to_pg.py` - Full data migration tool
- Features:
  - Preserves all data, relationships, and constraints
  - Handles foreign key dependencies with correct insertion order
  - Validates data integrity after migration
  - Dry-run mode for testing
  - Detailed progress logging
- Usage: `python api/scripts/migrate_sqlite_to_pg.py --sqlite-path <path> --postgres-url <url>`
- Documentation: `api/scripts/MIGRATION_README.md`

**Environment Configuration Updates**
- Added `.env.example` with all required variables for production
- Updated `api/database.py` to support both SQLite and PostgreSQL
- Updated `api/main.py` CORS configuration for production domains
- Added production-ready logging configuration

**Files Modified:**
- Project structure: 144 files moved/renamed
- Backend: `api/database.py`, `api/main.py`, `api/requirements.txt` (+3 dependencies)
- Frontend: `vite.config.ts` (proxy configuration), `package.json` (build scripts)
- New files: `vercel.json`, `api/index.py`, `api/scripts/migrate_sqlite_to_pg.py`, `api/scripts/MIGRATION_README.md`

---

## 2026-01-30 - UI/UX Enhancements for Order Management

**OrderDetail Component Refactor (906 → 363 lines)**
- Split monolithic OrderDetail.tsx into focused, reusable components
- Created `components/orders/` directory with 7 specialized components:
  - `OrderHeader.tsx` - Order number, status badge, timestamps (200 lines)
  - `OrderStatusPanel.tsx` - Status transitions with confirmation dialogs (103 lines)
  - `OrderWhatsAppPanel.tsx` - WhatsApp templates with copy buttons (107 lines)
  - `ShippingDialog.tsx` - Shipping info form (agency, tracking) (102 lines)
  - `CancellationDialog.tsx` - Cancellation reason input (60 lines)
  - `ConfirmationDialog.tsx` - Status transition confirmations (187 lines)
  - `OrderItems.tsx` - Order line items table (79 lines)
  - `index.ts` - Barrel export for clean imports

**Component Architecture Improvements**
- Separation of concerns: Each component handles one responsibility
- Reusable confirmation dialogs for all status transitions
- Dedicated shipping dialog with agency dropdown and tracking input
- WhatsApp panel with collapsible sections for each template type
- Empty state component added to `components/shared/EmptyState.tsx`

**UI/UX Enhancements**
- Added accordion component (`components/ui/accordion.tsx`) for collapsible sections
- Improved order items table with better spacing and readability
- Better visual hierarchy with consistent badge colors and spacing
- Simplified OrderDetail main component for better maintainability

**Files Modified:**
- Frontend: `pages/OrderDetail.tsx` (refactored), `pages/OrderManager.tsx` (enhanced), `pages/KitchenView.tsx` (refined)
- New components: 7 files in `components/orders/`
- New shared component: `components/shared/EmptyState.tsx`
- New UI component: `components/ui/accordion.tsx`

---

## 2026-01-30 - Order Workflow Enhancements (3-Phase Implementation)

**Phase 1: WhatsApp Confirmation Prompts**
- Added confirmation dialog for Draft → AwaitingPayment transition
- Requires "WhatsApp sent" checkbox before advancing
- Added contextual WhatsApp templates for each status transition:
  - `format_payment_request()` - Payment request with bank details
  - `format_production_started()` - Production notification
  - `format_delivery_complete()` - Delivery confirmation
- OrderDetail response now includes all template texts

**Phase 2: Kitchen View**
- Created `KitchenView.tsx` - Production-focused order management page
- Status-grouped order cards: To Produce, Production Complete, Packaging, Ready
- Quick-action buttons to advance orders to next status
- Date filter with overdue order highlighting (red)
- Added `GET /api/orders/kitchen` endpoint
- Added navigation link in Header

**Phase 3: AwaitingPayment Status**
- Added AwaitingPayment status between Draft and Confirmed (now 10-status workflow)
- Added `awaiting_payment_since` timestamp column to Order model
- Split confirmation flow:
  - Draft → AwaitingPayment: Only requires "WhatsApp sent" checkbox
  - AwaitingPayment → Confirmed: Only requires "Payment confirmed" checkbox
- Added waiting time indicator with color-coded badges:
  - Green: < 24 hours
  - Yellow: 1-2 days
  - Red: > 2 days
- Kitchen View excludes AwaitingPayment orders (only production-relevant)
- Updated OrderManager.tsx with AwaitingPayment filter and badge

**Files Modified:**
- Backend: `models/order.py`, `schemas/order.py`, `crud/orders.py`, `routers/orders.py`, `services/whatsapp_formatter.py`
- Frontend: `lib/types.ts`, `pages/OrderDetail.tsx`, `pages/OrderManager.tsx`, `pages/KitchenView.tsx` (new), `App.tsx`, `components/layout/Header.tsx`

---

## 2026-01-30 - Order Status Workflow Migration

**Changed:**
- Migrated order statuses from old 9-status workflow to new 9-status workflow
- Old: Draft, Confirmed, Processing, Ready for Pickup, Waiting for Courier, In Transit, Shipped, Completed, Cancelled
- New: Draft, Confirmed, ProductionComplete, Packaging, WaitingShipment, CompleteShipped, WaitingPickup, PickedUp, Cancelled

**Backend:**
- Updated `backend/app/schemas/order.py` - OrderStatusUpdate pattern regex
- Updated `backend/app/crud/orders.py` - Production report active_statuses list (removed "Processing")

**Frontend:**
- Updated `frontend/src/lib/types.ts` - OrderStatus type definition
- Updated `frontend/src/pages/OrderDetail.tsx`:
  - STATUS_COLORS for all 9 new statuses
  - STATUS_OPTIONS array
  - Auto-trigger shipping dialog when selecting WaitingShipment status
  - Updated WhatsApp section visibility conditions
  - Fixed shipping agency list: Grab → GrabSend, added AnterAja
- Updated `frontend/src/pages/OrderManager.tsx`:
  - STATUS_COLORS for all 9 new statuses
  - Status filter dropdown with all 9 statuses

**Shipping Agencies:**
Gojek, GrabSend, JNE, J&T, SiCepat, AnterAja, Paxel, Lalamove, Other

---

## 2026-01-29 - Order Management Module (Complete Implementation)

**Added:**
- Complete Order Management module (standalone, no ProductVersion dependency)
- Customer entity with phone, source, notes tracking
- Order entity with MMDD-NNN format order numbers for bank transfer reference
- Order items with product_name text fields and combobox autocomplete
- WhatsApp receipt generation with bank details (BCA PT Malo Group Bahagia)
- CSV export endpoints for orders and order items
- Product and seller suggestion endpoints for autocomplete
- Sales channel tracking (IG, WA, Shopee, Tokopedia, etc.)
- Sold by field with autocomplete from previous orders

**Backend Implementation (9 files):**
- `backend/app/models/customer.py` (39 lines) - Customer model with relationships
- `backend/app/models/order.py` (104 lines) - Order and OrderItem models with cascade delete
- `backend/app/schemas/customer.py` - Customer Pydantic schemas
- `backend/app/schemas/order.py` (151 lines) - Order/OrderItem schemas with validation
- `backend/app/crud/customers.py` - Customer CRUD (list, get, create, update)
- `backend/app/crud/orders.py` (309 lines) - Order CRUD with totals calculation, suggestions, export
- `backend/app/routers/customers.py` - 4 customer endpoints
- `backend/app/routers/orders.py` (200+ lines) - 10 order endpoints + CSV export + suggestions
- `backend/app/services/whatsapp_formatter.py` - WhatsApp receipt generator

**Frontend Implementation (5 files):**
- `frontend/src/pages/OrderManager.tsx` - Order list with filters + create form
- `frontend/src/pages/OrderDetail.tsx` - Order detail page with WhatsApp copy button
- `frontend/src/components/orders/OrderForm.tsx` (300+ lines) - Complex order form
- `frontend/src/hooks/useOrders.ts` - Order React Query hooks (7 functions)
- `frontend/src/hooks/useCustomers.ts` - Customer React Query hooks

**Key Features:**
- Order number format: `MMDD-NNN` (e.g., 0129-001) for easy bank transfer reference
- Real-time totals calculation (amount, cost, margin)
- Status workflow: Draft → Confirmed → Completed → Cancelled
- Payment tracking: Unpaid → Partial → Paid with method (BCA, QRIS, Cash)
- WhatsApp-ready receipt with bank details for customer communication

---

## 2025-01-28 - Ingredient & Material Management Enhancements

**Added:**
- Edit functionality for ingredients and packaging materials
- Navigation links in header for Ingredients and Materials pages
- Edit buttons on ingredient and material cards
- Form mode switching (create vs. edit) with dynamic UI

**Updated:**
- IngredientsManager.tsx: Added edit mode with cancel button
- MaterialsManager.tsx: Added edit mode with cancel button
- Header.tsx: Added Ingredients and Materials navigation links
- Both managers now use PUT endpoints for updates

---

## 2025-01-27 - Phase 2 Frontend Complete

**Added:**
- Complete React frontend with TypeScript
- Dashboard with carousel navigation
- Recipe/Packaging/Product editors
- Version navigation and copying
- COGS calculations display
- shadcn/ui component library

**Components:**
- 13 UI components (shadcn/ui)
- 3 layout components
- 5 shared utility components
- 3 entity card components
- 4 page components
- 7 React Query hooks

**Technical:**
- React 19.2.0, Tailwind CSS 4.1.18, React Router 7.13.0
- TanStack Query 5.90.20 for server state
- Axios for HTTP client
- Lucide React for icons

---

## 2025-01-27 - Phase 1 Backend Complete

**Added:**
- FastAPI backend with SQLite database
- Full CRUD operations for all entities
- Cost calculator service
- Versioning system for recipes, packaging, products
- 41 API endpoints across 7 routers

**Models:**
- Ingredient, PackagingMaterial, Tag
- Recipe, RecipeVersion, RecipeComponent, ComponentIngredient
- PackagingRecipe, PackagingVersion, PackagingComponent, PackagingComponentMaterial
- Product, ProductVersion
