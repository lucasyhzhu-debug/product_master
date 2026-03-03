# Sales & Analytics Simplification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce duplication and split giant files in the sales/analytics stack without changing any Convex API paths, schema, or runtime behavior.

**Architecture:** Extract duplicated logic (confidence, WIB timezone, sourceToPlatform) into shared modules, then extract heavy aggregation code from 1800+ LOC query files into pure helper files. Split the 1273-LOC OverviewTab into focused sub-components. All existing function registrations stay in their original files — only internal helper code moves.

**Tech Stack:** Convex, React 19, TypeScript 5.9, Vite

**Design Doc:** `docs/plans/2026-03-03-sales-analytics-simplification-design.md`

---

## Git Workflow

**Branch:** `feature/simplify-sales-analytics`
**Checkpoints:** After each task

## Pre-existing Shared Modules (DO NOT recreate)

These already exist and are already imported where needed:
- `convex/lib/periodRange.ts` — `calculatePeriodRange()`, `calculateWeekRange()`, `PeriodPreset` type
- `convex/lib/costCalculator.ts` — `buildProductCOGSMap()`, `calculateMenuProductCOGS()`
- `src/lib/financialHelpers.tsx` — `WIB_OFFSET_MS`, `WEEK_MS`, `computeDelta()`, `formatWeekRange()`

---

### Task 1: Create `convex/lib/confidence.ts`

**Goal:** Extract the confidence type, ranking, and `worstConfidence()` from `incomeStatement.ts` into a shared module.

**Files:**
- Create: `convex/lib/confidence.ts`
- Modify: `convex/reports/incomeStatement.ts` (lines 24, 119-129)

**Step 1: Create the shared confidence module**

Create `convex/lib/confidence.ts`:
```typescript
/**
 * Shared confidence classification for revenue and COGS data quality.
 * Used by income statement, dashboard summary, and analytics queries.
 */

export type Confidence = "exact" | "calculated" | "inferred" | "missing";

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  exact: 0,
  calculated: 1,
  inferred: 2,
  missing: 3,
};

/** Returns the worse (lowest-quality) confidence of two values. */
export function worstConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}
```

**Step 2: Update incomeStatement.ts to import from shared module**

In `convex/reports/incomeStatement.ts`:
- Remove the local `type Confidence` (line 24)
- Remove `CONFIDENCE_RANK` (lines 119-124) and `worstConfidence` (lines 127-129)
- Add import: `import { type Confidence, worstConfidence } from "../lib/confidence";`

**Step 3: Run verification**

Run: `npm run type-check`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add convex/lib/confidence.ts convex/reports/incomeStatement.ts
git commit -m "refactor: extract confidence types to shared module"
```

---

### Task 2: Extract WIB timezone helpers from `externalData/queries.ts`

**Goal:** Move the 6 local WIB timezone functions (lines 745-1523) from `externalData/queries.ts` into `convex/lib/periodRange.ts`, which already owns WIB period logic.

**Files:**
- Modify: `convex/lib/periodRange.ts` (add 5 functions)
- Modify: `convex/externalData/queries.ts` (remove local functions, add imports)

**Step 1: Add WIB helper functions to `convex/lib/periodRange.ts`**

Append these functions to the end of `convex/lib/periodRange.ts` (after the existing `calculateWeekRange` function):

```typescript
// ─── WIB Date Formatting Helpers ───
// Used by time-series, revenue-by-outlet, restock, and sell-through queries.

const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

/** Get WIB date string (YYYY-MM-DD) from UTC epoch ms */
export function utcToWibDateStr(utcMs: number): string {
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().split("T")[0];
}

/** Check if a WIB-adjusted timestamp falls on a weekend (Sat=6, Sun=0) */
export function isWeekend(utcMs: number): boolean {
  const wibDate = new Date(utcMs + WIB_OFFSET_MS);
  const day = wibDate.getUTCDay();
  return day === 0 || day === 6;
}

/** Get ISO week number from WIB-adjusted date. Returns "W06" format. */
export function getIsoWeekNumber(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `W${weekNo.toString().padStart(2, "0")}`;
}

