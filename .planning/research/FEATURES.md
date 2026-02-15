# Feature Research: v1.1 Stabilization & QoL

**Domain:** FMCG snack company operations -- API integrations, order UX, kitchen workflow, consignment dispatch, food delivery sync
**Researched:** 2026-02-15
**Confidence:** HIGH (derived from codebase analysis, existing API documentation, and domain research)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or staff revert to manual processes.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **API credential status visibility** | Staff currently cannot see if K3Mart/GoBiz tokens are valid without testing a sync. Blind operation. | LOW | `platformCredentials` table already stores `lastRefreshStatus`, `lastRefreshError`, `tokenExpiresAt`. Just needs a UI. |
| **Auto-refresh for K3Mart tokens** | Already implemented via cron (12h interval). Table stakes = it must be reliable and visible. | DONE | Cron exists in `convex/crons.ts`. Need: status display + manual refresh button (already exists as `refreshK3MartToken` action). |
| **Customer info at top of order form** | Order staff enter items first, then scroll down to customer. Phone/name should be first -- mirrors real workflow (customer approaches, identifies themselves, then orders). | LOW | Pure layout reorder in `OrderFormPOS.tsx`. Customer section currently renders after product selection. |
| **Due date display on kitchen orders** | Kitchen staff cannot see when orders are due. They produce in FIFO order-received, which is wrong when a "tomorrow" order was placed before a "today" order. | MEDIUM | `dueDate` field exists on orders table (indexed: `by_status_due_date`). Kitchen queries need to surface it, PackingPanel already has `dueDate` prop but it's not prominently displayed. |
| **Due date ranking in kitchen** | Orders must sort by due date, not creation time. This is the core kitchen prioritization mechanism. | MEDIUM | Requires changing kitchen query sort order + visual grouping by due date in all 4 kitchen panels. |
| **K3Mart outlet stock visibility** | Manager needs to see current stock across all 8 K3Mart outlets at a glance. | DONE | `getOutletStockSummary` query exists. Cockpit UI needs to be completed (stub K3MART-01 through K3MART-06). |
| **Manual stock in/out for K3Mart** | During the day, manager needs to record stock movements without waiting for batch dispatch planning. | MEDIUM | `recordStockMovement` internal mutation exists. Need a user-facing mutation + quick-entry UI on cockpit. |
| **GoFood transaction data storage** | Revenue data from GoBiz must be stored with order-level detail (items, amounts, commissions). | MEDIUM | `externalRevenue` table exists. Journal-level sync already runs on cron. Need item-level detail from orders/search API. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but dramatically improve workflow efficiency.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Day-name quick-tap for due dates** | Order staff currently use native date picker (tiny calendar on mobile). Quick-tap buttons ("Tomorrow", "Saturday", "Next Monday") with day-name labels reduce 4 taps to 1 tap. | LOW | Pure frontend. Render next 7 days as pill buttons showing day name + date. Tap = set due date. |
| **Due date shown as day name on order cards** | "Saturday" is more meaningful than "2026-02-22" at a glance. Kitchen and order staff think in day names, not ISO dates. | LOW | Format function in `orderConstants.ts`. Show "Today", "Tomorrow", "Saturday", etc. relative to current date. |
| **Production targets linked to actual orders** | Kitchen currently sees ball targets disconnected from which orders need them. Linking targets to specific orders gives kitchen staff "why" context. | HIGH | Requires aggregating BOM demand across confirmed orders, grouping by due date, showing which orders drive each target. Complex query joining orders -> orderItems -> menuProductComponents -> componentTypes. |
| **K3Mart weekly dispatch with holiday awareness** | Indonesia has 25+ holidays/year including cuti bersama (collective leave). Dispatch planning must account for outlet closures and pre-holiday stock buildup. | MEDIUM | Weekly dispatch planner exists (`getWeeklyDispatchPlans`). Need: holiday data source, visual markers on calendar, adjusted suggested quantities for pre-holiday days. |
| **GoFood multi-outlet transaction sync** | Two outlets (Goldfinch "Legato Gf" + Crystal "GoFood Crystal") with different merchant IDs. Unified view showing both outlets' revenue, broken down by product. | MEDIUM | GoBiz adapter already syncs for merchant `G293156297`. Need to add `G347061572`, product mapping table, and per-outlet aggregation. Config hardcodes single merchant. |
| **Unified API dashboard** | Single page showing all external platform statuses (K3Mart, GoBiz), token health, last sync times, sync errors. Instead of checking each integration separately. | MEDIUM | Data exists across `platformCredentials`, `externalSyncLogs`. Need a unified dashboard view. |
| **Audit trail on order status updates** | Track WHO moved an order to each status and WHEN. Currently only tracks the order creator. | MEDIUM | Requires new `statusHistory` array or separate table. Each status transition records user, timestamp, previous status. |
| **Discounted total on order cards** | Order list shows gross total but not the actual amount after voucher discount. Staff misjudge revenue at a glance. | LOW | `OrderCardCompact` already receives order data including `voucher_discount_value`. Add display logic. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full GoFood POS integration (accept orders in app)** | "We could receive GoFood orders directly in our system." | Requires GoFood Facilitator Model partnership, webhook infrastructure, real-time order acceptance SLA, menu sync. Massive scope for 2 outlets. | Sync transaction data for reporting only. Order fulfillment stays in GoBiz portal. |
| **Automated K3Mart stock reorder** | "System should auto-submit stock requests when inventory is low." | K3Mart API stock-flow requires outlet staff approval. Auto-submission without human review risks over/under stocking, wrong outlet targeting, and rejected requests that nobody notices. | Suggest quantities (already built: `calculateSuggestedQty`). Human confirms and submits. |
| **Real-time GoFood order notifications** | "Alert us when a GoFood order comes in." | GoBiz webhook infrastructure not available without Facilitator partnership. Polling would hit rate limits and add complexity for marginal value (staff already see orders in GoBiz app). | Periodic revenue sync (already built: 7x daily cron). Focus on post-hoc analytics, not real-time. |
| **Generic calendar/scheduling system** | "Build a full calendar with events, reminders, recurring dispatch schedules." | Over-engineering. The dispatch planner needs week-view with holiday markers, not a full calendar system. | Holiday-aware week grid specific to dispatch planning. Static holiday list updated annually. |
| **GoBiz programmatic login (email/password)** | "Auto-login to GoBiz like we do for K3Mart." | GoBiz token API (`api.gobiz.co.id/goid/token`) uses email/password grant. But tokens expire in 4-8h, refresh mechanism is fragile (cookie-based, browser-emulation), and Gojek may block automated logins. Current 3-method cascade in `adapter.ts` already tries this. | Hybrid: attempt auto-refresh first (refresh token cascade). Fall back to manual token paste if refresh fails. Show clear status so admin knows when to intervene. |
| **Simplify inventory modal by removing ALL identifiers** | "Just let me type a name, no codes needed." | Without any unique identifier, duplicate inventory entries become undetectable. Merging or reconciling stock becomes impossible. | Drop the component CODE requirement (as requested), but keep a unique NAME constraint. Auto-generate a simple code from the name if needed for internal tracking. |

