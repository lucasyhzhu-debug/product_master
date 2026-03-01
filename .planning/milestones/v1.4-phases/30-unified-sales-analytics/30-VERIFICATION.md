---
phase: 30-unified-sales-analytics
verified: 2026-03-01T04:20:43Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Open Sales Analytics page and verify LifetimeHero card renders at top with total units sold and lifetime revenue"
    expected: "Big number showing total units sold, smaller text showing lifetime revenue and transaction count, expandable Products button"
    why_human: "Visual layout and data correctness require live app with real data"
  - test: "Click Products button in LifetimeHero to expand per-product breakdown table"
    expected: "Table with Product, Units, Revenue columns and per-channel unit split columns; products sorted by units descending"
    why_human: "Table rendering with dynamic columns needs visual confirmation"
  - test: "Verify stacked bar chart shows all channels with distinct colors and legend-click filtering"
    expected: "GoFood (teal), K3 Mart (blue), Direct (amber), GrabFood (green), Shopee (orange), Tokopedia (violet), Consignment (purple) when data exists; clicking legend toggles channels"
    why_human: "Color distinctness and interactive behavior need visual confirmation"
  - test: "Verify Channel Breakdown section shows dynamic cards from backend data"
    expected: "All Channels card first, then individual channel cards for each channel with data; responsive grid 2/3/4 columns"
    why_human: "Dynamic rendering and responsive layout need visual confirmation"
  - test: "Verify BigSeller COGS caveat banner appears when applicable"
    expected: "Amber banner with AlertTriangle icon when BigSeller orders exist with allCostFeeZero=true"
    why_human: "Conditional rendering depends on live data state"
  - test: "Verify dark mode rendering for all new components"
    expected: "LifetimeHero, ChannelSummary, COGS caveat all readable in dark mode"
    why_human: "Dark mode visual quality requires human inspection"
  - test: "Verify period selector does not affect LifetimeHero data"
    expected: "Switching between period presets changes chart and channel breakdown but LifetimeHero stays constant"
    why_human: "Behavioral interaction between components needs live testing"
---

# Phase 30: Unified Sales Analytics Verification Report

