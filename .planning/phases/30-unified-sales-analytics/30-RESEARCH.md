# Phase 30: Unified Sales Analytics - Research

**Researched:** 2026-02-28
**Domain:** Frontend analytics dashboard refactoring + backend query extension
**Confidence:** HIGH

## Summary

Phase 30 transforms the existing 3-channel Sales Analytics into a unified multi-channel analytics dashboard supporting 8+ channels. The work is primarily refactoring existing code -- no new libraries, no schema changes, no new pages. The backend queries (`getDashboardSummaryByPeriodInternal`, `getRevenueTimeSeries`, `getRevenueByOutletInternal`) and frontend components (`OverviewTab`, `SalesChart`, `ChannelSummary`) already handle `externalRevenue` records from all sources; they just need to stop hardcoding the 3-platform assumption and switch to dynamic channel discovery.

The critical architectural insight is that the `externalRevenue` table already has data from all sources (gobiz, k3mart, internal, grabfood, shopee, consignment) via previous phases' revenue bridges. The backend queries scan this table by period -- the data is already there. The hardcoding happens in three places: (1) the `platforms` constant in `getRevenueTimeSeries` is `["gobiz", "k3mart", "internal"]`, (2) the `channels` return shape in `getDashboardSummaryByPeriodInternal` is `{ k3mart, gobiz, internal }`, and (3) the frontend `ChannelSummary` component builds a fixed 4-segment grid. Converting these from fixed to dynamic is the core task.

**Primary recommendation:** Extend existing queries and components to dynamically discover and display all channels present in the data -- no new pages, no new schema, no new libraries. Two new backend queries needed: `getLifetimeTotalsInternal` (full externalRevenue + externalRevenueItems scan) and a BigSeller COGS caveat check.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Consignment outlets roll up into a single "Consignment" bar segment (not per-outlet segments); drill-down available for outlet split
- Shopee and Tokopedia appear as separate bar segments (not combined as "BigSeller") -- matches underlying `externalRevenue.source` values
- Keep both stacked and grouped chart modes (existing toggle stays)
- Channels with zero data in the selected period are hidden from the chart and legend entirely
- Color palette: Claude's discretion -- balance brand recognition where possible with visual distinctness (avoid multiple greens clashing)
- Use interactive chart legend as the filter -- clicking a legend item toggles that channel on/off (extends existing `hiddenPlatforms` state in SalesChart)
- No separate filter UI component needed -- legend IS the filter
- Summary cards at the top always show all channels regardless of legend filter -- cards are unaffected by chart toggling
- Channels with no data in the period are hidden from the legend
- Hero card positioned at the top of the OverviewTab, above the existing summary cards row
- Primary metric: total units sold (big number); secondary: lifetime revenue (smaller text below)
- Always shows all-time cumulative data, independent of the period selector -- never changes with period filter
- Per-product breakdown: simple expandable table showing Product | Total Units | per-channel split columns; sortable
- Keep the 4 top-level summary cards (Gross Revenue, Net Revenue, Transactions, Delivery Fees)
- Expand the channel breakdown section below cards from hardcoded 3-platform to dynamic list of all channels with data
- Backend `getDashboardSummaryByPeriod` returns a dynamic array: `channels: [{ source, gross, net, transactions }]` -- only channels with data in the period; not a fixed object shape
- Existing `ChannelBreakdownCard` expand pattern extends to 6+ channels

### Claude's Discretion
- Color palette for 6+ channels
- Filter state persistence strategy (session-only vs localStorage)
- Growth indicator behavior for channels with limited history (show "New" badge vs hide growth entirely)
- BigSeller COGS caveat placement (inline banner, tooltip, or card annotation -- least intrusive but visible)
- Exact spacing, typography, loading states
- Mobile responsive layout for 6+ channel legends