---

## Feature Dependencies

```
[API Dashboard & Auth] (Phase 2)
    |
    +---> [GoFood Multi-Outlet Sync] (Phase 6) -- needs auth architecture designed first
    |         |
    |         +---> requires: product mapping table
    |         +---> requires: multi-merchant config (currently hardcoded single merchant)
    |
    +---> [K3Mart Token Auto-Refresh] -- ALREADY DONE, just needs status display
    |
    +---> [GoBiz Token Refresh Hardening] (Phase 6) -- needs auth dashboard for visibility

[Order QoL Fixes] (Phase 3) -- INDEPENDENT, no backend schema changes
    |
    +---> [Customer info reposition] -- layout only
    +---> [Due date quick-tap] -- frontend only
    +---> [Hide creation date] -- frontend only
    +---> [Discounted total on cards] -- frontend only
    +---> [Audit trail on status updates] -- DOES require schema change (new field or table)

[Kitchen Due Date & Targets] (Phase 4)
    |
    +---> requires: due date field already on orders (DONE)
    +---> requires: BOM data (componentTypes + menuProductComponents) -- DONE
    +---> [Due date ranking] -- query sort change
    +---> [Production targets linked to orders] -- complex aggregation query
    +---> [Kitchen inventory manager overrides] -- new mutation + UI

[K3Mart Weekly Dispatch] (Phase 5)
    |
    +---> requires: K3Mart cockpit queries (DONE)
    +---> requires: dispatch plan mutations (DONE)
    +---> [Holiday awareness] -- needs holiday data source
    +---> [Manual stock in/out UI] -- needs user-facing mutation wrapper
    +---> [Push demand to kitchen] -- needs to write to production targets or create kitchen orders

[Audit Trail] (Phase 3)
    +---> enhances: [Kitchen Due Date] -- kitchen sees who moved order to InProduction
    +---> enhances: [Order Detail] -- full status change history visible
```