**Phase Goal:** All sales channels appear in one stacked bar chart with per-outlet consignment segments, a lifetime units sold headline counter across all channels with per-product breakdown, and a multi-select channel filter -- making cross-channel sales comparison the primary analytics experience.
**Verified:** 2026-03-01T04:20:43Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sales Analytics stacked bar chart shows all channels with segments only rendered when revenue data exists | VERIFIED | `getRevenueTimeSeries` uses `discoveredSources = [...new Set(records.map(r => r.source))]` (line 1573) and `.filter(s => s.data.some(v => v !== 0))` (line 1626) to dynamically discover and filter channels. `PLATFORM_COLORS` has 8 entries (lines 28-37 SalesChart.tsx). |
| 2 | Multi-select channel filter lets admin show/hide individual channels via legend click | VERIFIED | `handleLegendClick` in SalesChart.tsx (line 151-160) toggles `hiddenPlatforms` Set state. Legend items render with opacity 0.3 when hidden (line 163). Both Bar and Area charts use `hide={hiddenPlatforms.has(platform)}` prop. |
| 3 | Lifetime units sold headline displays total counter with expandable per-product breakdown | VERIFIED | `LifetimeHero` component (OverviewTab.tsx line 707-797) calls `useLifetimeTotals()`, renders `data.totalUnits` as big number, `formatCurrency(data.lifetimeRevenue)` as secondary text, expandable table with per-product per-source columns. |
| 4 | GrabFood and BigSeller data flows into existing analytics aggregation via externalRevenue | VERIFIED | `sourceToPlatform()` maps all 8 sources (line 1487-1499). `getDashboardSummaryByPeriodInternal` dynamically groups by `bySource` Map (line 565), aggregates all non-internal sources. No hardcoded `["gobiz", "k3mart", "internal"]` arrays remain in analytics queries (only in `getSyncHealthStatus` which is intentionally unchanged). |
| 5 | No new reactive useQuery subscriptions for analytics | VERIFIED | `useLifetimeTotals()` uses `useAction` + `useState` pattern (useExternalData.ts line 167-187). No `useQuery(api.externalData.*)` calls found in OverviewTab.tsx. `fetchLifetimeTotals` action wrapper exists in actions.ts (line 63-71). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/externalData/queries.ts` | Dynamic channel discovery, sourceToPlatform 8 mappings, getLifetimeTotalsInternal | VERIFIED | sourceToPlatform has 8 cases (line 1487-1499), discoveredSources used in getRevenueTimeSeries (line 1573), dynamic channels array in getDashboardSummaryByPeriodInternal (line 557), revenue-descending sort in getRevenueByOutletInternal (line 1738), getLifetimeTotalsInternal exists (line 1748-1816) |
| `convex/externalData/actions.ts` | fetchLifetimeTotals action wrapper | VERIFIED | Action exists at line 63-71, calls `internal.externalData.queries.getLifetimeTotalsInternal` via `ctx.runQuery` |
| `src/hooks/convex/useExternalData.ts` | DashboardSummaryByPeriod type with dynamic channels, useLifetimeTotals hook | VERIFIED | `ChannelBreakdown` type has `source` + `displayName` fields (line 12), `channels: ChannelBreakdown[]` (line 24), `useLifetimeTotals` hook exists (line 167-187) with on-demand action fetch pattern |
| `src/components/salesAnalytics/SalesChart.tsx` | PLATFORM_COLORS with 7+ entries | VERIFIED | 8 entries: GoFood, K3 Mart, Direct, GrabFood, Shopee, Tokopedia, Consignment, BigSeller (lines 28-37), typed as `Record<string, string>` |
| `src/components/salesAnalytics/OverviewTab.tsx` | Dynamic ChannelSummary, LifetimeHero, PlatformHierarchy colors, COGS caveat | VERIFIED | ChannelSummary accepts dynamic channels array (line 446-452), CHANNEL_COLORS has 7 entries (line 436-444), LifetimeHero renders above period filter (line 1116), platformColors extended with 7 entries (line 617-625), COGS caveat banner (line 1278-1287), PlatformFilter type removed |
| `src/pages/SalesAnalytics.tsx` | Updated page description | VERIFIED | Description reads "Track revenue across all channels" (line 25) |
| `src/hooks/convex/index.ts` | Barrel exports for new hooks and types | VERIFIED | `useLifetimeTotals`, `ChannelBreakdown`, `LifetimeTotals` exported (lines 254-258) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useLifetimeTotals` | `fetchLifetimeTotals` action | `useAction(api.externalData.actions.fetchLifetimeTotals)` | WIRED | Hook calls action at line 170 of useExternalData.ts; action exists at line 63 of actions.ts |
| `fetchLifetimeTotals` | `getLifetimeTotalsInternal` | `ctx.runQuery(internal.externalData.queries.getLifetimeTotalsInternal, {})` | WIRED | Action wraps internalQuery at line 67 of actions.ts |
| `LifetimeHero` | `useLifetimeTotals` | `const { data, isLoading } = useLifetimeTotals()` | WIRED | Component calls hook at line 708 of OverviewTab.tsx, renders `data.totalUnits`, `data.lifetimeRevenue`, expandable product table |
| `OverviewTab ChannelSummary` | `getDashboardSummaryByPeriodInternal` channels array | `currentPeriod.channels` | WIRED | ChannelSummary receives `currentPeriod` (line 1267-1270), reads `channels` as array (line 453), builds dynamic segments |
| `SalesChart PLATFORM_COLORS` | Recharts Bar/Area fill props | `fill={PLATFORM_COLORS[platform] ?? "#888"}` | WIRED | Used in Bar (line 304) and Area (line 275-276) components |
| `OverviewTab` | `useBigSellerOrderStats` | `const { data: bigSellerStats } = useBigSellerOrderStats()` | WIRED | Called at line 992, rendered conditionally at line 1279 |
| `getRevenueByOutletInternal` | `sourceToPlatform` | `platformName: sourceToPlatform(platform)` | WIRED | Sort by revenue descending (line 1738), display names from sourceToPlatform (line 1731) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ANLY-01 | 30-01, 30-02 | Each consignment outlet appears as its own segment in stacked bar charts | SATISFIED (with user override) | CONTEXT.md explicitly overrides: "Consignment outlets roll up into a single 'Consignment' bar segment (not per-outlet segments); drill-down available for outlet split." Implementation correctly follows user decision. PlatformHierarchy drill-down shows per-outlet breakdown. RESEARCH.md documents this override. |
| ANLY-02 | 30-01, 30-02 | Lifetime units sold headline counter with per-product breakdown | SATISFIED | `getLifetimeTotalsInternal` scans all `externalRevenueItems` grouped by `linkedMenuProductId` and `source` (queries.ts line 1748-1816). `LifetimeHero` component renders total units, lifetime revenue, expandable product table with per-channel columns (OverviewTab.tsx line 707-797). |
| ANLY-03 | 30-01, 30-02 | Unified multi-channel Sales Analytics with all channels in stacked bar chart with multi-select filter | SATISFIED | Dynamic channel discovery in `getRevenueTimeSeries` (line 1573), 8 PLATFORM_COLORS entries in SalesChart.tsx, legend-as-filter via `hiddenPlatforms` state (existing pattern extended), dynamic ChannelSummary grid, PlatformFilter radio buttons removed. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | No TODOs, FIXMEs, placeholders, or stub implementations detected in modified files |

