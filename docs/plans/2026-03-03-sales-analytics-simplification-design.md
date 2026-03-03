# Sales & Analytics Simplification Design

**Date:** 2026-03-03
**Scope:** Safe refactoring of sales analytics, financials, and K3Mart cockpit code
**Approach:** Extract shared helpers + split giant files (no API, schema, or directory structure changes)

---

## Problem Statement

The sales & analytics codebase has grown organically across 5 milestones, resulting in:

1. **Duplicate logic** — BOM resolution, confidence tagging, WIB timezone handling, and period calculations are repeated across 4+ modules
2. **Giant files** — `externalData/queries.ts` (1,832 LOC), `OverviewTab.tsx` (1,273 LOC), `k3martCockpit/queries.ts` (985 LOC)
3. **Scattered concerns** — Related analytics logic spread across `externalData/`, `reports/`, `k3martCockpit/`, `channels/`, and `dashboard/`

## Constraints

- **Safe refactoring only** — no Convex API path changes, no schema changes, no directory restructuring
- **Barrel re-exports** — all existing import paths must continue working
- **Convex registration** — function definitions stay in their original files (Convex registers by file path)
- **K3Mart included** — shared helpers benefit both analytics and K3Mart cockpit

---

## Part 1: Shared Backend Helper Extractions

### 1a. `convex/lib/periodRange.ts` — WIB Period Calculations

**Deduplicates from:** `externalData/queries.ts`, `reports/incomeStatement.ts`, `k3martCockpit/helpers.ts`

Exports:
- `WIB_OFFSET_MS` constant
- `toWIB(date: number): Date` — convert UTC timestamp to WIB Date
- `fromWIB(date: Date): number` — convert WIB Date to UTC timestamp
- `getWeekStartWIB(date?: number): number` — Monday 00:00:00 WIB as UTC timestamp
- `calculatePeriodRange(preset: string): { start, end, previousStart, previousEnd }` — supports `past24h`, `thisWeek`, `thisMonth`, `allTime`, custom week-start
- `getTodayJakarta(): string` — "YYYY-MM-DD" in WIB
- `getWeekNumber(date: Date): string` — ISO "2026-W07" format

### 1b. `convex/lib/bomResolver.ts` — BOM COGS Map Building

**Deduplicates from:** `reports/incomeStatement.ts` (`buildProductCOGSMap`), `externalData/queries.ts` (`getLifetimeTotalsInternal` inline BOM), `k3martCockpit/mutations.ts` (`confirmDayPlan` nested BOM loops)

Exports:
- `buildProductCOGSMap(ctx): Promise<Map<Id<"menuProducts">, ProductCOGS>>` — preloads all active componentTypes + menuProductComponents, builds COGS map
- `resolveBOMForProduct(menuProductId, componentsMap, typesMap): { production[], packaging[], totalCostIdr }` — pure function, no ctx
- Types: `ProductCOGS`, `BOMComponent`

### 1c. `convex/lib/confidence.ts` — Confidence Types & Logic

**Deduplicates from:** `reports/incomeStatement.ts`, `externalData/queries.ts` (`getDashboardSummaryByPeriodInternal`)

Exports:
- `ConfidenceLevel` type — `"exact" | "calculated" | "inferred" | "missing"`
- `CONFIDENCE_ORDER` constant — `{ exact: 0, calculated: 1, inferred: 2, missing: 3 }`
- `worstConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel`

---

## Part 2: Backend Giant File Splits

### 2a. Split `convex/externalData/queries.ts` (1,832 LOC)

**Strategy:** Extract heavy aggregation/enrichment logic into pure helper files. Keep all Convex query function definitions in `queries.ts` to preserve `api.externalData.*` registration paths.

New files:
```
convex/externalData/
├── queries.ts                ← SLIM: ~300 LOC (function defs + DB fetch, import helpers)
├── helpers/
│   ├── revenueHelpers.ts     ~300 LOC — enrichRevenue(), buildInternalOrderDataMap()
│   ├── dashboardHelpers.ts   ~350 LOC — aggregatePeriodChannels(), computeDelta()
│   └── analyticsHelpers.ts   ~250 LOC — aggregateLifetimeTotals(), aggregateRevenueByOutlet()
```

Pattern for each query:
```typescript
// queries.ts — slim orchestrator
export const getRevenue = query({
  handler: async (ctx, args) => {
    const rawOrders = await ctx.db.query("externalRevenue")...;
    const outletMap = await buildOutletMap(ctx);
    return enrichRevenue(rawOrders, outletMap); // Pure helper
  },
});
```