### Deferred Ideas (OUT OF SCOPE)
- K3Mart confirmed/unconfirmed revenue tagging -- stock-on-shelf valuation (units on shelf x price = "unconfirmed") vs actual sales transactions ("confirmed"). Belongs in K3Mart Cockpit as a report, not in Sales Analytics.
- K3Mart settlement tracking -- K3Mart settles payments to Frollie every ~2 weeks. Tracking which sales periods have been settled vs pending could be useful but is separate from sales analytics.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ANLY-01 | Each consignment outlet (Goldfinch, Tamtem) appears as its own segment in Sales Analytics stacked bar charts; segments only shown when revenue data exists for that outlet | **CONTEXT.md overrides this**: Consignment rolls up into single "Consignment" segment with drill-down for outlet split. Backend already tracks `outletId` on consignment `externalRevenue` records; `getRevenueByOutletInternal` already groups by outlet. Chart shows "Consignment" as one segment; `PlatformHierarchy` component handles per-outlet drill-down. |
| ANLY-02 | Sales Analytics displays a lifetime units sold headline counter with per-product breakdown table across all channels | New `getLifetimeTotalsInternal` internalQuery scanning all `externalRevenueItems` grouped by `linkedMenuProductId`; wrapped in action for on-demand fetch. `externalRevenueItems` has `quantity` field and `by_menu_product` index. Hero card at top of OverviewTab. |
| ANLY-03 | Unified multi-channel Sales Analytics view with all channels in one stacked bar chart with multi-select channel filter | Extend `getRevenueTimeSeries` from hardcoded 3 platforms to dynamic discovery. Extend `PLATFORM_COLORS` from 3 to 8+ entries. Legend-as-filter already works via `hiddenPlatforms` state -- just needs more channels. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | (existing) | Stacked bar/area charts | Already used in SalesChart.tsx; BarChart + Area + Legend components |
| Convex | ^1.31.7 | Backend queries + actions | Project standard; internalQuery + action pattern for analytics |
| React | ^19.2.0 | Frontend components | Project standard |
| Tailwind CSS | ^4.1.18 | Styling | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Lucide React | (existing) | Icons (Package, Hash, etc.) | Hero card icons |
| Sonner | (existing) | Toast notifications | Error handling on fetch failures |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts legend-as-filter | Separate MultiSelect dropdown | User decided: legend IS the filter -- no separate component |
| New aggregation table | Full scan of externalRevenue | User decided: acceptable at current scale; defer pre-aggregation to v1.5+ (ANLY-04) |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended File Changes
```
convex/externalData/
  queries.ts           # Extend getDashboardSummaryByPeriodInternal, getRevenueTimeSeries, getRevenueByOutletInternal; add getLifetimeTotalsInternal
  actions.ts           # Add fetchLifetimeTotals action wrapper

src/hooks/convex/
  useExternalData.ts   # Update DashboardSummaryByPeriod type, add useLifetimeTotals hook

src/components/salesAnalytics/
  OverviewTab.tsx      # Refactor ChannelSummary to dynamic, add LifetimeHero card, update PlatformFilter type
  SalesChart.tsx       # Expand PLATFORM_COLORS, update sourceToPlatform display names
```

### Pattern 1: Dynamic Channel Discovery (Backend)
**What:** Replace hardcoded platform arrays with discovery from query results
**When to use:** All three analytics backend queries
**Example:**
```typescript
// BEFORE (hardcoded in getRevenueTimeSeries):
const platforms = ["gobiz", "k3mart", "internal"] as const;
const buckets = new Map<string, Record<string, number>>();
// ... initializes with { gobiz: 0, k3mart: 0, internal: 0 }

// AFTER (dynamic discovery):
// Collect all unique sources from the records
const discoveredSources = new Set(records.map(r => r.source));
const buckets = new Map<string, Record<string, number>>();
// ... initialize each bucket with all discovered sources set to 0
// ... build series from discovered sources, filtering out zero-total series
```

### Pattern 2: On-Demand Action Fetch (Lifetime Totals)
**What:** Use internalQuery wrapped in action, fetched via useAction + useState
**When to use:** All new analytical queries -- mandatory per Phase 20 optimization mandate
**Example:**
```typescript
// Backend (queries.ts):
export const getLifetimeTotalsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Full scan of externalRevenueItems grouped by linkedMenuProductId + source
    const items = await ctx.db.query("externalRevenueItems").collect();
    // ... aggregate by product and source
  },
});

// Backend (actions.ts):
export const fetchLifetimeTotals = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.runQuery(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );
  },
});

// Frontend hook (useExternalData.ts):
export function useLifetimeTotals() {
  const [data, setData] = useState<LifetimeTotals | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.externalData.actions.fetchLifetimeTotals);
  // ... same pattern as useDashboardSalesSummaryByPeriod
}
```