### Dependency Notes

- **GoFood multi-outlet requires API auth architecture:** The current GoBiz config hardcodes a single merchant ID. Multi-outlet means the sync must iterate over merchants and correctly attribute revenue to each outlet. The auth architecture must handle tokens that may work for one merchant but not another.
- **Kitchen due-date ranking is independent of order QoL:** Kitchen reads order data but the order form changes (Phase 3) and kitchen display changes (Phase 4) touch completely different files. Can be parallelized.
- **Audit trail spans Phase 3 and Phase 4:** The schema change (storing who/when for status updates) should happen in Phase 3 with order QoL. Kitchen Phase 4 then reads that data.
- **Holiday awareness conflicts with nothing:** Pure additive feature. A static JSON list of Indonesian holidays for 2026 is sufficient. No API dependency needed.

---

## MVP Definition

### Launch With (v1.1 Core -- Phases 2-5)

- [ ] **API credential status dashboard** -- Admin can see token health for K3Mart and GoBiz at a glance
- [ ] **Customer info at top of order form** -- Layout reorder, zero risk
- [ ] **Due date quick-tap buttons** -- Next 7 days as day-name pills
- [ ] **Hide order creation date input** -- Auto-set to now, display-only
- [ ] **Due date display in kitchen** -- Show day name + date on packing orders
- [ ] **Due date ranking** -- Sort kitchen orders by due date ascending
- [ ] **K3Mart cockpit completion** -- Fill in stub implementations K3MART-01 through K3MART-06
- [ ] **Manual stock in/out on cockpit** -- Quick entry without full dispatch planning
- [ ] **GoFood second outlet (Crystal)** -- Add merchant G347061572 to sync
- [ ] **Discounted total on order cards** -- Show voucher discount amount

### Add After Validation (v1.1.x)

- [ ] **Production targets linked to specific orders** -- Trigger: kitchen staff still confused about why targets are set. Complex aggregation.
- [ ] **Holiday-aware dispatch suggestions** -- Trigger: first holiday where dispatch planning was wrong. Hardcode 2026 holidays first.
- [ ] **Full audit trail on all status updates** -- Trigger: dispute about who changed an order status. Schema change required.
- [ ] **Inventory modal simplification** -- Trigger: inventory staff complaints about component code friction.

### Future Consideration (v2+)

- [ ] **GoFood Facilitator Model integration** -- Full POS integration. Only if volume justifies partnership effort.
- [ ] **Automated dispatch submission to K3Mart API** -- After confidence in suggested quantities is high.
- [ ] **Multi-platform dashboard with Shopee** -- Only after GoFood + K3Mart are stable.
- [ ] **Kitchen offline/PWA mode** -- Only if connectivity issues become a blocker.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Customer info at top | HIGH | LOW | P1 | 3 |
| Due date quick-tap | HIGH | LOW | P1 | 3 |
| Due date in kitchen | HIGH | MEDIUM | P1 | 4 |
| Due date ranking | HIGH | MEDIUM | P1 | 4 |
| API status dashboard | HIGH | MEDIUM | P1 | 2 |
| K3Mart cockpit completion | HIGH | MEDIUM | P1 | 5 |
| GoFood Crystal outlet | MEDIUM | MEDIUM | P1 | 6 |
| Discounted total on cards | MEDIUM | LOW | P1 | 3 |
| Hide creation date | MEDIUM | LOW | P1 | 3 |
| Manual stock in/out | MEDIUM | MEDIUM | P2 | 5 |
| Holiday-aware dispatch | MEDIUM | MEDIUM | P2 | 5 |
| Production targets linked to orders | HIGH | HIGH | P2 | 4 |
| Audit trail | MEDIUM | MEDIUM | P2 | 3 |
| GoBiz auto-refresh hardening | MEDIUM | HIGH | P2 | 6 |
| Inventory modal simplification | LOW | LOW | P3 | 3 |