### 2b. Split `convex/k3martCockpit/queries.ts` (985 LOC)

Same strategy — extract aggregation logic:
```
convex/k3martCockpit/
├── queries.ts                ← SLIM: ~200 LOC (function defs + DB fetch)
├── helpers.ts                ← EXISTING (211 LOC, pure functions — unchanged)
├── helpers/
│   ├── stockHelpers.ts       ~200 LOC — processOutletSnapshots(), buildProductSalesMap()
│   └── dispatchHelpers.ts    ~300 LOC — buildWeeklyPlanGrid(), calculateAutoSuggestions()
```

### 2c. Slim `convex/reports/incomeStatement.ts` (657 LOC)

After extracting to shared modules:
- BOM resolution → imports from `../lib/bomResolver.ts`
- Confidence logic → imports from `../lib/confidence.ts`
- Week calculations → imports from `../lib/periodRange.ts`
- Remaining: ~450 LOC (I/O orchestration + `aggregateWeek()` + `resolveItemsCOGS()`)

---

## Part 3: Shared Frontend Helper Extraction

### 3a. `src/lib/timezoneHelpers.ts`

**Deduplicates from:** `useFinancials.ts`, `OverviewTab.tsx`, `SalesChart.tsx`

Exports:
- `WIB_OFFSET_MS` constant
- `toWIBDate(timestamp: number): Date`
- `formatWIBDate(timestamp: number, format: string): string`
- `getWeekStartWIB(date?: Date): Date`
- `getWeekLabel(weekStart: Date): string` — "Week of Feb 24 - Mar 2, 2026"

---

## Part 4: Frontend Giant File Split

### 4a. Split `src/components/salesAnalytics/OverviewTab.tsx` (1,273 LOC)

Extract self-contained sections into focused components:

```
src/components/salesAnalytics/
├── OverviewTab.tsx               ← SLIM orchestrator (~150 LOC)
├── HeroCards.tsx                 ~200 LOC — period summary cards (gross, net, etc.)
├── ChannelBreakdownTable.tsx     ~250 LOC — channel revenue rows with platform colors
├── InternalOrdersPanel.tsx       ~300 LOC — internal orders expansion + detail lookup
├── RevenueTable.tsx              ~250 LOC — paginated revenue records table
```

OverviewTab becomes:
```tsx
export function OverviewTab() {
  const { data, load } = useDashboardSalesSummaryByPeriod(preset);
  return (
    <>
      <PeriodSelector value={preset} onChange={setPreset} />
      <HeroCards current={data?.currentPeriod} previous={data?.previousPeriod} />
      <ChannelBreakdownTable channels={data?.platforms} />
      <InternalOrdersPanel />
      <RevenueTable source={selectedSource} />
    </>
  );
}
```

Each extracted component receives data via props — no hook duplication.

---

## Impact Summary

| Category | New Files | Modified Files | Net LOC Change |
|----------|-----------|---------------|----------------|
| Shared backend helpers | 3 | 4 | ~-200 (dedup) |
| Backend query splits | 5 | 2 | ~-100 (dedup) |
| Shared frontend helpers | 1 | 3 | ~-50 (dedup) |
| Frontend component splits | 4 | 1 | ~0 (split only) |
| **Total** | **13** | **10** | **~-350 LOC** |

## What Stays Unchanged

- All Convex API paths (`api.externalData.*`, `api.reports.*`, `api.k3martCockpit.*`)
- All frontend hook import paths (barrel export from `hooks/convex/index.ts`)
- Schema (59 tables)
- All mutations and actions
- All existing tests

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] No Convex API path changes (frontend calls unchanged)
- [ ] Every file under 500 LOC
- [ ] Zero duplicate BOM resolution logic
- [ ] Zero duplicate confidence tagging logic
- [ ] Zero duplicate WIB timezone calculation logic
- [ ] K3Mart cockpit functions without regression

## Risk Mitigations

1. **Convex registration safety:** All query/mutation function definitions stay in original files — only helper logic is extracted
2. **Barrel re-exports:** If any existing import paths would break, add re-exports from original locations
3. **Incremental approach:** Each extraction wave is independently verifiable (`npm run build` between waves)
4. **No runtime behavior change:** All extractions are pure refactoring — same inputs produce same outputs
