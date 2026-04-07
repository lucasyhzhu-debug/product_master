# Quick Task 260407-p1w: Add Pieces Sold Metric - Research

**Researched:** 2026-04-07
**Domain:** Convex backend aggregation + React sales analytics UI
**Confidence:** HIGH

## Summary

Adding a "Pieces Sold" hero card requires extending the period-based dashboard summary (`getDashboardSummaryByPeriodInternal`) to fetch `externalRevenueItems` for the period's revenue records, resolve BOM ball counts via `menuProductComponents` + `componentTypes`, and return a `totalPiecesSold` field. The existing `computeLifetimeTotals` in `lifetimeHelpers.ts` contains the exact BOM resolution logic needed -- it can be extracted into a reusable piece-counting function, or the same pattern can be inlined into a new period-scoped helper.

The key architectural decision: items are fetched per-revenue-record using the `by_revenue` index (established pattern in the codebase, see queries.ts:718-725). BOM reference data (`menuProductComponents` + `componentTypes`) are small tables that can be fetched once and reused across both current and previous period calculations.

**Primary recommendation:** Add a `computePeriodPiecesSold` helper function in `lifetimeHelpers.ts` that takes period-scoped items + BOM data, reusing the same BOM resolution logic as `computeLifetimeTotals`. Call it from `getDashboardSummaryByPeriodInternal` after fetching items for each period's revenue records.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Implementation Decisions
- Direct BOM count from externalRevenueItems linked to period externalRevenue records
- Join with menuProductComponents + componentTypes (category="production") to resolve ball counts per product
- For items without linkedMenuProductId, use estimation (period revenue portion / avgRevenuePerBall) as fallback
- This mirrors the lifetime computeLifetimeTotals() approach but scoped to a date range
- Add "Pieces Sold" as a new period-filtered hero card in the TOP section (alongside Gross Sales, Net Sales, etc.)
- Keep the existing lifetime "Balls Sold" card unchanged in the bottom lifetime section
- Position after Delivery Fees, before lifetime section
- Show period-over-period growth comparison (GrowthIndicator component) like Gross Sales and Net Sales cards
- Label: "Pieces Sold" with count breakdown or period label subtitle

### Specific Ideas
- Reuse computeLifetimeTotals logic from lifetimeHelpers.ts but parameterized for period filtering
- Add totalPiecesSold to PeriodData type and getDashboardSummaryByPeriodInternal query
- Use CircleDot icon (same as lifetime Balls Sold) for visual consistency
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Branch-per-phase rule: feature branch required, never commit to main
- `npm run build` must pass before merge
- Update `docs/CHANGELOG.md` after merge
- All Convex data uses typed `Id<"tableName">`, camelCase fields
- Protected mutations require `token: v.string()` arg (not applicable here -- queries only)
- BOM resolution: always use `menuProductComponents` + `componentTypes` (category="production"), never deprecated `productionType`/`productionUnits` fields

## Architecture Patterns

### Data Flow for Period Pieces Sold

```
getDashboardSummaryByPeriodInternal
  |
  +-- Fetch currentRevenue / previousRevenue (already done, by_period index)
  |
  +-- NEW: Fetch externalRevenueItems for each revenue record (by_revenue index)
  +-- NEW: Fetch menuProductComponents + componentTypes (once, shared)
  |
  +-- NEW: computePeriodPiecesSold(items, revenues, bomComponents, componentTypes)
  |       Returns { totalPiecesSold: number }
  |
  +-- Spread into currentPeriod / previousPeriod return objects
```

### Key Files to Modify

| File | Change |
|------|--------|
| `convex/externalData/helpers/lifetimeHelpers.ts` | Extract BOM resolution into reusable helper; add `computePeriodPiecesSold` |
| `convex/externalData/queries.ts` | Fetch items + BOM in `getDashboardSummaryByPeriodInternal`, add `totalPiecesSold` to return |
| `src/components/salesAnalytics/overviewUtils.ts` | Add `totalPiecesSold` to `PeriodData` type |
| `src/hooks/convex/useExternalData.ts` | Add `totalPiecesSold` to `PeriodSummary` type |
| `src/components/salesAnalytics/HeroCards.tsx` | Add "Pieces Sold" card after Delivery Fees |

### Efficient Item Fetching Strategy [VERIFIED: codebase pattern]

The codebase already uses `Promise.all` with `by_revenue` index lookups to fetch items per revenue record (see `queries.ts:718-725`). This is the established pattern:

```typescript
// Fetch items for all period revenue records in parallel
const allItems = await Promise.all(
  periodRevenue.map((r) =>
    ctx.db.query("externalRevenueItems")
      .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
      .collect()
  )
);
const flatItems = allItems.flat();
```