### Pattern 3: Dynamic Channel Summary (Frontend)
**What:** Replace fixed 4-segment grid with dynamic channel list from backend
**When to use:** ChannelSummary component refactoring
**Example:**
```typescript
// BEFORE: channels: { k3mart: ChannelBreakdown; gobiz: ChannelBreakdown; internal: ChannelBreakdown }
// AFTER:  channels: Array<{ source: string; displayName: string; gross: number; net: number; transactions: number }>

// Frontend renders dynamically:
const segments = [
  { key: "all", label: "All Channels", ... },
  ...channels.map(ch => ({
    key: ch.source,
    label: ch.displayName,
    colorClass: CHANNEL_COLORS[ch.source]?.border ?? "border-t-gray-500",
    dotClass: CHANNEL_COLORS[ch.source]?.dot ?? "bg-gray-500",
    current: { gross: ch.gross, net: ch.net, transactions: ch.transactions },
    previous: prevChannels.find(p => p.source === ch.source) ?? { gross: 0, net: 0, transactions: 0 },
  })),
];
```

### Pattern 4: Consignment Rollup with Drill-Down
**What:** Group all consignment sources into one "Consignment" segment in charts and channel summary, with outlet-level drill-down in PlatformHierarchy
**When to use:** Chart rendering and channel breakdown
**Example:**
```typescript
// In getRevenueTimeSeries: treat all source="consignment" as a single "Consignment" series
// In getRevenueByOutletInternal: already groups by outlet under each platform -- works as-is
// Display name mapping: sourceToPlatform("consignment") → "Consignment"
```

### Anti-Patterns to Avoid
- **Hardcoded platform lists:** Never add new entries to a static `["gobiz", "k3mart", "internal"]` list. Discover from data.
- **New reactive subscriptions for analytics:** All heavy analytics queries MUST use the action-fetch pattern (internalQuery + action + useAction/useState). Violating this causes bandwidth spikes per Phase 20 mandate.
- **Separate filter component:** The legend-as-filter pattern is locked. Do not create a separate MultiSelect or CheckboxGroup component for channel filtering.
- **Per-outlet segments in chart:** Consignment outlets roll up to one "Consignment" segment. Do not create per-outlet chart series.
- **Breaking the summary cards return shape:** The top-level summary cards (Gross, Net, Commissions, Discounts, Delivery Fees) still show ALL channels combined. Don't touch the total aggregation logic -- only change the `channels` key from fixed object to dynamic array.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart legend toggling | Custom checkbox filter | Recharts Legend `onClick` handler | Already implemented in `SalesChart.tsx` via `handleLegendClick` + `hiddenPlatforms` state; just needs more platforms |
| Period range calculation | Manual date math | `calculatePeriodRange()` from `convex/lib/periodRange.ts` | Already handles WIB timezone, all 8 presets, current/previous comparison |
| Channel display names | Inline switch statements | Centralized `sourceToPlatform()` function | Already exists in `queries.ts`; just needs new source entries |
| Growth comparison badges | Manual percentage calculation | `GrowthIndicator` component | Already handles 0→0 (dash), 0→N (New badge), positive/negative styling |
| Platform color badges | Inline color logic | `PlatformBadge` component | Already handles all 8 platform types including `shopee` and `tiktok` |

**Key insight:** Most of the UI components needed already exist. This phase is 80% refactoring from fixed to dynamic, 20% new code (lifetime hero card + COGS caveat banner).

## Common Pitfalls

