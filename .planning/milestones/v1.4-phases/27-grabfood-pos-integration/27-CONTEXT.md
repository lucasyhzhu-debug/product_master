# Phase 27: GrabFood POS Integration - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can manually pull GrabFood order history into the system, manager can view and control store status (open/pause/unpause) per outlet, and manager can toggle individual menu item availability. All via manual button trigger with no cron dependency. Webhook endpoint scaffolded but not registered.

**Critical caveat:** This integration is theoretical until API discovery validates that current credentials work against the GrabFood Partner API. Plan 27-01 MUST be an API discovery/validation plan. If credentials or API access fail, the entire phase is deferred until proper auth/link is obtained.

</domain>

<decisions>
## Implementation Decisions

### Page layout
- New page: `GrabFoodManager.tsx` at route `/grabfood`
- 3 tabs: **Orders** | **Store Status** | **Menu**
- Page-level outlet selector (dropdown) at top — all tabs show data for the selected outlet
- Access: Manager + Admin (both roles see the page; admin can trigger order sync, manager can do store control + menu toggle)

### Order sync
- **Auto-resume from last sync:** Store `lastSyncedAt` per outlet in `externalSyncLogs` — default sync pulls from last timestamp to now
- **Custom date override:** Expandable date picker for manual backfill (initial setup or gap fill)
- **Sync feedback:** Button shows spinner while syncing, toast shows "Synced N orders" on success or error message on failure
- **Revenue-focused table columns:** Order ID, date/time, items summary, subtotal, promo discount, net revenue, payment method
- **Raw JSON storage:** `rawJson` field on `grabfoodOrders` stores full API response per order — essential for discovery phase, can be dropped later when field mapping is proven
- **IDR handling:** `currency.exponent = 0` for IDR — store price as-is, no division by 100
- **Dedup:** Upsert on `orderID` field — no duplicate orders from re-syncing overlapping ranges

### Store status & pause controls
- **Status cards per outlet:** Each outlet gets a card showing outlet name, status badge (OPEN/PAUSED/CLOSED), and action buttons
- **Pause durations:** 30 / 60 / 120 minutes — presented as button group or dropdown
- **Countdown timer:** When store is paused, card shows "Paused — resumes in Xm" with live countdown
- **Manual refresh:** "Refresh Status" button (no auto-polling) with "Last checked: X min ago" timestamp
- **Unpause:** One-click unpause button on paused cards

### Menu item availability toggle
- **Display:** Simple list of menu items with current inventory level + on/off toggle per item
- **grabItemID mapping:** Fully manual — admin sees GrabFood items and assigns each to a menuProduct via dropdown. Consistent with BigSeller SKU mapping pattern in Phase 28
- **Toggle scope:** Individual toggles only (no bulk actions in v1)
- **Publish flow:** Toggles accumulate locally. User clicks "Publish Changes" button to send all changes via batch menu update API + `notifyMenuUpdate` call. Fewer API calls, allows reviewing before pushing

### Webhook handler
- **Scaffold only:** Build HTTP endpoint at `/api/grabfood/order` with HMAC-SHA256 `X-Grab-Signature` validation
- **Not registered:** Don't register webhook URL with GrabFood until manual sync is proven working
- **Pattern:** Return HTTP 200 immediately, schedule async upsert via `ctx.scheduler.runAfter(0, ...)`

### API discovery plan (Plan 27-01)
- **Mandatory first plan:** Hit GrabFood sandbox/production endpoints with current credentials
- **Validate:** Token resolution works, order list endpoint returns data, store status endpoint accessible, menu API responds
- **Map fields:** Log raw JSON responses, document field mapping to `grabfoodOrders` schema
- **Gate:** If API access fails → entire phase deferred, no further plans executed
- **Document gotchas:** Rate limits, pagination behavior, IDR exponent handling, any field mismatches

### Claude's Discretion
- Exact table pagination/sorting implementation
- Loading skeleton design for status cards
- Error state handling and retry UX
- Webhook HMAC validation implementation details
- `grabfoodOrders` schema field selection (guided by API discovery findings)

</decisions>

<specifics>
## Specific Ideas

- "Store `lastSyncedAt` per outlet so syncs auto-resume from last checkpoint — save on API calls"
- "Show current inventory alongside menu item toggles — gives managers context for availability decisions"
- "Manual mapping for grabItemID — same pattern as BigSeller SKU mapping, consistent across platforms"
- "Raw JSON storage during discovery phase — can drop the field once mapping is proven"
- "If API doesn't work, defer the whole phase — no building on broken foundations"

</specifics>

<deferred>
## Deferred Ideas

- Auto-polling store status (could add as config toggle in future)
- Bulk menu toggle ("mark all unavailable" for closing time)
- Auto-match grabItemID by name (could enhance manual mapping later)
- Webhook registration with GrabFood (activate after manual sync proven)
- Real-time order push via webhook (build on scaffold after validation)

</deferred>

---

*Phase: 27-grabfood-pos-integration*
*Context gathered: 2026-02-25*
