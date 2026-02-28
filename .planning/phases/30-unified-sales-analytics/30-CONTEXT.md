# Phase 30: Unified Sales Analytics - Context

**Gathered:** 2026-02-28
**Updated:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Unify all 6+ revenue sources (GoFood, GrabFood, K3 Mart, Direct, Shopee, Tokopedia, Consignment) into the existing Sales Analytics page. Extend the stacked bar chart with new channels, replace the hardcoded 3-channel breakdown with a dynamic channel list, add a lifetime units sold hero counter, and upgrade the channel filter to multi-select via interactive legend. K3Mart shows actual sales transactions only (no confirmed/unconfirmed tagging — that's a K3Mart Cockpit concern). No new pages — this enhances the existing OverviewTab.

</domain>

<decisions>
## Implementation Decisions

### Chart & color design
- Consignment outlets roll up into a single "Consignment" bar segment (not per-outlet segments); drill-down available for outlet split
- Shopee and Tokopedia appear as separate bar segments (not combined as "BigSeller") — matches underlying `externalRevenue.source` values
- Keep both stacked and grouped chart modes (existing toggle stays)
- Channels with zero data in the selected period are hidden from the chart and legend entirely
- Color palette: Claude's discretion — balance brand recognition where possible with visual distinctness (avoid multiple greens clashing)

### Channel filter UX
- Use interactive chart legend as the filter — clicking a legend item toggles that channel on/off (extends existing `hiddenPlatforms` state in SalesChart)
- No separate filter UI component needed — legend IS the filter
- Summary cards at the top always show all channels regardless of legend filter — cards are unaffected by chart toggling
- Channels with no data in the period are hidden from the legend

### Lifetime totals display
- Hero card positioned at the top of the OverviewTab, above the existing summary cards row
- Primary metric: total units sold (big number); secondary: lifetime revenue (smaller text below)
- Always shows all-time cumulative data, independent of the period selector — never changes with period filter
- Per-product breakdown: simple expandable table showing Product | Total Units | per-channel split columns; sortable

### Summary cards redesign
- Keep the 4 top-level summary cards (Gross Revenue, Net Revenue, Transactions, Delivery Fees)
- Expand the channel breakdown section below cards from hardcoded 3-platform to dynamic list of all channels with data
- Backend `getDashboardSummaryByPeriod` returns a dynamic array: `channels: [{ source, gross, net, transactions }]` — only channels with data in the period; not a fixed object shape
- Existing `ChannelBreakdownCard` expand pattern extends to 6+ channels
### Claude's Discretion
- Color palette for 6+ channels
- Filter state persistence strategy (session-only vs localStorage)
- Growth indicator behavior for channels with limited history (show "New" badge vs hide growth entirely)
- BigSeller COGS caveat placement (inline banner, tooltip, or card annotation — least intrusive but visible)
- Exact spacing, typography, loading states
- Mobile responsive layout for 6+ channel legends

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SalesChart.tsx`: Recharts BarChart/AreaChart with stacked/grouped modes, clickable legend toggling via `hiddenPlatforms` state — extend `PLATFORM_COLORS` from 3 to 6+ entries
- `OverviewTab.tsx`: Full overview layout with summary cards, channel breakdown, revenue table — extend, don't replace
- `PlatformBadge` component: Already handles all 8 platform types (k3mart, gobiz, internal, grabfood, bigseller, consignment, shopee, tiktok) with distinct colors
- `GrowthIndicator` component: Period-over-period comparison badges, handles "New" case when previous=0
- `ChannelSummary` component: Hardcoded 4-segment grid (All, K3Mart, GoBiz, Internal) with gross/net/AOV/transactions — must refactor to dynamic channel list
- `useDashboardSalesSummaryByPeriod`: On-demand action fetch pattern (no reactive subscription) — extend, don't add new subscriptions
- `useRevenueByOutlet`: Already supports per-outlet drill-down with on-demand fetch
- `useRevenueTimeSeries`: Reactive query for chart data — already supports any source in `externalRevenue`
- K3Mart dispatch plan `status: "confirmed"` field exists in cockpit — different domain (stock planning), not relevant here

### Established Patterns
- **On-demand action fetch**: Heavy analytics queries use `internalQuery` wrapped in `action`, fetched via `useAction` + `useState` (not `useQuery`). Phase 20 optimization mandate — no new reactive subscriptions for analytical data
- **Period presets**: 8 presets (past24h → allTime) with WIB timezone, stored in localStorage via `PERIOD_STORAGE_KEY`
- **Source union validator**: `externalSource` from `schema.ts` — 6 literal values shared across all external tables
- **Per-outlet revenue tracking**: K3Mart and consignment both track revenue per outlet via `externalRevenue.outletId` — analytics aggregation must handle per-outlet grouping

### Integration Points
- `sourceToPlatform()` in `queries.ts`: Currently maps only gobiz/k3mart/internal — must add grabfood, shopee, tiktok, consignment display names
- `PLATFORM_COLORS` in `SalesChart.tsx`: Currently 3 entries — must expand to 6+ with distinct colors
- `getDashboardSummaryByPeriodInternal` in `queries.ts`: Currently returns hardcoded `{ k3mart, gobiz, internal }` channels shape — must refactor to dynamic array
- `PlatformFilter` type in `OverviewTab.tsx`: Currently `"all" | "k3mart" | "gobiz" | "internal"` — remove or deprecate (legend-as-filter replaces this)
- `ChannelSummary` in `OverviewTab.tsx`: Currently hardcoded 4-segment grid — must refactor to dynamic
- No `getLifetimeTotals` query exists — new query needed (full `externalRevenue` scan, acceptable at current scale per architecture decisions)

</code_context>

<specifics>
## Specific Ideas

- The ROADMAP specifies a BigSeller COGS caveat: when all `costFee` values are 0 for BigSeller records, display "Profit = Revenue (COGS not configured in BigSeller)" — exact placement is Claude's discretion
- Period filter at top already works — lifetime hero card sits above it, unaffected by period changes
- Consignment drill-down should show per-outlet breakdown when the "Consignment" row is expanded in the channel breakdown section
- K3Mart in analytics shows actual sales transactions only — no settlement/confirmation tracking here

</specifics>

<deferred>
## Deferred Ideas

- **K3Mart confirmed/unconfirmed revenue tagging** — stock-on-shelf valuation (units on shelf × price = "unconfirmed") vs actual sales transactions ("confirmed"). Belongs in K3Mart Cockpit as a report, not in Sales Analytics. Interesting but not critical for cross-channel analytics.
- **K3Mart settlement tracking** — K3Mart settles payments to Frollie every ~2 weeks. Tracking which sales periods have been settled vs pending could be useful but is separate from sales analytics.

</deferred>

---

*Phase: 30-unified-sales-analytics*
*Context gathered: 2026-02-28*