### Pitfall 1: Breaking the DashboardSummaryByPeriod Type Contract
**What goes wrong:** The frontend `DashboardSummaryByPeriod` type in `useExternalData.ts` defines `channels: { k3mart: ChannelBreakdown; gobiz: ChannelBreakdown; internal: ChannelBreakdown }`. Changing the backend return shape without updating this type causes runtime crashes.
**Why it happens:** The type is manually defined (not auto-generated from Convex), so backend and frontend types can drift.
**How to avoid:** Update the `DashboardSummaryByPeriod` type FIRST, then update the backend query, then update all consumers (OverviewTab ChannelSummary).
**Warning signs:** TypeScript errors in OverviewTab about `channels.k3mart` not existing.

### Pitfall 2: Shopee/Tokopedia Source Values
**What goes wrong:** BigSeller records in `externalRevenue` use `source: "shopee"` or `source: "tiktok"` (from Phase 28 revenue bridge). The display names in `sourceToPlatform()` must map `"tiktok"` to `"Tokopedia"` (TikTok = Tokopedia for Indonesian e-commerce; same marketplace).
**Why it happens:** BigSeller's API returns `platform: "shopee"` and `platform: "tiktok"` -- the `tiktok` source maps to `Tokopedia` in Frollie's context.
**How to avoid:** Verify `sourceToPlatform()` maps correctly: `shopee → "Shopee"`, `tiktok → "Tokopedia"`. The existing `PlatformBadge` component already handles both.
**Warning signs:** Chart legend showing "tiktok" instead of "Tokopedia".

### Pitfall 3: GoBiz vs GoFood Display Name
**What goes wrong:** The backend source is `"gobiz"` but the display name in charts is `"GoFood"` (GoBiz is the merchant app; GoFood is the consumer-facing brand for food orders).
**Why it happens:** Current `sourceToPlatform("gobiz")` correctly returns `"GoFood"`. Must not regress.
**How to avoid:** Keep the existing mapping. The CONTEXT.md refers to "GoFood x 3" (3 GoFood outlets).
**Warning signs:** Chart legend showing "GoBiz" instead of "GoFood".

### Pitfall 4: Lifetime Totals Performance
**What goes wrong:** The `getLifetimeTotalsInternal` query scans ALL `externalRevenueItems` records. At current scale (~1K records) this is fine; at 50K+ it will time out.
**Why it happens:** No pre-aggregation table (deferred to v1.5+ per ANLY-04).
**How to avoid:** Use the on-demand action pattern (not reactive query). The hero card data loads once on page mount and doesn't re-fetch on period changes (it's always "all time"). Include a note in code comments about ANLY-04 scaling.
**Warning signs:** Slow load times or Convex function timeouts when externalRevenueItems grows large.

### Pitfall 5: Consignment Data Not Yet Available
**What goes wrong:** Phase 29 (consignment settlements) hasn't been implemented yet. There are no `externalRevenue` records with `source: "consignment"` in the database.
**Why it happens:** Phase 30 depends on Phase 29.
**How to avoid:** The dynamic discovery approach handles this gracefully -- if no consignment data exists, the "Consignment" segment simply won't appear. No hardcoding required. But verify the code handles the case where consignment data starts appearing after deployment.
**Warning signs:** Hard-crashes when no consignment data exists (should be impossible with dynamic discovery).

### Pitfall 6: Chart Color Collisions
**What goes wrong:** With 6+ channels, colors become visually indistinguishable, especially greens (GoFood teal, GrabFood green).
**Why it happens:** Both GoFood and GrabFood are food delivery platforms with green branding.
**How to avoid:** Assign deliberately distinct colors. Recommended palette:
- GoFood: `#14b8a6` (teal-500, existing)
- K3 Mart: `#3b82f6` (blue-500, existing)
- Direct: `#f59e0b` (amber-500, existing)
- GrabFood: `#22c55e` (green-500, distinct from teal)
- Shopee: `#f97316` (orange-500, Shopee brand)
- Tokopedia: `#10b981` (emerald-500) -- or `#8b5cf6` (violet-500) to avoid green collision
- Consignment: `#a855f7` (purple-500)

**Recommendation:** Use violet for Tokopedia instead of emerald to avoid 3 greens: `#14b8a6` (teal/GoFood), `#22c55e` (green/GrabFood), `#8b5cf6` (violet/Tokopedia).