**Priority key:**
- P1: Must have for v1.1 launch -- directly addresses user pain points
- P2: Should have, add when possible -- improves workflow but not blocking
- P3: Nice to have, future consideration

---

## Detailed Feature Specifications

### 1. API Dashboard with Auto-Auth Token Management (Phase 2)

**User workflow:**
1. Admin opens "API Integrations" page (new page, admin-only)
2. Sees card per platform: K3Mart, GoBiz
3. Each card shows: platform name, token status (green/yellow/red), last refresh time, next refresh time, last error (if any)
4. K3Mart card: "Refresh Now" button triggers `refreshK3MartToken` action
5. GoBiz card: "Paste Token" field for manual bearer token entry (uses existing `saveDirectToken` mutation) + "Test Connection" button
6. Both cards: "Last Sync" timestamp from `externalSyncLogs`, "Sync Now" button

**Token status indicators:**
- GREEN: Token valid, expires in >2h, last sync successful
- YELLOW: Token valid but expires in <2h, or last sync had warnings
- RED: Token expired, last refresh failed, or no token stored

**What already exists (backend):**
- `platformCredentials` table with `currentToken`, `tokenExpiresAt`, `lastRefreshStatus`, `lastRefreshError`
- `refreshK3MartToken` action (public, admin-only)
- `saveDirectToken` mutation for GoBiz manual paste
- `externalSyncLogs` table with per-source timestamps
- 12h K3Mart cron refresh, 7x daily GoBiz revenue sync cron

**What needs building:**
- New page: `src/pages/ApiDashboard.tsx`
- New query: `platformCredentials/queries.ts:getAllPlatformStatuses` (public, admin-only)
- GoBiz "Test Connection" action (attempt a lightweight API call with current token)
- Route in `App.tsx`, protected for admin role

**Complexity:** MEDIUM (mostly frontend, backend pieces exist)

### 2. Order Creation UX Improvements (Phase 3)

**Current layout (OrderFormPOS.tsx):**
```
LEFT COLUMN:                    RIGHT COLUMN:
1. Product Selection (POS grid)  Order Summary (sticky)
2. Customer Info                 - Voucher
3. Delivery                      - Subtotals
4. Dates & Notes                 - Submit button
```

**Target layout:**
```
LEFT COLUMN:                    RIGHT COLUMN:
1. Customer Info (moved up!)     Order Summary (sticky)
2. Product Selection (POS grid)  - Due Date (moved here!)
3. Delivery                      - Voucher
4. Notes only                    - Subtotals
                                 - Submit button
```

**Due date quick-tap design:**
- Remove native `<input type="date">` (tiny calendar widget, bad on mobile)
- Replace with horizontal scroll of pill buttons showing next 7 days
- Each pill: day name on top ("Sat"), date below ("Feb 22")
- "Today" pill highlighted differently. Selected pill = brand color fill
- Left/right arrow buttons to shift the 7-day window forward/back by a week
- If staff needs a date beyond 2 weeks, small "Pick date..." link opens native picker as fallback

**Day name display format:**
- Today: "Today (Sat)"
- Tomorrow: "Tomorrow (Sun)"
- Within 6 days: "Monday", "Tuesday", etc.
- Beyond 6 days: "Feb 24 (Tue)"

**Hide creation date:** Remove the disabled "Order Date" input. It adds no value (always today). If needed for audit, it's already stored as `_creationTime` on the record.

**Discounted total on order cards:**
- If voucher applied: show "~~Rp 450.000~~ Rp 405.000 (-10%)"
- Strikethrough gross, bold net, small discount badge

**Audit trail on status updates:**
- Add `statusHistory` array field to orders schema: `[{ status, changedBy, changedAt, note? }]`
- On every status transition mutation, push to this array
- Display in OrderDetail as timeline entries within the status accordion