/** Get YYYY-MM from WIB-adjusted date */
export function utcToWibMonthStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const y = wib.getUTCFullYear();
  const m = (wib.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

/** Get "YYYY-MM-DD HH" from UTC epoch ms, WIB-adjusted */
export function utcToWibHourStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const date = wib.toISOString().split("T")[0];
  const hour = wib.getUTCHours().toString().padStart(2, "0");
  return `${date} ${hour}`;
}
```

**Step 2: Update `externalData/queries.ts` to import from shared module**

In `convex/externalData/queries.ts`:
- Remove the local `const WIB_OFFSET_HOURS = 7;` (line 745)
- Remove the local `function isWeekend(utcMs: number)` (lines 748-752)
- Remove the local `const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;` (line 1490)
- Remove the local `function utcToWibDateStr(utcMs: number)` (lines 1493-1495)
- Remove the local `function getIsoWeekNumber(utcMs: number)` (lines 1498-1507)
- Remove the local `function utcToWibMonthStr(utcMs: number)` (lines 1510-1515)
- Remove the local `function utcToWibHourStr(utcMs: number)` (lines 1518-1523)
- Update the existing import from `"../lib/periodRange"` to include the new functions:
  ```typescript
  import { calculatePeriodRange, utcToWibDateStr, isWeekend, getIsoWeekNumber, utcToWibMonthStr, utcToWibHourStr } from "../lib/periodRange";
  import type { PeriodPreset } from "../lib/periodRange";
  ```

**Step 3: Run verification**

Run: `npm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add convex/lib/periodRange.ts convex/externalData/queries.ts
git commit -m "refactor: consolidate WIB timezone helpers into periodRange module"
```

---

### Task 3: Extract `sourceToPlatform` to shared module

**Goal:** Move `sourceToPlatform()` from `externalData/queries.ts` to a standalone shared module, eliminating the circular-looking import from `externalData/queries` into `reports/incomeStatement`.

**Files:**
- Create: `convex/lib/externalSource.ts` — **check if it already exists and just needs `sourceToPlatform` added**
- Modify: `convex/externalData/queries.ts` — re-export from shared module for backward compat
- Modify: `convex/reports/incomeStatement.ts` — import from shared module instead of externalData

**Step 1: Check if `convex/lib/externalSource.ts` exists**

Read `convex/lib/externalSource.ts`. If it exists, add `sourceToPlatform` there. If not, create a new file.

**Step 2: Move `sourceToPlatform` to shared module**

The function currently lives at `convex/externalData/queries.ts:1526-1538`. Move it to the shared module.

```typescript
/** Map source to platform display name */
export function sourceToPlatform(source: string): string {
  switch (source) {
    case "gobiz": return "GoFood";
    case "k3mart": return "K3 Mart";
    case "internal": return "Direct";
    case "grabfood": return "GrabFood";
    case "shopee": return "Shopee";
    case "tiktok": return "Tokopedia";
    case "consignment": return "Consignment";
    case "bigseller": return "BigSeller";
    default: return source;
  }
}
```

**Step 3: Update imports**

- In `convex/externalData/queries.ts`: Keep `export { sourceToPlatform } from "../lib/externalSource";` as a re-export so any other file importing from here still works.
- In `convex/reports/incomeStatement.ts`: Change import to come from `"../lib/externalSource"` instead of `"../externalData/queries"`. Remove the `sourceToPlatform` from the externalData/queries import (keep only `fetchInternalOrderDataMap`).

**Step 4: Run verification**

Run: `npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add convex/lib/externalSource.ts convex/externalData/queries.ts convex/reports/incomeStatement.ts
git commit -m "refactor: move sourceToPlatform to shared externalSource module"
```

---

### Task 4: Extract `externalData/queries.ts` helper functions

**Goal:** Extract the heavy aggregation logic from `externalData/queries.ts` into pure helper files, slimming the main file from ~1830 LOC to ~800 LOC. All Convex function registrations stay in `queries.ts`.

**Files:**
- Create: `convex/externalData/helpers/dashboardHelpers.ts`
- Create: `convex/externalData/helpers/revenueHelpers.ts`
- Create: `convex/externalData/helpers/restockHelpers.ts`
- Create: `convex/externalData/helpers/sellThroughHelpers.ts`
- Create: `convex/externalData/helpers/timeSeriesHelpers.ts`
- Modify: `convex/externalData/queries.ts`

**Step 1: Create `convex/externalData/helpers/dashboardHelpers.ts`**

Extract the inner `aggregate()` function from `getDashboardSummaryByPeriodInternal` (lines 538-643). This is a closure that receives `ctx` — refactor it to accept its data dependencies as parameters instead:

```typescript
/**
 * Dashboard period aggregation helpers.
 * Pure functions that process pre-fetched revenue records.
 */