### Pitfall 7: ChannelSummary Grid Responsiveness
**What goes wrong:** The current `ChannelSummary` uses `grid-cols-2 lg:grid-cols-4`. With 6+ channels + "All", that's 7+ segments. The grid won't fit 4 columns cleanly.
**Why it happens:** Current design assumes exactly 4 segments.
**How to avoid:** Use flexible grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`. The "All Channels" card stays full-width or first in the grid. Individual channel cards wrap naturally.
**Warning signs:** Channels getting clipped or overflowing on smaller screens.

## Code Examples

### Example 1: Extending sourceToPlatform()
```typescript
// Current (convex/externalData/queries.ts line 1458):
function sourceToPlatform(source: string): string {
  switch (source) {
    case "gobiz": return "GoFood";
    case "k3mart": return "K3 Mart";
    case "internal": return "Direct";
    default: return source;
  }
}

// Updated:
function sourceToPlatform(source: string): string {
  switch (source) {
    case "gobiz": return "GoFood";
    case "k3mart": return "K3 Mart";
    case "internal": return "Direct";
    case "grabfood": return "GrabFood";
    case "shopee": return "Shopee";
    case "tiktok": return "Tokopedia";
    case "consignment": return "Consignment";
    default: return source;
  }
}
```

### Example 2: Dynamic Channel Discovery in getRevenueTimeSeries
```typescript
// Replace hardcoded platforms with dynamic discovery:
// 1. Collect all unique sources from fetched records
const discoveredSources = [...new Set(records.map(r => r.source))];

// 2. Initialize buckets with all discovered sources
for (const record of records) {
  const ts = record.transactionDate ?? record.periodStart;
  const key = bucketKey(ts);
  if (!buckets.has(key)) {
    const init: Record<string, number> = {};
    for (const src of discoveredSources) init[src] = 0;
    buckets.set(key, init);
  }
  // ... accumulate values
}

// 3. Build series only for sources with non-zero totals
const series = discoveredSources
  .map(src => ({
    platform: sourceToPlatform(src),
    platformKey: src,
    data: sortedKeys.map(key => Math.round((buckets.get(key)?.[src] ?? 0) * 100) / 100),
  }))
  .filter(s => s.data.some(v => v !== 0)); // Hide channels with zero data
```

### Example 3: Dynamic Channel Breakdown in getDashboardSummaryByPeriodInternal
```typescript
// Replace fixed channels object with dynamic array:
// Group records by source
const bySource = new Map<string, typeof records>();
for (const record of records) {
  const existing = bySource.get(record.source) ?? [];
  existing.push(record);
  bySource.set(record.source, existing);
}

// Build dynamic channels array
const channels: Array<{ source: string; displayName: string; gross: number; net: number; transactions: number }> = [];
for (const [source, sourceRecords] of bySource) {
  const agg = aggregatePlatformChannel(sourceRecords);
  if (agg.gross > 0 || agg.txns > 0) { // Only include channels with data
    channels.push({
      source,
      displayName: sourceToPlatform(source),
      gross: agg.gross,
      net: agg.net,
      transactions: agg.txns,
    });
  }
}