**Complexity:** LOW-MEDIUM (layout changes are low, audit trail is medium due to schema change)

### 3. Kitchen Due-Date Ranking & Production Targets (Phase 4)

**Current kitchen behavior:**
- 4 panels: Production Log, To Box, To Sticker, To Pack
- Packing panel shows orders but does NOT display due dates prominently
- Orders appear in creation order, not due-date order
- Production targets show ball counts but not linked to specific order demand

**Target behavior:**

**Due date display:**
- Every order card in kitchen shows due date as primary visual element
- Format: Large day name ("SATURDAY") + small date ("Feb 22")
- Color coding: Red = overdue, Orange = due today, Yellow = due tomorrow, Green = 2+ days out
- Group headers in order lists: "DUE TODAY (3 orders)", "DUE TOMORROW (5 orders)", etc.

**Ranking:**
- All kitchen panels sort orders by: (1) due date ascending, (2) order number ascending (tiebreaker)
- Overdue orders always float to top with red visual treatment
- Query change: `useKitchenProduction` hook must sort packing orders by due date
- Backend: kitchen queries already use `by_status_due_date` index -- just need to leverage it

**Production targets linked to orders:**
- Production Log panel currently shows: "Mid Ball target: 50, produced: 30"
- Enhanced: "Mid Ball target: 50 (from 3 orders due today, 2 orders due tomorrow)"
- Breakdown: "Order 0215-001 (Sat): 12 mid balls, Order 0215-003 (Sat): 8 mid balls, ..."
- This requires: query that joins confirmed/inProduction orders -> orderItems -> menuProductComponents -> componentTypes, aggregated by ball type and due date

**Kitchen inventory manager overrides:**
- Problem: brochures (packaging materials) show "unavailable" but physical stock exists
- Solution: Manager override button on kitchen inventory items
- Mutation: admin/manager can set `overrideQuantity` on packaging inventory batch
- UI: lock icon on inventory items, manager taps to enter override quantity with reason

**Complexity:** MEDIUM-HIGH (due date display = medium, linked targets = high query complexity)

### 4. K3Mart Weekly Dispatch Planning with Holiday Awareness (Phase 5)

**Current state:**
- Backend: `getWeeklyDispatchPlans`, `saveWeeklyDispatchPlan`, `confirmDayPlan` mutations all exist
- Backend: `getWeekDates`, `getWeekNumber`, `calculateSuggestedQty` helpers exist
- Frontend: Cockpit page exists with stub implementations (K3MART-01 through K3MART-06)
- 8 active outlets (SCBD, Gading Serpong, Bintaro, Kota Kasablanka, Old Shanghai, Lippo Puri, LM Nusantara, Tamtem)

**Weekly dispatch planning workflow:**
1. Manager opens K3Mart Cockpit on Sunday/Monday
2. Sees week grid: Mon-Sun columns, product rows, outlet tabs
3. System pre-fills suggested quantities based on: restock targets, current stock, 7-day avg sales
4. Manager adjusts quantities per day per product per outlet
5. Highlights: holidays (red), weekends (gray), today (blue border)
6. "Confirm Day" button marks day's plan as confirmed -> triggers kitchen delta calculation
7. "Submit to K3Mart" button sends stock-flow requests via API

**Holiday awareness implementation:**
- Data source: Static JSON file with 2026 Indonesian holidays (25 days including cuti bersama)
- Source: Government decree from September 2025 (stable for the year)
- DO NOT use an external API -- holidays are known a year in advance and change requires government decree
- Format: `{ date: "2026-03-31", name: "Hari Raya Idul Fitri", type: "national" | "cuti_bersama" }`
- Visual: Holiday cells highlighted red with holiday name tooltip
- Logic: On holiday dates, suggested quantity = 0 (outlet likely closed). Day before holiday = increased suggested quantity (pre-holiday stocking, +50% of normal).
- Weekend handling: Already differentiated via `restockTargets.weekendTarget` vs `weekdayTarget`