### Human Verification Required

### 1. LifetimeHero Visual Layout

**Test:** Open Sales Analytics page, verify LifetimeHero card renders at top with total units sold (big number) and lifetime revenue (secondary text).
**Expected:** Card above period filter bar showing total units, lifetime revenue, transaction count. Products button to expand breakdown.
**Why human:** Visual layout, data correctness, and typography require live app with populated data.

### 2. Expandable Per-Product Breakdown Table

**Test:** Click "Products" button in LifetimeHero to expand per-product breakdown.
**Expected:** Table with Product, Units, Revenue columns plus dynamic per-channel unit split columns. Products sorted by units descending. Unmapped products show "Unmapped" badge.
**Why human:** Dynamic column rendering and data correctness need visual confirmation.

### 3. Stacked Bar Chart with All Channels

**Test:** Verify chart shows all active channels with distinct colors. Click legend items to toggle channels.
**Expected:** GoFood (teal), K3 Mart (blue), Direct (amber), and additional channels when data exists. Legend click hides/shows channels. Both stacked and grouped modes work.
**Why human:** Color distinctness, interactive behavior, and chart rendering need visual confirmation.

### 4. Dynamic Channel Breakdown Grid

**Test:** Verify Channel Breakdown section shows dynamic cards from backend data.
**Expected:** "All Channels" card first, then individual channel cards with gross/net/transactions/AOV and growth indicators. Responsive grid wrapping at different screen widths.
**Why human:** Dynamic rendering and responsive layout need visual confirmation across screen sizes.

### 5. BigSeller COGS Caveat Banner

**Test:** Verify amber banner appears below PlatformHierarchy when BigSeller orders exist with allCostFeeZero=true.
**Expected:** "BigSeller profit margins not available -- COGS not configured in BigSeller. Shopee and Tokopedia revenue shown as gross only."
**Why human:** Conditional rendering depends on live data state.

### 6. Period Selector Independence

**Test:** Switch between period presets (Past 24h, Today, Last 7 Days, etc.).
**Expected:** Chart and channel breakdown update per period. LifetimeHero stays constant (always all-time data).
**Why human:** Behavioral interaction between period-dependent and period-independent components needs live testing.

### 7. Dark Mode Rendering

**Test:** Toggle dark mode and verify all new components render correctly.
**Expected:** LifetimeHero, ChannelSummary channel cards, COGS caveat banner, PlatformHierarchy colors all readable and properly styled in dark mode.
**Why human:** Dark mode visual quality requires human inspection.

### Gaps Summary

No automated gaps found. All 5 observable truths verified. All 7 artifacts exist, are substantive, and are wired. All 7 key links verified as wired. All 3 requirements satisfied. No anti-patterns detected.

The ANLY-01 requirement text specifies per-outlet consignment segments in the bar chart, but the CONTEXT.md (capturing user decisions during discussion phase) explicitly overrides this to a single "Consignment" rollup with drill-down. The implementation correctly follows the user's final decision. This is not a gap.

Type check passes (zero errors). Test suite passes (633/633). Build succeeds.

7 items flagged for human verification -- all involve visual layout, interactive behavior, or data correctness that cannot be confirmed programmatically.

---

_Verified: 2026-03-01T04:20:43Z_
_Verifier: Claude (gsd-verifier)_