This uses the `by_revenue` index on `externalRevenueItems` -- exact equality lookups, very efficient. [VERIFIED: schema.ts line 1145]

### BOM Reference Data

`menuProductComponents` and `componentTypes` are small reference tables (product catalog size, not transaction volume). Fetching them once with `.collect()` is the same pattern used by `getLifetimeTotalsInternal` (queries.ts:1371-1376). These can be fetched once and passed to both current and previous period calculations.

### Reusable BOM Resolution Logic

`computeLifetimeTotals` in `lifetimeHelpers.ts` does three things:
1. Builds `productionComponentIds` set from `componentTypes` where `category === "production"`
2. Builds `menuProductBallCount` map: `menuProductId -> total ball count` from BOM
3. Iterates items, counting `quantity * ballsPerProduct` for linked items, then estimates unlinked via `avgRevenuePerBall`

Steps 1-2 are pure BOM resolution (reusable). Step 3 mixes ball counting with revenue aggregation. The recommended approach is to extract a `computePiecesSold` function that takes items + BOM data and returns pieces count, using the same estimation fallback for unlinked items.

```typescript
// New helper: extract from computeLifetimeTotals
export function computePiecesSold(
  items: Doc<"externalRevenueItems">[],
  periodGrossRevenue: number,
  bomComponents: Doc<"menuProductComponents">[],
  componentTypes: Doc<"componentTypes">[]
): number {
  // Build BOM maps (same as lines 34-49 of lifetimeHelpers.ts)
  const productionComponentIds = new Set(
    componentTypes.filter(ct => ct.category === "production").map(ct => ct._id as string)
  );
  const menuProductBallCount = new Map<string, number>();
  for (const comp of bomComponents) {
    if (productionComponentIds.has(comp.componentTypeId as string)) {
      const existing = menuProductBallCount.get(comp.menuProductId as string) ?? 0;
      menuProductBallCount.set(comp.menuProductId as string, existing + comp.quantity);
    }
  }

  // Count known balls + compute avgRevenuePerBall
  let knownRevenue = 0;
  let knownBalls = 0;
  for (const item of items) {
    if (!item.linkedMenuProductId) continue;
    const ballsPerProduct = menuProductBallCount.get(item.linkedMenuProductId as string);
    if (!ballsPerProduct || ballsPerProduct <= 0) continue;
    knownRevenue += item.totalPrice;
    knownBalls += item.quantity * ballsPerProduct;
  }

  const avgRevenuePerBall = knownBalls > 0
    ? knownRevenue / knownBalls
    : 35_000; // FALLBACK_REVENUE_PER_BALL

  return periodGrossRevenue > 0
    ? Math.round(periodGrossRevenue / avgRevenuePerBall)
    : 0;
}
```

Then refactor `computeLifetimeTotals` to call `computePiecesSold` internally, keeping backward compatibility.

## Performance Impact

### Current getDashboardSummaryByPeriodInternal cost
- 2 index scans on `externalRevenue` (current + previous period) -- already done
- N parallel order lookups for internal records -- already done

### Additional cost for pieces
- N + M parallel `by_revenue` index lookups (N = current period revenue count, M = previous period revenue count)
- 2 small table scans (`menuProductComponents`, `componentTypes`) -- negligible, catalog-sized
- Each `by_revenue` lookup is an exact-match index scan returning ~1-10 items per revenue record

### Expected scale
- "Last 7 Days" period: ~7-30 revenue records per source, maybe 50-100 total
- "Last 30 Days": ~100-400 revenue records total
- "All Time": could be 1000+ records -- but the `allTime` preset already fetches all revenue records anyway

### Risk assessment: LOW
The `Promise.all` pattern with `by_revenue` index is the same used elsewhere in the codebase (queries.ts:718-725) for similar fan-out queries. Convex handles parallel index lookups efficiently. The BOM tables are fetched once and shared.

**Optimization note:** The BOM table fetches (`menuProductComponents`, `componentTypes`) can run in parallel with the existing `fetchInternalOrderDataMap` calls using `Promise.all`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| BOM ball resolution | Custom ball counting per product | `computePiecesSold` helper (extracted from `computeLifetimeTotals`) |
| Period-over-period growth | Custom percentage calculation | Existing `GrowthIndicator` component |
| Number formatting | Custom locale formatting | `toLocaleString()` (same as lifetime Balls Sold card) |

## Common Pitfalls

### Pitfall 1: Double-counting balls for estimation fallback
**What goes wrong:** Using `totalGross` from the already-aggregated `aggregatePeriodRevenue` result includes platform gross + internal gross, but the `avgRevenuePerBall` is computed from item-level `totalPrice` which may not align.
**How to avoid:** Compute `periodGrossRevenue` from the same revenue records array used to fetch items (sum of `revenueGross`), not from the aggregated result.