import type { Doc } from "../../_generated/dataModel";
import { sourceToPlatform } from "../../lib/externalSource";

/**
 * Aggregate revenue records into a period summary with per-channel breakdown.
 * Handles internal order discount correction using pre-fetched order data.
 */
export function aggregatePeriodRevenue(
  records: Doc<"externalRevenue">[],
  orderDataMap: Map<string, { totalAmount: number; finalTotal: number; deliveryFee: number }>
): {
  totalGross: number;
  totalNet: number;
  totalTransactions: number;
  totalCommission: number;
  totalAdBurn: number;
  totalPromoBurn: number;
  totalDiscounts: number;
  totalDeliveryFees: number;
  platformGross: number;
  internalGross: number;
  channels: Array<{ source: string; displayName: string; gross: number; net: number; transactions: number }>;
} {
  // Group records by source
  const bySource = new Map<string, Doc<"externalRevenue">[]>();
  for (const record of records) {
    const existing = bySource.get(record.source) ?? [];
    existing.push(record);
    bySource.set(record.source, existing);
  }

  // Per-channel platform aggregation (for non-internal sources)
  function aggregatePlatformChannel(channelRecords: Doc<"externalRevenue">[]) {
    let gross = 0, commission = 0, adBurn = 0, promoBurn = 0, txns = 0;
    for (const r of channelRecords) {
      gross      += r.revenueGross    ?? 0;
      commission += r.commission      ?? 0;
      adBurn     += r.adBurn          ?? 0;
      promoBurn  += r.promoBurn       ?? 0;
      txns       += r.transactionCount ?? 0;
    }
    const net = gross - commission - adBurn - promoBurn;
    return { gross, net, txns, commission, adBurn, promoBurn };
  }

  // Internal orders: special handling
  const internalRecords = bySource.get("internal") ?? [];
  let internalGross = 0;
  let internalNet = 0;
  let totalDiscounts = 0;
  let totalDeliveryFees = 0;
  const internalTxns = internalRecords.reduce((sum, r) => sum + (r.transactionCount ?? 0), 0);

  for (const rec of internalRecords) {
    const orderNumber = rec.externalTransactionId;
    if (!orderNumber) continue;
    const od = orderDataMap.get(orderNumber);
    if (od) {
      const netProduct = od.finalTotal - od.deliveryFee;
      internalGross += od.totalAmount;
      internalNet += netProduct;
      totalDiscounts += od.totalAmount - netProduct;
      totalDeliveryFees += od.deliveryFee;
    } else {
      internalGross += rec.revenueGross ?? 0;
      internalNet += rec.revenueGross ?? 0;
    }
  }

  // Build dynamic channels array
  const channels: Array<{ source: string; displayName: string; gross: number; net: number; transactions: number }> = [];
  let totalCommission = 0;
  let totalAdBurn = 0;
  let totalPromoBurn = 0;
  let platformGross = 0;
  let totalNet = internalNet;
  let totalTransactions = internalTxns;

  for (const [source, sourceRecords] of bySource) {
    if (source === "internal") continue;
    const agg = aggregatePlatformChannel(sourceRecords);
    totalCommission += agg.commission;
    totalAdBurn += agg.adBurn;
    totalPromoBurn += agg.promoBurn;
    platformGross += agg.gross;
    totalNet += agg.net;
    totalTransactions += agg.txns;
    if (agg.gross > 0 || agg.txns > 0) {
      channels.push({
        source,
        displayName: sourceToPlatform(source),
        gross: agg.gross,
        net: agg.net,
        transactions: agg.txns,
      });
    }
  }

  if (internalGross > 0 || internalTxns > 0) {
    channels.push({
      source: "internal",
      displayName: sourceToPlatform("internal"),
      gross: internalGross,
      net: internalNet,
      transactions: internalTxns,
    });
  }

  channels.sort((a, b) => b.gross - a.gross);

  return {
    totalGross: platformGross + internalGross,
    totalNet,
    totalTransactions,
    totalCommission,
    totalAdBurn,
    totalPromoBurn,
    totalDiscounts,
    totalDeliveryFees,
    platformGross,
    internalGross,
    channels,
  };
}
```

**Step 2: Create `convex/externalData/helpers/timeSeriesHelpers.ts`**

Extract the bucketing + label formatting logic from `getRevenueTimeSeries` (lines 1560-1592):

```typescript
/**
 * Time series bucketing and label formatting helpers.
 * Pure functions for grouping revenue records by time granularity.
 */