**Manual stock in/out (same-day ad-hoc):**
- Quick entry: Select outlet -> select product -> enter quantity -> select direction (in/out) -> submit
- Source tracking: "kitchen" (fresh from production), "goldfinch" (from GoFood depot), "outlet" (transfer between K3Mart outlets)
- For stock-out: destination selection (return to office, send to goldfinch, transfer to another outlet)
- Backend: `processStockOutDestination` mutation already handles routing
- Need: User-facing wrapper mutation with auth, simple form UI on cockpit

**Complexity:** MEDIUM (backend exists, frontend needs building, holiday data is static)

### 5. GoFood Multi-Outlet Transaction Sync (Phase 6)

**Current state:**
- GoBiz adapter syncs revenue for merchant `G293156297` (Goldfinch "Legato Gf")
- Config hardcodes single merchant ID in `GOBIZ_CONFIG.merchantId`
- Journal search body builder accepts merchant IDs as parameter
- Revenue stored in `externalRevenue` table with `outletId` reference
- Two outlet records likely exist in `externalOutlets` (Legato Gf + GoFood Crystal)
- Product mapping exists: "Dubai Chewy Cookie - Regular Size" -> "Original - Single (45k)"

**Target behavior:**
1. Sync runs for BOTH merchants: `G293156297` (Legato Gf) and `G347061572` (GoFood Crystal)
2. Each merchant's transactions stored with correct outlet reference
3. Revenue dashboard shows per-outlet breakdown
4. Product mapping table maps GoFood product names to internal menuProduct IDs
5. Key metrics per outlet per day: gross_amount, merchant_share (net), total_fee (commission), transaction count, item-level breakdown

**Implementation approach:**
- Change `GOBIZ_CONFIG` to support array of merchants: `merchants: [{ id: "G293...", outletName: "Legato Gf" }, { id: "G347...", outletName: "GoFood Crystal" }]`
- Sync action iterates over merchants, using same token (GoBiz tokens are account-level, not merchant-level)
- Journal search body already accepts merchant_id array -- just pass both
- Ensure `externalRevenue` records correctly link to respective `externalOutlets` records
- Build/complete `externalProductMappings` entries for Crystal outlet products

**Token management for GoBiz:**
- Current: 3-method refresh cascade (cookie refresh -> token rotate -> API refresh)
- Problem: All 3 methods are fragile. GoBiz is not designed for programmatic access.
- Solution: Strengthen auto-refresh, but keep manual paste as reliable fallback
- Admin dashboard shows token TTL countdown. Yellow warning when <2h remaining.
- If auto-refresh fails 2x in a row, alert admin (toast or dashboard notification)

**Complexity:** MEDIUM (mostly config changes + ensuring correct outlet attribution)

---

## Sources

- Direct codebase analysis: `convex/platformCredentials/`, `convex/k3martCockpit/`, `convex/integrations/gobiz/`, `src/components/orders/OrderFormPOS.tsx`, `src/components/kitchen/`
- [GoBiz API documentation](D:\Claude\Product Manager\product_master\docs\apiS\gojek search transactions documentation.txt) -- internal reference doc with full API specs, merchant IDs, product mappings
- [K3Mart API config](D:\Claude\Product Manager\product_master\convex\integrations\k3mart\config.ts) -- endpoint definitions, product IDs, outlet mappings
- [Indonesia Public Holidays 2026](https://holiday.forpublic.id/en/2026/holidays) -- 25 holidays including cuti bersama
- [Holiday API - Indonesia](https://holidayapi.com/countries/id/2026) -- machine-readable holiday data
- [Calendarific - Indonesia 2026](https://calendarific.com/holidays/2026/ID) -- alternative holiday data source
- [Date Picker UX Best Practices - NN/g](https://www.nngroup.com/articles/date-input/) -- form field design guidelines
- [Date Picker Examples - Storyly](https://www.storyly.io/post/best-user-experience-datepicker-examples-for-mobile-and-web) -- quick-select pattern examples
- [GoBiz Developer Portal](https://developer.gobiz.com/) -- official integration docs (Facilitator Model)
- [OAuth Token Refresh Patterns](https://oneuptime.com/blog/post/2026-01-24-oauth2-token-refresh/view) -- auto-refresh best practices

---
*Feature research for: v1.1 Stabilization & QoL*
*Researched: 2026-02-15*