### Pitfall 2: Forgetting to update both type definitions
**What goes wrong:** Adding `totalPiecesSold` to the backend return but not to `PeriodData` (overviewUtils.ts) AND `PeriodSummary` (useExternalData.ts) causes TypeScript errors or silent `undefined`.
**How to avoid:** Update all three: backend return, `PeriodSummary` in hooks, `PeriodData` in overviewUtils.

### Pitfall 3: Action wrapper doesn't need changing
**What goes wrong:** Trying to modify `fetchDashboardSummaryByPeriod` action -- it already passes through the full result with `Promise<unknown>`.
**How to avoid:** The action returns `unknown` and the hook casts to `DashboardSummaryByPeriod`. Only the types need updating, not the action itself. But the `DashboardSummaryByPeriod` type in `useExternalData.ts` line 31-35 MUST be updated to include `totalPiecesSold` in `PeriodSummary`.

### Pitfall 4: Convex query reads limit
**What goes wrong:** In extreme cases (allTime with thousands of records), the parallel item fetches could hit Convex query bandwidth limits.
**How to avoid:** For this use case, the lifetime "Balls Sold" card already exists for all-time data. Period queries are bounded by date range. The `allTime` preset will have the most records but this is acceptable since it already fetches all revenue records anyway. Monitor if needed.

## Code Examples

### Backend: fetchPeriodItems helper (to add in queries.ts)
```typescript
async function fetchPeriodItems(
  ctx: QueryCtx,
  revenueRecords: Doc<"externalRevenue">[]
): Promise<Doc<"externalRevenueItems">[]> {
  if (revenueRecords.length === 0) return [];
  const batches = await Promise.all(
    revenueRecords.map((r) =>
      ctx.db.query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
        .collect()
    )
  );
  return batches.flat();
}
```

### Frontend: Pieces Sold card (insert after Delivery Fees card in HeroCards.tsx)
```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Pieces Sold</CardTitle>
    <CircleDot className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="flex items-baseline gap-2">
      <div className="text-2xl font-bold">
        {currentPeriod.totalPiecesSold?.toLocaleString() ?? 0}
      </div>
      <GrowthIndicator
        current={currentPeriod.totalPiecesSold ?? 0}
        previous={previousPeriod.totalPiecesSold ?? 0}
      />
    </div>
    <p className="text-xs text-muted-foreground">
      {currentPeriod.periodLabel} {currentPeriod.comparisonLabel}
    </p>
  </CardContent>
</Card>
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --run convex/externalData/__tests__/dashboardHelpers.test.ts` |

### Phase Requirements -> Test Map
| Req | Behavior | Test Type | Automated Command |
|-----|----------|-----------|-------------------|
| P1 | computePiecesSold resolves BOM correctly | unit | `npm run test -- --run convex/externalData/__tests__/lifetimeHelpers.test.ts` |
| P2 | Estimation fallback for unlinked items | unit | Same as P1 |
| P3 | Zero revenue returns 0 pieces | unit | Same as P1 |

### Wave 0 Gaps
- [ ] Add tests for `computePiecesSold` in existing `lifetimeHelpers.test.ts` (or create if missing)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Period revenue record count stays under ~400 for 30-day queries | Performance Impact | Promise.all fan-out could be slow if thousands of records exist per period |
| A2 | `menuProductComponents` + `componentTypes` tables are small enough to `.collect()` | Architecture | Would need pagination if catalog grows very large -- unlikely for FMCG business |

## Open Questions

None -- the implementation path is clear from the codebase patterns.

## Sources

### Primary (HIGH confidence)
- `convex/externalData/helpers/lifetimeHelpers.ts` -- BOM resolution logic (lines 23-87)
- `convex/externalData/helpers/dashboardHelpers.ts` -- aggregatePeriodRevenue (lines 15-141)
- `convex/externalData/queries.ts` -- getDashboardSummaryByPeriodInternal (lines 501-591), item fetch pattern (lines 718-725)
- `convex/schema.ts` -- externalRevenueItems schema + indexes (lines 1128-1148)
- `src/components/salesAnalytics/HeroCards.tsx` -- current card layout
- `src/components/salesAnalytics/overviewUtils.ts` -- PeriodData type
- `src/hooks/convex/useExternalData.ts` -- hook types and DashboardSummaryByPeriod shape

## Metadata

**Confidence breakdown:**
- Architecture: HIGH -- follows established codebase patterns exactly
- Performance: HIGH -- same fan-out pattern used elsewhere, bounded by date range
- UI: HIGH -- exact same card pattern as existing hero cards

**Research date:** 2026-04-07
**Valid until:** 2026-05-07