import { utcToWibDateStr, utcToWibHourStr, getIsoWeekNumber, utcToWibMonthStr } from "../../lib/periodRange";

type Granularity = "hourly" | "daily" | "weekly" | "monthly";

/** Get bucket key for a UTC timestamp at the given granularity (WIB-adjusted). */
export function bucketKey(utcMs: number, granularity: Granularity): string {
  switch (granularity) {
    case "hourly": return utcToWibHourStr(utcMs);
    case "daily": return utcToWibDateStr(utcMs);
    case "weekly": return getIsoWeekNumber(utcMs);
    case "monthly": return utcToWibMonthStr(utcMs);
  }
}

/** Format a bucket key into a human-readable label. */
export function formatBucketLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case "hourly": {
      const hour = parseInt(key.split(" ")[1], 10);
      const suffix = hour >= 12 ? "pm" : "am";
      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${h12}${suffix}`;
    }
    case "daily": {
      const d = new Date(key + "T00:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    case "weekly":
      return key; // "W06"
    case "monthly": {
      const d = new Date(key + "-01T00:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short" });
    }
  }
}
```

**Step 3: Update `convex/externalData/queries.ts`**

- Import `aggregatePeriodRevenue` from `./helpers/dashboardHelpers`
- Import `bucketKey`, `formatBucketLabel` from `./helpers/timeSeriesHelpers`
- Replace the inner `aggregate()` function in `getDashboardSummaryByPeriodInternal` with:
  ```typescript
  const [currentAgg, previousAgg] = await Promise.all([
    (async () => {
      const orderDataMap = await fetchInternalOrderDataMap(ctx, currentRevenue);
      return aggregatePeriodRevenue(currentRevenue, orderDataMap);
    })(),
    (async () => {
      const orderDataMap = await fetchInternalOrderDataMap(ctx, previousRevenue);
      return aggregatePeriodRevenue(previousRevenue, orderDataMap);
    })(),
  ]);
  ```
- Replace inline `bucketKey()` and `formatLabel()` in `getRevenueTimeSeries` with imports

**Step 4: Run verification**

Run: `npm run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add convex/externalData/helpers/ convex/externalData/queries.ts
git commit -m "refactor: extract dashboard and time-series helpers from externalData queries"
```

---

### Task 5: Extract OverviewTab sub-components

**Goal:** Split `src/components/salesAnalytics/OverviewTab.tsx` (1273 LOC) into focused sub-component files.

**Files:**
- Create: `src/components/salesAnalytics/HeroCards.tsx`
- Create: `src/components/salesAnalytics/ChannelBreakdown.tsx`
- Create: `src/components/salesAnalytics/RevenueDetailsTable.tsx`
- Create: `src/components/salesAnalytics/PlatformHierarchy.tsx`
- Create: `src/components/salesAnalytics/LifetimeHero.tsx`
- Modify: `src/components/salesAnalytics/OverviewTab.tsx`

**Component boundaries from the existing file:**
- `GrowthIndicator` (lines 74-101) — small shared helper
- `ConfidenceBadge` (lines 103-122) — small shared helper
- `MatchStatusBadge` (lines 124-153) — small shared helper
- `PlatformBadge` (lines 166-174) — small shared helper
- `ExpandedRevenueItems` (lines 178-246) — revenue row expansion
- `ExpandedInternalOrder` (lines 248-359) — internal order expansion
- `StoreGroupHeader` (lines 361-414) — outlet group header
- `ChannelSummary` (lines 416-570) — channel breakdown cards
- `PlatformHierarchy` (lines 571-673) — platform drill-down view
- `LifetimeHero` (lines 675-721) — lifetime stats cards
- `RevenueTable` (lines 722-906) — revenue records table
- `OverviewTab` (lines 907-1273) — main orchestrator

**Step 1: Create shared badge helpers file**

Create `src/components/salesAnalytics/badges.tsx`:
- Move `GrowthIndicator`, `ConfidenceBadge`, `MatchStatusBadge`, `PlatformBadge` (lines 74-174)
- Move `SOURCE_DISPLAY_NAMES` constant (lines 155-164)
- Move `ConfidenceLevel` and `MatchConfidence` types (lines 44-45)

**Step 2: Create `ChannelBreakdown.tsx`**

Move `ChannelSummary` component (lines 416-570) to its own file. It receives data via props — just extract with imports.

**Step 3: Create `PlatformHierarchy.tsx`**

Move `PlatformHierarchy` component (lines 571-673). This uses `useRevenueByOutlet` hook internally.

**Step 4: Create `LifetimeHero.tsx`**

Move `LifetimeHero` component (lines 675-721). This uses `useLifetimeTotals` hook internally.

**Step 5: Create `RevenueDetailsTable.tsx`**

Move `RevenueTable` component (lines 722-906) plus its dependencies `ExpandedRevenueItems` (178-246), `ExpandedInternalOrder` (248-359), and `StoreGroupHeader` (361-414). These are only used inside RevenueTable.

**Step 6: Slim `OverviewTab.tsx`**

Replace extracted code with imports. The file should contain only:
- Imports from new sub-components
- `PERIOD_PRESETS` constant and `DEFAULT_PERIOD` constant
- `OverviewTab` component (lines 907-1273) referencing extracted sub-components
- WIB helpers `utcToWibDateStr` / `wibDateStrToUtcMs` move to `financialHelpers.tsx` or stay local (they're only 4 lines each)

**Step 7: Run verification**

Run: `npm run type-check && npm run build`
Expected: Both PASS

**Step 8: Commit**

```bash
git add src/components/salesAnalytics/
git commit -m "refactor: split OverviewTab into focused sub-components"
```

---

### Task 6: Final verification and cleanup

**Goal:** Verify everything works end-to-end and update documentation.

**Step 1: Run full build**

Run: `npm run build`
Expected: PASS with no errors

**Step 2: Run existing tests**

Run: `npm run test`
Expected: All existing tests pass (684 tests, 0 failures)

**Step 3: Verify line counts**

Check that the original giant files are now under 500 LOC:
```bash
wc -l convex/externalData/queries.ts convex/k3martCockpit/queries.ts convex/reports/incomeStatement.ts src/components/salesAnalytics/OverviewTab.tsx
```

**Step 4: Update CHANGELOG**

Add entry to `docs/CHANGELOG.md`:
```markdown
### [Unreleased] — 2026-03-03

#### Refactored
- Extracted confidence types to `convex/lib/confidence.ts` (shared by income statement + dashboard)
- Consolidated WIB timezone helpers into `convex/lib/periodRange.ts`
- Moved `sourceToPlatform()` to `convex/lib/externalSource.ts`
- Extracted dashboard aggregation helpers from `externalData/queries.ts`
- Split `OverviewTab.tsx` (1273 LOC) into 5 focused sub-components
```

**Step 5: Commit**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: update changelog for sales analytics simplification"
```

---

## Documentation Updates

- [x] CHANGELOG.md (Task 6)
- [ ] No schema changes — SCHEMA.md not needed
- [ ] No API changes — API_REFERENCE.md not needed

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] All existing tests pass (684 tests)
- [ ] No Convex API path changes
- [ ] `externalData/queries.ts` under 1000 LOC (from 1832)
- [ ] `OverviewTab.tsx` under 500 LOC (from 1273)
- [ ] Zero duplicate confidence types/logic
- [ ] Zero duplicate WIB timezone functions
- [ ] `sourceToPlatform` has single source of truth