// Return channels as array (not fixed object)
return {
  // ... totals stay the same
  channels, // NEW: dynamic array replaces { k3mart, gobiz, internal }
};
```

### Example 4: PLATFORM_COLORS Extension (SalesChart.tsx)
```typescript
const PLATFORM_COLORS: Record<string, string> = {
  GoFood: "#14b8a6",      // teal-500 (existing)
  "K3 Mart": "#3b82f6",   // blue-500 (existing)
  Direct: "#f59e0b",      // amber-500 (existing)
  GrabFood: "#22c55e",    // green-500
  Shopee: "#f97316",      // orange-500
  Tokopedia: "#8b5cf6",   // violet-500
  Consignment: "#a855f7", // purple-500
};
// Note: key is display name (from sourceToPlatform), not source key
```

### Example 5: Lifetime Totals Query Structure
```typescript
export const getLifetimeTotalsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Scan all revenue items (acceptable at current scale)
    const items = await ctx.db.query("externalRevenueItems").collect();

    // Aggregate by linkedMenuProductId and source
    const productMap = new Map<string, {
      menuProductId: string | undefined;
      productName: string;
      totalUnits: number;
      totalRevenue: number;
      bySource: Record<string, number>;
    }>();

    for (const item of items) {
      const key = item.linkedMenuProductId ?? `unmapped:${item.productName}`;
      const existing = productMap.get(key);
      if (existing) {
        existing.totalUnits += item.quantity;
        existing.totalRevenue += item.totalPrice;
        existing.bySource[item.source] = (existing.bySource[item.source] ?? 0) + item.quantity;
      } else {
        productMap.set(key, {
          menuProductId: item.linkedMenuProductId,
          productName: item.productName,
          totalUnits: item.quantity,
          totalRevenue: item.totalPrice,
          bySource: { [item.source]: item.quantity },
        });
      }
    }

    // Also count from externalRevenue where no items exist (some records have quantitySold but no items)
    const revenues = await ctx.db.query("externalRevenue").collect();
    let lifetimeRevenue = 0;
    let lifetimeTransactions = 0;
    for (const rev of revenues) {
      lifetimeRevenue += rev.revenueGross ?? 0;
      lifetimeTransactions += rev.transactionCount ?? 1;
    }

    const products = Array.from(productMap.values())
      .sort((a, b) => b.totalUnits - a.totalUnits);

    const totalUnits = products.reduce((sum, p) => sum + p.totalUnits, 0);

    return {
      totalUnits,
      lifetimeRevenue,
      lifetimeTransactions,
      products,
    };
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3 hardcoded platforms (gobiz, k3mart, internal) | 8 sources in externalSource validator | Phase 26/28 (Feb 2026) | Backend already stores data for all sources; frontend still hardcoded |
| Reactive useQuery for analytics | On-demand action fetch (internalQuery + action) | Phase 20 (Feb 2026) | ~200MB bandwidth savings; MUST use for new analytical queries |
| Fixed PlatformFilter radio buttons | Legend-as-filter (Recharts Legend onClick) | Phase 14 (partial) | SalesChart already has hiddenPlatforms toggle; OverviewTab still has old radio buttons |
| Consignment as separate domain | Consignment as externalRevenue source | Phase 29 (pending) | Revenue bridge creates externalRevenue with source="consignment" |

**Deprecated/outdated:**
- `PlatformFilter` type (`"all" | "k3mart" | "gobiz" | "internal"`) in OverviewTab.tsx -- remove or deprecate; legend-as-filter replaces the radio-button filter in the Revenue Table section
- Fixed `channels: { k3mart, gobiz, internal }` shape in backend return type -- replace with dynamic array

## Open Questions

1. **Revenue Table platform filter**
   - What we know: The Revenue Table at the bottom of OverviewTab has radio-button platform filters (All / K3 Mart / GoBiz / Local). The CONTEXT.md says legend-as-filter replaces the channel filter.
   - What's unclear: Does the Revenue Table's radio-button filter also get replaced, or does only the chart legend serve as the filter?
   - Recommendation: Keep the Revenue Table's platform filter but expand it to include all channels. The chart legend filters the chart; the Revenue Table filter filters the detail table. They're separate concerns. If the user wants them unified, that's a follow-up.

2. **"GoFood x 3" in chart**
   - What we know: CONTEXT.md mentions "GoFood x 3" implying 3 GoFood outlets. The `externalRevenue` records for GoFood have `source: "gobiz"` regardless of outlet.
   - What's unclear: Should GoFood outlets appear as separate segments (GoFood Crystal, GoFood Tamtem, GoFood Goldfinch) or as one "GoFood" segment?
   - Recommendation: One "GoFood" segment in the chart (consistent with how K3Mart shows as one segment despite multiple outlets). Per-outlet breakdown available in `PlatformHierarchy` drill-down, which already works.

3. **BigSeller COGS caveat data source**
   - What we know: `bigsellerOrders.getOrderStats` has `allCostFeeZero` flag. The caveat should show when BigSeller data is visible and all costFee=0.
   - What's unclear: Should the caveat check be in the dashboard summary query (backend) or in the frontend using the existing `useBigSellerOrderStats` hook?
   - Recommendation: Frontend approach -- call `useBigSellerOrderStats` in OverviewTab, check `allCostFeeZero`, and display an inline banner when Shopee/Tokopedia channels have data. Avoids adding BigSeller-specific logic to the unified analytics backend.

