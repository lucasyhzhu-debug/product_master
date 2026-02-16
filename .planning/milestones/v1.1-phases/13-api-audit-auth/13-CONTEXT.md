# Phase 13: API Audit & Auth Architecture - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

External API integration with automated token management, sync health monitoring, multi-outlet revenue sync, unified product mapping, and sales analytics consolidation. Covers GoFood (Crystal + Goldfinch outlets) and GoBiz/K3Mart integrations. Manual sales entry for non-API platforms is out of scope (deferred).

</domain>

<decisions>
## Implementation Decisions

### Sync Health Monitoring
- **Location**: Full dashboard in integration settings page + persistent banner on main dashboard when sync fails 6+ hours
- **Settings panel**: Full dashboard per integration showing status, token expiry countdown, error details, retry controls, and sync history (last 24 hours)
- **Sync log entries**: Show data summary per sync event (e.g., "12 GoFood orders synced", "3 K3Mart dispatch plans")
- **Error display**: Inline with last status — error message visible next to status badge, no expandable section
- **Dashboard alert**: Persistent red/amber banner at top of dashboard, stays until sync succeeds again — cannot be dismissed
- **Manual sync**: "Sync Now" button per integration for admin (useful for debugging or after fixing issues)
- **Access control**: Managers can view health status (read-only), only admins can refresh tokens, trigger manual sync, or modify settings

### Product Mapping UI
- **Layout**: Card pairs — side-by-side cards showing external product ↔ internal menuProduct with match confidence indicator
- **Platform tabs**: Separate tab per platform (GoFood, K3Mart, future platforms each get their own tab with their own mapping table)
- **Unmapped items**: Highlighted at top of list with amber "Needs mapping" badge; admin selects match from dropdown
- **Auto-matching**: System auto-matches by type (Original→Original, Triple→Triple, Jumbo→Jumbo) independent of price differences
- **Mapping changes are retroactive**: When admin changes a mapping, a confirmation dialog shows impact: "X historical sales records will be updated to reflect this new mapping." All previous sales history updates retroactively to keep sales targets accurate
- **Edit flow**: Confirmation dialog required due to retroactive impact

### Token Management UX
- **Token input**: Paste field on the integration settings page with current token status (active/expired) shown above it
- **Auto-refresh**: GoBiz token auto-refreshes via cron every 30 minutes
- **Chain break notification**: Dashboard banner (same persistent pattern as sync failure) + red badge on settings nav item when manual paste is needed
- **Token expiry display**: Live countdown showing token TTL and next auto-refresh time (e.g., "Token expires in 28 min, next refresh in 2 min")
- **Instant verification**: After pasting a new token, system makes a test API call immediately — green checkmark on success, error message on failure

### Multi-Outlet Revenue & Sales Analytics
- **Outlet model**: GoFood outlets (Crystal, Goldfinch) treated like K3Mart outlets — each outlet is a customer/outlet record in sales tables, groupable in analytics
- **Grouping hierarchy**: Platform → Outlet (top level: GoFood, K3Mart, Direct; expand each to see per-outlet breakdown)
- **Direct orders**: Own orders from the existing Frollie ordering system appear as a "Direct" platform in the same hierarchy
- **New outlet registration**: Admin must register outlets in settings before they start syncing (no auto-discovery)
- **Sync frequency**: Revenue data synced every 30 minutes alongside token refresh
- **Sync visibility**: Subtle "Last updated X min ago" timestamp on analytics page, no popup notifications
- **Commission handling (API platforms)**: GoFood and K3Mart APIs provide both gross and net sales; commission percentage derived historically from the data. No manual commission input needed for API-integrated platforms.
- **Order-level detail**: Drill-down to individual orders with full detail: date, outlet, order ID, individual items with quantities and prices, gross, commission, net, payment method
- **Summary cards**: Top of analytics page shows total gross, total net, total orders across ALL platforms for selected date range
- **Date range presets**: Past 24 hours, Today, Yesterday, This Week, Past 7 Days, Past 30 Days, This Month, All Time — plus a visual date picker
- **Historical charts**: Stacked chart by platform, expandable/collapsible section
  - Daily view → last 7 days chart
  - Weekly view → last 8 weeks chart
  - Monthly view → month-to-month chart
  - Three metrics toggle: Gross sales, Net sales, Volume (units sold)
  - Same date range filters and platform filters apply to charts

### Claude's Discretion
- Exact chart library and implementation (bar vs area for stacked chart)
- Settings page layout and component structure
- Sync log pagination/scrolling pattern
- Token countdown refresh interval (real-time vs polling)
- Card pair visual design for product mapping
- Exact API error categorization and retry logic

</decisions>

<specifics>
## Specific Ideas

- Product mapping tabs should support future platforms — design the tab system to be extensible (Shopee, TikTok Shop will be added later)
- Revenue analytics should feel like a unified sales command center — all channels in one place
- GoFood provides both gross and net; commission % is reverse-calculated from historical data, not manually set
- Charts should be stacked by platform so you can visually see contribution of each channel
- Leverage the react-ui-builder agent for all frontend changes

</specifics>

<deferred>
## Deferred Ideas

- **Manual sales entry for non-API platforms** — Tamtem, Legato Goldfinch, Shopee, TikTok Shop all need manual order/revenue input with per-outlet commission rates (Legato Goldfinch = 10%, Legato Tamtem = 17%). This is a "Sales Channel Consolidation" phase.
- **Per-outlet commission rates for non-API platforms** — Manual commission percentage configuration per outlet for platforms without API access
- **Scheduled/automated reporting** — Could generate weekly sales summaries across all platforms

</deferred>

---

*Phase: 13-api-audit-auth*
*Context gathered: 2026-02-15*