## Specific Implementation Notes

### Backend Changes Required (convex/externalData/queries.ts)

1. **`sourceToPlatform()`** (line 1458): Add grabfood, shopee, tiktok, consignment mappings
2. **`getRevenueTimeSeries`** (line 1467): Replace hardcoded `platforms` array with dynamic source discovery from records; filter out zero-total series
3. **`getDashboardSummaryByPeriodInternal`** (line 457): Change `channels` return from `{ k3mart, gobiz, internal }` to `Array<{ source, displayName, gross, net, transactions }>`; dynamically aggregate by source
4. **`getRevenueByOutletInternal`** (line 1594): Already dynamic -- just needs `sourceToPlatform()` update and sort order update (currently hardcoded `["gobiz", "k3mart", "internal"]`)
5. **NEW `getLifetimeTotalsInternal`**: Full scan of externalRevenueItems + externalRevenue for lifetime aggregation

### Backend Changes Required (convex/externalData/actions.ts)

6. **NEW `fetchLifetimeTotals`**: Action wrapper for `getLifetimeTotalsInternal`

### Frontend Changes Required

7. **`useExternalData.ts`**: Update `DashboardSummaryByPeriod` type (channels becomes array), add `useLifetimeTotals` hook, update `ChannelBreakdown` type
8. **`SalesChart.tsx`**: Expand `PLATFORM_COLORS` to 7+ entries; the chart already handles dynamic platforms from the series data
9. **`OverviewTab.tsx`**:
   - Add `LifetimeHero` component (hero card with total units + revenue + expandable product table)
   - Refactor `ChannelSummary` from fixed 4-segment grid to dynamic grid
   - Update `PlatformHierarchy` color mapping for new sources
   - Add BigSeller COGS caveat banner
   - Potentially expand Revenue Table platform filter (or unify with legend)
10. **`SalesAnalytics.tsx`**: Update page description from "Track revenue across K3 Mart, GoBiz, and Internal Orders" to something inclusive of all channels

### Internal Order Discount Correction

The existing `getDashboardSummaryByPeriodInternal` has special handling for internal orders: it looks up the actual `orders` table to get pre-discount `totalAmount` and post-discount `finalTotal`. This logic must be preserved in the dynamic refactoring. Similarly, `getRevenueTimeSeries` has the same internal order lookup. Both must continue working.

### BigSeller COGS Caveat Implementation

The `bigsellerOrders.getOrderStats` query already returns `allCostFeeZero`. The frontend already has `useBigSellerOrderStats` hook. The caveat should be a subtle banner (recommendation: info-style alert card) shown in the channel breakdown area when:
1. Shopee or Tokopedia channels have data in the period, AND
2. `allCostFeeZero` is true from BigSeller stats

Suggested text: "BigSeller profit margins not available -- COGS not configured in BigSeller."

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `convex/externalData/queries.ts` -- current backend query implementations, line-by-line
- Codebase analysis: `src/components/salesAnalytics/OverviewTab.tsx` -- current frontend component structure
- Codebase analysis: `src/components/salesAnalytics/SalesChart.tsx` -- current chart implementation with legend-as-filter
- Codebase analysis: `convex/schema.ts` -- externalSource validator (8 values), externalRevenue schema, externalRevenueItems schema
- Codebase analysis: `src/hooks/convex/useExternalData.ts` -- current hook types and on-demand fetch pattern
- Codebase analysis: `.planning/phases/29-consignment-settlements/29-01-PLAN.md` -- consignment revenue bridge design

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` Phase 30 section -- implementation notes and success criteria
- `.planning/phases/30-unified-sales-analytics/30-CONTEXT.md` -- user decisions and constraints

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries; all existing Recharts + Convex patterns
- Architecture: HIGH -- extending existing queries and components; patterns well-established by Phases 26-28
- Pitfalls: HIGH -- identified from direct codebase analysis of hardcoded assumptions

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable -- no external API changes; internal refactoring only)
