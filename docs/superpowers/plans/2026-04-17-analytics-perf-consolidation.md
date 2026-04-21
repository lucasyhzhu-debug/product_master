# Analytics Dashboard Perf & Chart Primitives Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the reactive fan-out on `/analytics` (11 Convex subscriptions → 3), add shared chart primitives that enforce WCAG AA contrast + non-clipping axis labels across all widgets, and adopt `@nivo/heatmap` lazy-loaded behind the route to replace hand-rolled heatmaps.

**Architecture:** Three grouped snapshot queries (`kpiAndChannelSnapshot`, `timeSeriesSnapshot`, `skuSnapshot`) in `convex/reports/unitEconomics.ts`, each calling a single `loadFilteredData` + `precomputeBomMaps` pass. Existing 11 queries preserved as thin wrappers for zero-downtime migration. Frontend hooks rewritten as snapshot + field-selector pattern in `src/hooks/convex/useAnalytics.ts`. Shared primitives in new `src/lib/chartPrimitives.tsx` absorb axis/tooltip/frame boilerplate and enforce readability rules centrally. Nivo for heatmaps only; Recharts retained for all other charts.

**Tech Stack:** Convex 1.31.7 + React 19 + TypeScript + Vite + Vitest + convex-test + Recharts 3.7 + `@nivo/core` + `@nivo/heatmap` (new)

**Spec:** `docs/superpowers/specs/2026-04-17-analytics-perf-consolidation-design.md`

**Branch:** `gsd/phase-80.1-analytics-perf-consolidation` — branch from `main` after `main` contains Phase 74.

---

## Git Workflow

**Branch:** `gsd/phase-80.1-analytics-perf-consolidation`
**Checkpoints:**
- After Wave A (backend queries + hoisted loader)
- After Wave B (frontend primitives + widget migration)
- After Wave C (Nivo + lazy-load + wrapper delete)

## Implementation Waves

### Wave A — Backend (tasks 1–9)
Refactor `convex/reports/unitEconomics.ts` into reducers + snapshots + thin wrappers. All existing tests keep passing throughout.

### Wave B — Frontend primitives + hooks + widget migration (tasks 10–18)
Build shared `ChartFrame`/`ChartAxis`/`ChartTooltip` primitives. Rewrite `useAnalytics.ts`. Migrate 8 chart widgets to primitives (contrast + no-clip labels land here).

### Wave C — Nivo + lazy-load + wrapper cleanup (tasks 19–24)
Install Nivo, migrate 2 heatmaps, add `React.lazy` for `/analytics`, delete the 11 deprecated wrapper queries, update docs.

## Documentation Updates
- [ ] `docs/CHANGELOG.md` (always)
- [ ] `docs/API_REFERENCE.md` (new snapshot queries, wrapper removals)
- [ ] `docs/ROADMAP.md` (mark 80.1 complete)

## Success Criteria
See spec §"Success Criteria". Bundle-cap, tooltip-contrast, label-recovery, call-count regression all enforced by tests in this plan.

---

## File Structure

### Backend (Convex)

| Action | File | Responsibility |
|---|---|---|
| Modify | `convex/reports/unitEconomics.ts` | Split ~1000 LOC file: extract pure reducers, add `precomputeBomMaps`, add 3 snapshot queries, convert existing 11 queries to thin wrappers |
| Create | `convex/reports/reducers.ts` | Pure reducer functions (one per widget), no ctx access, fully unit-testable |

### Frontend

| Action | File | Responsibility |
|---|---|---|
| Create | `src/lib/chartPrimitives.tsx` | `<ChartFrame>`, `<ChartAxis>`, `<ChartTooltip>`, `truncateWithTooltip`, `formatCurrencyCompact` |
| Modify | `src/hooks/convex/useAnalytics.ts` | 11 hooks → 3 snapshot hooks + field-selector wrappers |
| Modify | `src/components/analytics/AovByChannel.tsx` | Swap to shared primitives |
| Modify | `src/components/analytics/RevPerUnitChart.tsx` | Swap to shared primitives |
| Modify | `src/components/analytics/RollingTrendChart.tsx` | Swap to shared primitives |
| Modify | `src/components/analytics/SkuParetoChart.tsx` | Swap to shared primitives (primary target of R1/R2 screenshots) |
| Modify | `src/components/analytics/TypeMixOverTime.tsx` | Swap to shared primitives |
| Modify | `src/components/analytics/UnitsByTypeStackedBars.tsx` | Swap to shared primitives |
| Modify | `src/components/analytics/UnitsPerTxnByChannel.tsx` | Swap to shared primitives |
| Modify | `src/components/analytics/WeekdayDualAxisChart.tsx` | Swap to shared primitives |
| Modify | `src/components/analytics/DayHourHeatmap.tsx` | Migrate to Nivo |
| Modify | `src/components/analytics/SkuChannelHeatmap.tsx` | Migrate to Nivo |
| Modify | `src/App.tsx` | `React.lazy` wrap for `/analytics` route |
| Modify | `package.json` + `package-lock.json` | Add `@nivo/core`, `@nivo/heatmap` |

### Tests

| Action | File | Responsibility |
|---|---|---|
| Create | `tests/convex/unitEconomicsReducers.test.ts` | Per-reducer unit tests (pure functions) |
| Create | `tests/convex/unitEconomicsSnapshots.test.ts` | Snapshot query tests + call-counter regression |
| Create | `tests/components/chartPrimitives.test.tsx` | `truncateWithTooltip`, `formatCurrencyCompact`, tooltip contrast |
| Modify | `tests/convex/unitEconomics.test.ts` | Keep during migration; remove deprecated-wrapper tests in Task 22 |
| Create | `.planning/phases/80.1-analytics-perf-consolidation/80.1-HUMAN-UAT.md` | 10-item UAT checklist (after all code lands) |

---

## Wave A — Backend

### Task 1: Extract first reducer (`reduceKpi`) as a pure function

**Purpose:** Establish the reducer-extraction pattern with the simplest widget. Future reducers follow the same shape.

**Files:**
- Modify: `convex/reports/unitEconomics.ts` (export `reduceKpi` near the top; existing `kpiSummary` query calls it internally)
- Create: `tests/convex/unitEconomicsReducers.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `tests/convex/unitEconomicsReducers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { reduceKpi } from "../../convex/reports/unitEconomics";
import type { NormalizedOrder, NormalizedItem } from "../../convex/reports/unitEconomics";

function makeOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    _id: "o1",
    source: "orders",
    channel: "DIRECT",
    completedAt: 1700000000000,
    orderDate: 1700000000000,
    orderWeight: 1,
    ...overrides,
  };
}

function makeItem(overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    orderId: "o1",
    productName: "Original",
    quantity: 1,
    lineTotal: 50000,
    ...overrides,
  };
}

describe("reduceKpi", () => {
  it("computes revenue + AOV + orderCount for a single-period slice", () => {
    const current = {
      orders: [makeOrder({ _id: "o1" }), makeOrder({ _id: "o2" })],
      items: [
        makeItem({ orderId: "o1", lineTotal: 50000 }),
        makeItem({ orderId: "o2", lineTotal: 30000 }),
      ],
    };
    const prior = { orders: [], items: [] };
    const pre = { unitsPerProduct: new Map(), unitsByTypePerProduct: new Map() };

    const result = reduceKpi(current, prior, pre);

    expect(result.revenue.current).toBe(80000);
    expect(result.orderCount.current).toBe(2);
    expect(result.aov.current).toBe(40000);
  });

  it("returns zero deltas when prior is empty", () => {
    const current = { orders: [makeOrder()], items: [makeItem()] };
    const prior = { orders: [], items: [] };
    const pre = { unitsPerProduct: new Map(), unitsByTypePerProduct: new Map() };

    const result = reduceKpi(current, prior, pre);

    expect(result.revenue.prior).toBe(0);
    expect(result.revenue.delta).toBe(null); // delta null when prior=0
  });
});
```

- [ ] **Step 1.2: Run test, verify it fails**

```bash
npm run test -- tests/convex/unitEconomicsReducers.test.ts
```
Expected: FAIL — `reduceKpi is not exported` or `is not a function`.

- [ ] **Step 1.3: Extract `reduceKpi` in `convex/reports/unitEconomics.ts`**

Find the existing `kpiSummary` query (search for `export const kpiSummary`). Extract its computation body into a new exported pure function:

```ts
// Add near the top of the file, after the NormalizedOrder/NormalizedItem type declarations.

export type Precomputed = {
  unitsPerProduct: Map<string, number>;
  unitsByTypePerProduct: Map<string, Map<string, number>>;
};

export type WindowData = {
  orders: NormalizedOrder[];
  items: NormalizedItem[];
};

export function reduceKpi(
  current: WindowData,
  prior: WindowData,
  pre: Precomputed,
): {
  revenue: { current: number; prior: number; delta: number | null };
  orderCount: { current: number; prior: number; delta: number | null };
  aov: { current: number; prior: number; delta: number | null };
  // ... other KPI fields — copy from existing kpiSummary return shape
} {
  // Copy the existing computation body from kpiSummary's handler here,
  // replacing `ctx`-dependent calls with values from `current`, `prior`, `pre`.
}
```

Then update `kpiSummary` to call it:
```ts
export const kpiSummary = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const pre = await precomputeBomMaps(ctx); // precomputeBomMaps added in Task 3
    const current = await loadFilteredData(ctx, args, pre);
    const prior = await loadPriorPeriodFilteredData(ctx, args, pre); // added in Task 3
    return reduceKpi(current, prior, pre);
  },
});
```

**Note:** `precomputeBomMaps` and `loadPriorPeriodFilteredData` don't exist yet. Comment them out with a TODO and use the current loader shape for now — Task 3 wires them up.

- [ ] **Step 1.4: Run test, verify it passes**

```bash
npm run test -- tests/convex/unitEconomicsReducers.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 1.5: Verify existing tests still pass**

```bash
npm run test -- tests/convex/unitEconomics.test.ts
```
Expected: PASS (all pre-existing KPI tests still green).

- [ ] **Step 1.6: Commit**

```bash
git add tests/convex/unitEconomicsReducers.test.ts convex/reports/unitEconomics.ts
git commit -m "refactor(80.1): extract reduceKpi as pure function"
```

---

### Task 2: Extract remaining reducers (batch)

**Purpose:** Apply the same pattern to all 10 remaining widget computations.

**Files:**
- Modify: `convex/reports/unitEconomics.ts`
- Modify: `tests/convex/unitEconomicsReducers.test.ts`

- [ ] **Step 2.1: Write failing tests for all reducers**

Append to `tests/convex/unitEconomicsReducers.test.ts`:

```ts
import {
  reduceChannelEconomics,
  reduceChannelMomentum,
  reduceChannelSparklines,
  reduceByWeekday,
  reduceRollingTrend,
  reduceDayHourHeatmap,
  reduceVolumeByType,
  reduceTypeMixOverTime,
  reduceSkuTop,
  reduceSkuChannelMatrix,
  reduceRevPerUnit,
  reduceUnitsByTypeStackedBars,
} from "../../convex/reports/unitEconomics";

describe("reduceChannelEconomics", () => {
  it("computes AOV/units-per-txn per channel", () => {
    const current = {
      orders: [
        makeOrder({ _id: "o1", channel: "DIRECT" }),
        makeOrder({ _id: "o2", channel: "GOFOOD" }),
      ],
      items: [
        makeItem({ orderId: "o1", lineTotal: 100000, quantity: 2 }),
        makeItem({ orderId: "o2", lineTotal: 60000, quantity: 1 }),
      ],
    };
    const pre = { unitsPerProduct: new Map(), unitsByTypePerProduct: new Map() };
    const result = reduceChannelEconomics(current, pre);
    const direct = result.find((r) => r.channel === "DIRECT");
    const gofood = result.find((r) => r.channel === "GOFOOD");
    expect(direct?.aov).toBe(100000);
    expect(gofood?.aov).toBe(60000);
  });
});

describe("reduceSkuTop", () => {
  it("returns top-N SKUs ordered by revenue desc", () => {
    const current = {
      orders: [makeOrder({ _id: "o1" })],
      items: [
        makeItem({ orderId: "o1", productName: "A", lineTotal: 30000 }),
        makeItem({ orderId: "o1", productName: "B", lineTotal: 50000 }),
        makeItem({ orderId: "o1", productName: "C", lineTotal: 10000 }),
      ],
    };
    const pre = { unitsPerProduct: new Map(), unitsByTypePerProduct: new Map() };
    const result = reduceSkuTop(current, pre, 20);
    expect(result[0].productName).toBe("B");
    expect(result[1].productName).toBe("A");
    expect(result[2].productName).toBe("C");
  });

  it("caps at N even when more SKUs exist", () => {
    const current = {
      orders: [makeOrder({ _id: "o1" })],
      items: Array.from({ length: 30 }, (_, i) =>
        makeItem({ orderId: "o1", productName: `P${i}`, lineTotal: 1000 * (30 - i) }),
      ),
    };
    const pre = { unitsPerProduct: new Map(), unitsByTypePerProduct: new Map() };
    const result = reduceSkuTop(current, pre, 20);
    expect(result.length).toBe(20);
    expect(result[0].productName).toBe("P0");
  });
});

describe("reduceVolumeByType", () => {
  it("returns buckets at day granularity when called with 'day'", () => {
    const current = {
      orders: [
        makeOrder({ completedAt: new Date("2026-04-10T00:00:00Z").getTime() }),
        makeOrder({ completedAt: new Date("2026-04-11T00:00:00Z").getTime() }),
      ],
      items: [makeItem({ quantity: 1 }), makeItem({ quantity: 2 })],
    };
    const pre = { unitsPerProduct: new Map(), unitsByTypePerProduct: new Map() };
    const result = reduceVolumeByType(current, pre, "day");
    expect(result.buckets.length).toBeGreaterThanOrEqual(2);
  });
});

// Add a minimal "returns empty state cleanly" test for every other reducer.
describe("reduce* empty-state safety", () => {
  const empty = { orders: [], items: [] };
  const pre = { unitsPerProduct: new Map(), unitsByTypePerProduct: new Map() };
  it("reduceChannelMomentum empty", () => expect(reduceChannelMomentum(empty, empty, pre)).toBeDefined());
  it("reduceChannelSparklines empty", () => expect(reduceChannelSparklines(empty, pre)).toBeDefined());
  it("reduceByWeekday empty", () => expect(reduceByWeekday(empty, pre)).toBeDefined());
  it("reduceRollingTrend empty", () => expect(reduceRollingTrend(empty, pre)).toBeDefined());
  it("reduceDayHourHeatmap empty", () => expect(reduceDayHourHeatmap(empty, pre)).toBeDefined());
  it("reduceTypeMixOverTime empty", () => expect(reduceTypeMixOverTime(empty, pre, "day")).toBeDefined());
  it("reduceSkuChannelMatrix empty", () => expect(reduceSkuChannelMatrix(empty, pre, 20)).toBeDefined());
  it("reduceRevPerUnit empty", () => expect(reduceRevPerUnit(empty, pre)).toBeDefined());
  it("reduceUnitsByTypeStackedBars empty", () => expect(reduceUnitsByTypeStackedBars(empty, pre)).toBeDefined());
});
```

- [ ] **Step 2.2: Run tests, verify they fail**

```bash
npm run test -- tests/convex/unitEconomicsReducers.test.ts
```
Expected: FAIL — reducers not exported yet.

- [ ] **Step 2.3: Extract each reducer from its existing query body**

For each of the remaining 11 queries in `convex/reports/unitEconomics.ts` (`byWeekday`, `dayHourHeatmap`, `channelEconomics`, `volumeByType`, `unitsPerTxnByChannel`, `aovByChannel`, `skuPareto`, `skuChannelMatrix`, `channelMomentum`, `rollingTrend`, `typeMixOverTime`):

1. Copy the handler body into a new exported function `reduce<Name>(current: WindowData, pre: Precomputed, ...extraArgs): <ReturnShape>`
2. Replace `ctx.db` calls with data already in `current` (the handler already computed this — preserve the exact logic)
3. Update the query to call the new reducer

**Special cases:**
- `skuPareto` + `skuChannelMatrix` → extract as `reduceSkuTop(current, pre, topN)` + `reduceSkuChannelMatrix(current, pre, topN)`. Reducers accept the cap; widgets slice.
- `volumeByType` + `typeMixOverTime` → extract accepting `granularity: "day" | "week"`. The query still forwards its `args.granularity` during this wave.

**Rename:** `skuPareto` reducer becomes `reduceSkuTop` to match the spec's client-side slice naming. Query name stays `skuPareto` for wrapper compatibility.

- [ ] **Step 2.4: Run reducer tests, verify pass**

```bash
npm run test -- tests/convex/unitEconomicsReducers.test.ts
```
Expected: PASS.

- [ ] **Step 2.5: Run full test suite, verify no regressions**

```bash
npm run test
```
Expected: PASS (all pre-existing tests still green because queries still produce identical payloads).

- [ ] **Step 2.6: Commit**

```bash
git add tests/convex/unitEconomicsReducers.test.ts convex/reports/unitEconomics.ts
git commit -m "refactor(80.1): extract remaining 11 analytics widget reducers"
```

---

### Task 3: Add `precomputeBomMaps` helper + `loadPriorPeriodFilteredData`

**Files:**
- Modify: `convex/reports/unitEconomics.ts`
- Modify: `tests/convex/unitEconomicsReducers.test.ts` (add unit test for helpers — they need ctx so use `convexTest`)

- [ ] **Step 3.1: Write failing test**

Append to `tests/convex/unitEconomicsSnapshots.test.ts` (new file):

```ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { seedBaseFixtures } from "./helpers";

describe("precomputeBomMaps", () => {
  it("returns unitsPerProduct and unitsByTypePerProduct maps", async () => {
    const t = convexTest(schema);
    await seedBaseFixtures(t);

    const result = await t.run(async (ctx) => {
      const { precomputeBomMaps } = await import("../../convex/reports/unitEconomics");
      return precomputeBomMaps(ctx);
    });

    expect(result.unitsPerProduct).toBeInstanceOf(Map);
    expect(result.unitsByTypePerProduct).toBeInstanceOf(Map);
    expect(result.unitsPerProduct.size).toBeGreaterThan(0);
  });

  it("caches componentTypes + menuProductComponents scans — runs them exactly once", async () => {
    const t = convexTest(schema);
    await seedBaseFixtures(t);

    let scanCount = 0;
    await t.run(async (ctx) => {
      const originalQuery = ctx.db.query.bind(ctx.db);
      ctx.db.query = ((tableName: string) => {
        if (tableName === "componentTypes" || tableName === "menuProductComponents") scanCount++;
        return originalQuery(tableName);
      }) as typeof ctx.db.query;

      const { precomputeBomMaps } = await import("../../convex/reports/unitEconomics");
      await precomputeBomMaps(ctx);
    });

    expect(scanCount).toBe(2); // one scan of componentTypes, one of menuProductComponents
  });
});
```

- [ ] **Step 3.2: Run test, verify FAIL**

```bash
npm run test -- tests/convex/unitEconomicsSnapshots.test.ts
```
Expected: FAIL — `precomputeBomMaps is not exported`.

- [ ] **Step 3.3: Add `precomputeBomMaps` export**

In `convex/reports/unitEconomics.ts`, add:
```ts
export async function precomputeBomMaps(ctx: QueryCtx): Promise<Precomputed> {
  const unitsPerProduct = await getProductionUnitsPerProduct(ctx);
  const unitsByTypePerProduct = await getProductionUnitsByTypePerProduct(ctx);
  return { unitsPerProduct, unitsByTypePerProduct };
}
```

Update `getProductionUnitsPerProduct` (`convex/reports/productionUnitHelpers.ts`) and `getProductionUnitsByTypePerProduct` to return `Map` shapes matching `Precomputed` — verify they already do; if not, wrap inline.

- [ ] **Step 3.4: Add `loadPriorPeriodFilteredData`**

In the same file, below `loadFilteredData`:
```ts
async function loadPriorPeriodFilteredData(
  ctx: QueryCtx,
  args: FilterArgs,
  pre: Precomputed,
): Promise<WindowData> {
  const window = args.toTs - args.fromTs;
  return loadFilteredData(
    ctx,
    { ...args, fromTs: args.fromTs - window, toTs: args.fromTs },
    pre,
  );
}
```

Update `loadFilteredData` signature to accept the optional `pre: Precomputed` third arg. When `pre` is provided, skip the internal BOM-map loads inside and use `pre` directly.

- [ ] **Step 3.5: Run tests, verify PASS**

```bash
npm run test -- tests/convex/unitEconomicsSnapshots.test.ts tests/convex/unitEconomicsReducers.test.ts tests/convex/unitEconomics.test.ts
```
Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add convex/reports/unitEconomics.ts tests/convex/unitEconomicsSnapshots.test.ts
git commit -m "feat(80.1): add precomputeBomMaps + loadPriorPeriodFilteredData helpers"
```

---

### Task 4: Implement `kpiAndChannelSnapshot` query

**Files:**
- Modify: `convex/reports/unitEconomics.ts`
- Modify: `tests/convex/unitEconomicsSnapshots.test.ts`

- [ ] **Step 4.1: Write failing test**

Append to `tests/convex/unitEconomicsSnapshots.test.ts`:
```ts
describe("kpiAndChannelSnapshot", () => {
  it("returns kpi + channelEconomics + channelMomentum + channelSparklines in one payload", async () => {
    const t = convexTest(schema);
    await seedBaseFixtures(t);

    const result = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: Date.now() - 30 * 86400000,
      toTs: Date.now(),
    });

    expect(result.kpi).toBeDefined();
    expect(result.kpi.revenue).toBeDefined();
    expect(result.channelEconomics).toBeInstanceOf(Array);
    expect(result.channelMomentum).toBeDefined();
    expect(result.channelSparklines).toBeDefined();
  });
});
```

- [ ] **Step 4.2: Run test, verify FAIL**

Expected: FAIL — query not registered.

- [ ] **Step 4.3: Implement the query**

In `convex/reports/unitEconomics.ts`, add:
```ts
export const kpiAndChannelSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const pre = await precomputeBomMaps(ctx);
    const current = await loadFilteredData(ctx, args, pre);
    const prior = await loadPriorPeriodFilteredData(ctx, args, pre);
    return {
      kpi: reduceKpi(current, prior, pre),
      channelEconomics: reduceChannelEconomics(current, pre),
      channelMomentum: reduceChannelMomentum(current, prior, pre),
      channelSparklines: reduceChannelSparklines(current, pre),
    };
  },
});
```

- [ ] **Step 4.4: Regenerate Convex API types**

```bash
npx convex dev --once --typecheck-components
```
Expected: generates `convex/_generated/api.d.ts` entry for `kpiAndChannelSnapshot`.

- [ ] **Step 4.5: Run test, verify PASS**

```bash
npm run test -- tests/convex/unitEconomicsSnapshots.test.ts
```

- [ ] **Step 4.6: Commit**

```bash
git add convex/reports/unitEconomics.ts convex/_generated/ tests/convex/unitEconomicsSnapshots.test.ts
git commit -m "feat(80.1): add kpiAndChannelSnapshot query"
```

---

### Task 5: Implement `timeSeriesSnapshot` query

**Files:**
- Modify: `convex/reports/unitEconomics.ts`
- Modify: `tests/convex/unitEconomicsSnapshots.test.ts`

- [ ] **Step 5.1: Write failing test**

```ts
describe("timeSeriesSnapshot", () => {
  it("returns all time-series widgets with both granularities precomputed", async () => {
    const t = convexTest(schema);
    await seedBaseFixtures(t);

    const result = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: Date.now() - 60 * 86400000,
      toTs: Date.now(),
    });

    expect(result.byWeekday).toBeDefined();
    expect(result.rollingTrend).toBeDefined();
    expect(result.dayHourHeatmap).toBeDefined();
    expect(result.volumeByType.day).toBeDefined();
    expect(result.volumeByType.week).toBeDefined();
    expect(result.typeMixOverTime.day).toBeDefined();
    expect(result.typeMixOverTime.week).toBeDefined();
  });
});
```

- [ ] **Step 5.2: Run test, verify FAIL**

- [ ] **Step 5.3: Implement the query**

```ts
export const timeSeriesSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const pre = await precomputeBomMaps(ctx);
    const current = await loadFilteredData(ctx, args, pre);
    return {
      byWeekday: reduceByWeekday(current, pre),
      rollingTrend: reduceRollingTrend(current, pre),
      dayHourHeatmap: reduceDayHourHeatmap(current, pre),
      volumeByType: {
        day: reduceVolumeByType(current, pre, "day"),
        week: reduceVolumeByType(current, pre, "week"),
      },
      typeMixOverTime: {
        day: reduceTypeMixOverTime(current, pre, "day"),
        week: reduceTypeMixOverTime(current, pre, "week"),
      },
    };
  },
});
```

- [ ] **Step 5.4: Regenerate API + run test**

```bash
npx convex dev --once --typecheck-components
npm run test -- tests/convex/unitEconomicsSnapshots.test.ts
```
Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add convex/reports/unitEconomics.ts convex/_generated/ tests/convex/unitEconomicsSnapshots.test.ts
git commit -m "feat(80.1): add timeSeriesSnapshot query with both granularities precomputed"
```

---

### Task 6: Implement `skuSnapshot` query

**Files:**
- Modify: `convex/reports/unitEconomics.ts`
- Modify: `tests/convex/unitEconomicsSnapshots.test.ts`

- [ ] **Step 6.1: Write failing test**

```ts
describe("skuSnapshot", () => {
  it("returns skuTop (fixed cap 20), skuChannelMatrix, revPerUnit, unitsByTypeStackedBars", async () => {
    const t = convexTest(schema);
    await seedBaseFixtures(t);

    const result = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: Date.now() - 30 * 86400000,
      toTs: Date.now(),
    });

    expect(result.skuTop).toBeInstanceOf(Array);
    expect(result.skuTop.length).toBeLessThanOrEqual(20);
    expect(result.skuChannelMatrix).toBeDefined();
    expect(result.revPerUnit).toBeDefined();
    expect(result.unitsByTypeStackedBars).toBeDefined();
  });
});
```

- [ ] **Step 6.2: Run test, verify FAIL**

- [ ] **Step 6.3: Implement the query**

```ts
const SKU_SNAPSHOT_TOP_CAP = 20;

export const skuSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const pre = await precomputeBomMaps(ctx);
    const current = await loadFilteredData(ctx, args, pre);
    return {
      skuTop: reduceSkuTop(current, pre, SKU_SNAPSHOT_TOP_CAP),
      skuChannelMatrix: reduceSkuChannelMatrix(current, pre, SKU_SNAPSHOT_TOP_CAP),
      revPerUnit: reduceRevPerUnit(current, pre),
      unitsByTypeStackedBars: reduceUnitsByTypeStackedBars(current, pre),
    };
  },
});
```

- [ ] **Step 6.4: Regenerate API + run test**

```bash
npx convex dev --once --typecheck-components
npm run test -- tests/convex/unitEconomicsSnapshots.test.ts
```

- [ ] **Step 6.5: Commit**

```bash
git add convex/reports/unitEconomics.ts convex/_generated/ tests/convex/unitEconomicsSnapshots.test.ts
git commit -m "feat(80.1): add skuSnapshot query with fixed top-20 cap"
```

---

### Task 7: Convert existing 11 queries to thin wrappers

**Files:**
- Modify: `convex/reports/unitEconomics.ts`

- [ ] **Step 7.1: Rewrite each query as a wrapper**

Find each of these queries and replace their handlers:

```ts
export const kpiSummary = query({
  args: filterArgs,
  handler: async (ctx, args) => (await kpiAndChannelSnapshot._handler(ctx, args)).kpi,
});

export const channelEconomics = query({
  args: filterArgs,
  handler: async (ctx, args) => (await kpiAndChannelSnapshot._handler(ctx, args)).channelEconomics,
});

export const channelMomentum = query({
  args: filterArgs,
  handler: async (ctx, args) => (await kpiAndChannelSnapshot._handler(ctx, args)).channelMomentum,
});

export const byWeekday = query({
  args: { ...filterArgs, mode: v.optional(v.union(v.literal("weekday"), v.literal("rolling"))) },
  handler: async (ctx, args) => {
    const snapshot = await timeSeriesSnapshot._handler(ctx, args);
    return args.mode === "rolling" ? snapshot.rollingTrend : snapshot.byWeekday;
  },
});

export const rollingTrend = query({
  args: filterArgs,
  handler: async (ctx, args) => (await timeSeriesSnapshot._handler(ctx, args)).rollingTrend,
});

export const dayHourHeatmap = query({
  args: filterArgs,
  handler: async (ctx, args) => (await timeSeriesSnapshot._handler(ctx, args)).dayHourHeatmap,
});

export const volumeByType = query({
  args: { ...filterArgs, granularity: v.union(v.literal("day"), v.literal("week")) },
  handler: async (ctx, args) => {
    const snapshot = await timeSeriesSnapshot._handler(ctx, args);
    return snapshot.volumeByType[args.granularity];
  },
});

export const typeMixOverTime = query({
  args: { ...filterArgs, granularity: v.union(v.literal("day"), v.literal("week")) },
  handler: async (ctx, args) => {
    const snapshot = await timeSeriesSnapshot._handler(ctx, args);
    return snapshot.typeMixOverTime[args.granularity];
  },
});

export const unitsPerTxnByChannel = query({
  args: filterArgs,
  handler: async (ctx, args) =>
    (await kpiAndChannelSnapshot._handler(ctx, args)).channelEconomics,
});

export const aovByChannel = query({
  args: filterArgs,
  handler: async (ctx, args) =>
    (await kpiAndChannelSnapshot._handler(ctx, args)).channelEconomics,
});

export const skuPareto = query({
  args: { ...filterArgs, topN: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const snapshot = await skuSnapshot._handler(ctx, args);
    return snapshot.skuTop.slice(0, args.topN ?? 10);
  },
});

export const skuChannelMatrix = query({
  args: { ...filterArgs, topN: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const snapshot = await skuSnapshot._handler(ctx, args);
    return snapshot.skuChannelMatrix.slice(0, args.topN ?? 8);
  },
});
```

**Note:** `unitsPerTxnByChannel` + `aovByChannel` currently return the same shape as `channelEconomics` subsets. Preserve the exact field names the existing frontend consumes — verify via `git log -p convex/reports/unitEconomics.ts` if unsure.

- [ ] **Step 7.2: Run full test suite**

```bash
npm run test
```
Expected: all pre-existing `tests/convex/unitEconomics.test.ts` tests PASS (thin wrappers must return identical shapes).

If any test fails, the wrapper is projecting a wrong field or shape — adjust. Do NOT change the test.

- [ ] **Step 7.3: Commit**

```bash
git add convex/reports/unitEconomics.ts
git commit -m "refactor(80.1): convert 11 existing analytics queries to thin snapshot wrappers"
```

---

### Task 8: Add call-counter regression test

**Files:**
- Modify: `tests/convex/unitEconomicsSnapshots.test.ts`

- [ ] **Step 8.1: Write the regression test**

```ts
describe("snapshot call-count regression", () => {
  it("kpiAndChannelSnapshot calls loadFilteredData exactly twice (current + prior)", async () => {
    const t = convexTest(schema);
    await seedBaseFixtures(t);

    // Spy by monkey-patching — convex-test gives us ctx access via t.run.
    let loadCount = 0;
    await t.run(async (ctx) => {
      const mod = await import("../../convex/reports/unitEconomics");
      const original = (mod as any).loadFilteredData;
      (mod as any).loadFilteredData = async (...args: unknown[]) => {
        loadCount++;
        return original.apply(null, args);
      };
      await mod.kpiAndChannelSnapshot._handler(ctx, {
        fromTs: Date.now() - 30 * 86400000,
        toTs: Date.now(),
      });
      (mod as any).loadFilteredData = original;
    });
    expect(loadCount).toBe(2);
  });

  it("timeSeriesSnapshot calls loadFilteredData exactly once", async () => {
    // Similar pattern, expect loadCount === 1.
  });

  it("skuSnapshot calls loadFilteredData exactly once", async () => {
    // Similar pattern, expect loadCount === 1.
  });

  it("precomputeBomMaps is called once per snapshot invocation", async () => {
    const t = convexTest(schema);
    await seedBaseFixtures(t);
    let preCount = 0;
    await t.run(async (ctx) => {
      const mod = await import("../../convex/reports/unitEconomics");
      const original = mod.precomputeBomMaps;
      (mod as any).precomputeBomMaps = async (c: typeof ctx) => {
        preCount++;
        return original(c);
      };
      await mod.kpiAndChannelSnapshot._handler(ctx, {
        fromTs: Date.now() - 30 * 86400000,
        toTs: Date.now(),
      });
      (mod as any).precomputeBomMaps = original;
    });
    expect(preCount).toBe(1);
  });
});
```

**Note:** If module-level monkey-patch proves flaky (Vitest caches modules), flip the implementation to pass `loadFilteredData` as a dependency-injected argument in tests — but only if the simple patch fails. Try the simple version first.

- [ ] **Step 8.2: Run test, verify PASS**

```bash
npm run test -- tests/convex/unitEconomicsSnapshots.test.ts
```

- [ ] **Step 8.3: Commit**

```bash
git add tests/convex/unitEconomicsSnapshots.test.ts
git commit -m "test(80.1): add call-counter regression tests for snapshot queries"
```

---

### Task 9: Inline the two remaining `jakartaHour` call sites (M-03 cleanup)

**Files:**
- Modify: `convex/reports/unitEconomics.ts`

- [ ] **Step 9.1: Find call sites**

```bash
grep -n "jakartaHour(" convex/reports/unitEconomics.ts
```
Expected: 1-2 call sites in the dayHourHeatmap reducer.

- [ ] **Step 9.2: Inline the alias**

In `convex/reports/unitEconomics.ts`, find:
```ts
function jakartaHour(ts: number): number {
  return getWibComponents(ts).hour;
}
```

Delete this function. Replace every call site `jakartaHour(ts)` with `getWibComponents(ts).hour`.

- [ ] **Step 9.3: Run tests**

```bash
npm run test -- tests/convex/
```
Expected: PASS.

- [ ] **Step 9.4: Commit**

```bash
git add convex/reports/unitEconomics.ts
git commit -m "refactor(80.1): inline jakartaHour alias — use getWibComponents directly"
```

**End of Wave A. Push branch + checkpoint.**

```bash
git push -u origin gsd/phase-80.1-analytics-perf-consolidation
```

---

## Wave B — Frontend Primitives + Hooks + Widget Migration

### Task 10: Create `chartPrimitives.tsx` with `truncateWithTooltip` + `formatCurrencyCompact`

**Files:**
- Create: `src/lib/chartPrimitives.tsx`
- Create: `tests/components/chartPrimitives.test.tsx`

- [ ] **Step 10.1: Write failing tests**

Create `tests/components/chartPrimitives.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { truncateWithTooltip, formatCurrencyCompact } from "@/lib/chartPrimitives";

describe("truncateWithTooltip", () => {
  it("returns display=full when within limit", () => {
    expect(truncateWithTooltip("Short", 22)).toEqual({ display: "Short", full: "Short" });
  });

  it("ellipsizes and preserves full label when over limit", () => {
    const result = truncateWithTooltip("Dubai Chewy Cookie - Regular Pack Of 3", 22);
    expect(result.display).toBe("Dubai Chewy Cookie - …");
    expect(result.full).toBe("Dubai Chewy Cookie - Regular Pack Of 3");
  });

  it("defaults max to 22", () => {
    expect(truncateWithTooltip("Short").display).toBe("Short");
  });
});

describe("formatCurrencyCompact", () => {
  it("formats thousands as rb", () => {
    expect(formatCurrencyCompact(15000)).toBe("Rp 15rb");
    expect(formatCurrencyCompact(999)).toBe("Rp 999");
  });

  it("formats millions as jt", () => {
    expect(formatCurrencyCompact(1200000)).toBe("Rp 1,2jt");
    expect(formatCurrencyCompact(14580000)).toBe("Rp 14,6jt");
  });

  it("formats billions as M", () => {
    expect(formatCurrencyCompact(1_500_000_000)).toBe("Rp 1,5M");
  });

  it("formats zero", () => {
    expect(formatCurrencyCompact(0)).toBe("Rp 0");
  });
});
```

- [ ] **Step 10.2: Run test, verify FAIL**

```bash
npm run test -- tests/components/chartPrimitives.test.tsx
```

- [ ] **Step 10.3: Implement the helpers**

Create `src/lib/chartPrimitives.tsx`:
```tsx
// Shared chart primitives for /analytics page widgets.
//
// Readability rules enforced here (never bypass in individual widgets):
// R1 — axis labels never silently truncate; every clipped label has a tooltip reveal
// R2 — tooltips use --popover/--popover-foreground for WCAG AA contrast against dark chrome
// R3 — category colors appear as swatches in tooltips, never as text color of values

export function truncateWithTooltip(
  label: string,
  max = 22,
): { display: string; full: string } {
  if (label.length <= max) return { display: label, full: label };
  return { display: label.slice(0, max - 1) + "…", full: label };
}

export function formatCurrencyCompact(value: number): string {
  if (value === 0) return "Rp 0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `Rp ${sign}${(value / 1_000_000_000).toFixed(1).replace(".", ",")}M`;
  }
  if (abs >= 1_000_000) {
    return `Rp ${sign}${(value / 1_000_000).toFixed(1).replace(".", ",")}jt`;
  }
  if (abs >= 1_000) {
    return `Rp ${sign}${Math.round(value / 1000)}rb`;
  }
  return `Rp ${sign}${Math.round(Math.abs(value))}`;
}
```

- [ ] **Step 10.4: Run tests, verify PASS**

- [ ] **Step 10.5: Commit**

```bash
git add src/lib/chartPrimitives.tsx tests/components/chartPrimitives.test.tsx
git commit -m "feat(80.1): add truncateWithTooltip + formatCurrencyCompact helpers"
```

---

### Task 11: Add `ChartTooltip` component with contrast enforcement

**Files:**
- Modify: `src/lib/chartPrimitives.tsx`
- Modify: `tests/components/chartPrimitives.test.tsx`

- [ ] **Step 11.1: Write failing contrast test**

Append to `tests/components/chartPrimitives.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { ChartTooltip } from "@/lib/chartPrimitives";

// WCAG 2.x relative luminance + contrast ratio
function relativeLuminance(hex: string): number {
  const [r, g, b] = hex.replace("#", "").match(/.{2}/g)!.map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("ChartTooltip contrast", () => {
  it("renders dark background + light text against the dark page chrome", () => {
    const { container } = render(
      <ChartTooltip
        active
        payload={[{ name: "Revenue", value: 14580000, color: "#f97316" }]}
        label="Dubai Chewy Cookie"
      />,
    );
    const tooltip = container.querySelector("[data-chart-tooltip]") as HTMLElement;
    expect(tooltip).toBeTruthy();

    // With CSS vars not resolved in jsdom, we inline the asserted palette:
    // background should be the popover token (--popover ≈ #0a0a0a / hsl(0 0% 3.9%))
    // foreground should be near-white (--popover-foreground ≈ #fafafa)
    // Assert the component applied the expected className(s).
    expect(tooltip.className).toContain("bg-popover");
    expect(tooltip.className).toContain("text-popover-foreground");

    // Resolved contrast must be ≥ 4.5 — compute against the actual dark-mode values.
    const darkBg = "#0a0a0a";
    const lightFg = "#fafafa";
    expect(contrast(lightFg, darkBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("renders category color as a swatch, never as value text color", () => {
    const { container } = render(
      <ChartTooltip
        active
        payload={[{ name: "Revenue", value: 14580000, color: "#f97316" }]}
        label="Test"
      />,
    );
    const valueEl = container.querySelector("[data-tooltip-value]") as HTMLElement;
    expect(valueEl).toBeTruthy();
    // Value text must NOT have the category color inline — category color only on swatch.
    expect(valueEl.style.color).toBe(""); // falls back to popover-foreground

    const swatch = container.querySelector("[data-tooltip-swatch]") as HTMLElement;
    expect(swatch).toBeTruthy();
    expect(swatch.style.backgroundColor.toLowerCase()).toMatch(/f97316|rgb\(249, 115, 22\)/i);
  });

  it("renders nothing when inactive", () => {
    const { container } = render(<ChartTooltip active={false} payload={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 11.2: Run test, verify FAIL**

- [ ] **Step 11.3: Implement `ChartTooltip`**

Append to `src/lib/chartPrimitives.tsx`:
```tsx
import { formatCurrency } from "@/lib/utils";

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  formatter?: (value: number | string) => string;
};

export type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  valueFormatter?: (value: number | string, name?: string) => string;
};

/**
 * R2: Every tooltip on /analytics renders through this component.
 * Background uses the --popover token (near-black in dark mode); text uses
 * --popover-foreground (near-white). Category colors appear ONLY as swatches.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      data-chart-tooltip
      className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      {label !== undefined && (
        <div className="mb-1 font-medium">{String(label)}</div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => {
          const rawValue = entry.value ?? "";
          const formatted = valueFormatter
            ? valueFormatter(rawValue, entry.name)
            : typeof rawValue === "number"
              ? formatCurrency(rawValue)
              : String(rawValue);
          return (
            <div key={i} className="flex items-center gap-2">
              {entry.color && (
                <span
                  data-tooltip-swatch
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                />
              )}
              <span className="text-muted-foreground">{entry.name ?? ""}:</span>
              <span data-tooltip-value className="font-medium tabular-nums">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 11.4: Run tests, verify PASS**

```bash
npm run test -- tests/components/chartPrimitives.test.tsx
```

- [ ] **Step 11.5: Commit**

```bash
git add src/lib/chartPrimitives.tsx tests/components/chartPrimitives.test.tsx
git commit -m "feat(80.1): add ChartTooltip with WCAG AA contrast + swatch-only category colors"
```

---

### Task 12: Add `ChartFrame` and `ChartAxis` components

**Files:**
- Modify: `src/lib/chartPrimitives.tsx`
- Modify: `tests/components/chartPrimitives.test.tsx`

- [ ] **Step 12.1: Write failing test**

Append to `tests/components/chartPrimitives.test.tsx`:
```tsx
import { ChartFrame } from "@/lib/chartPrimitives";

describe("ChartFrame", () => {
  it("renders title + children with default height 320", () => {
    const { getByText, container } = render(
      <ChartFrame title="Test Chart">
        <div>inner</div>
      </ChartFrame>,
    );
    expect(getByText("Test Chart")).toBeTruthy();
    expect(getByText("inner")).toBeTruthy();
    const frame = container.querySelector("[data-chart-frame]") as HTMLElement;
    expect(frame.style.height).toBe("320px");
  });

  it("renders loading state when loading=true", () => {
    const { container, queryByText } = render(
      <ChartFrame title="Test" loading>
        <div>inner</div>
      </ChartFrame>,
    );
    expect(queryByText("inner")).toBeNull(); // children NOT rendered during load
    expect(container.querySelector("[data-chart-skeleton]")).toBeTruthy();
  });
});
```

- [ ] **Step 12.2: Run test, verify FAIL**

- [ ] **Step 12.3: Implement `ChartFrame` and `ChartAxis`**

Append to `src/lib/chartPrimitives.tsx`:
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

export type ChartFrameProps = {
  title: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  height?: number;
  children: ReactNode;
};

/**
 * R1 enforcement: default margin + height ensure labels don't clip.
 * Every analytics chart wraps its <ResponsiveContainer> with <ChartFrame>.
 */
export function ChartFrame({
  title,
  subtitle,
  loading,
  error,
  height = 320,
  children,
}: ChartFrameProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent>
        <div data-chart-frame style={{ height: `${height}px` }}>
          {loading ? (
            <div
              data-chart-skeleton
              className="h-full w-full animate-pulse rounded bg-muted"
            />
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {error}
            </div>
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Default chart margins. R1: 64px bottom + left so Y-axis and rotated
 * X-axis labels never clip.
 */
export const CHART_MARGIN = { top: 16, right: 48, bottom: 64, left: 64 } as const;

export const X_AXIS_STRING_LABEL_PROPS = {
  angle: -35,
  textAnchor: "end" as const,
  interval: 0, // show every tick — never auto-hide
  height: 80,
  tick: { fontSize: 11 },
};
```

- [ ] **Step 12.4: Run test, verify PASS**

- [ ] **Step 12.5: Commit**

```bash
git add src/lib/chartPrimitives.tsx tests/components/chartPrimitives.test.tsx
git commit -m "feat(80.1): add ChartFrame + CHART_MARGIN + X_AXIS_STRING_LABEL_PROPS constants"
```

---

### Task 13: Rewrite `useAnalytics.ts` hooks

**Files:**
- Modify: `src/hooks/convex/useAnalytics.ts`

- [ ] **Step 13.1: Rewrite the file**

Replace the entire contents of `src/hooks/convex/useAnalytics.ts` with:

```ts
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAnalyticsFilters, type AnalyticsFilters } from "@/contexts/AnalyticsFilterContext";

function buildArgs(f: AnalyticsFilters) {
  return {
    fromTs: f.fromTs,
    toTs: f.toTs,
    channels: f.channels.length ? f.channels : undefined,
    menuProductIds: f.menuProductIds.length ? f.menuProductIds : undefined,
  };
}

// -----------------------------------------------------------------------------
// Snapshot hooks — 3 subscriptions cover all 13 widgets.
// Convex dedupes identical useQuery calls within the same tree; widgets
// calling the selectors below share these subscriptions automatically.
// -----------------------------------------------------------------------------

export function useKpiAndChannelSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.kpiAndChannelSnapshot, buildArgs(filters));
}

export function useTimeSeriesSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.timeSeriesSnapshot, buildArgs(filters));
}

export function useSkuSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.skuSnapshot, buildArgs(filters));
}

// -----------------------------------------------------------------------------
// Backward-compatible field selectors — widget files keep their current
// hook names. Granularity + topN are client-side slices, not server args.
// -----------------------------------------------------------------------------

export const useKpiSummary = () => useKpiAndChannelSnapshot()?.kpi;
export const useChannelEconomics = () => useKpiAndChannelSnapshot()?.channelEconomics;
export const useChannelMomentum = () => useKpiAndChannelSnapshot()?.channelMomentum;

export const useByWeekday = () => useTimeSeriesSnapshot()?.byWeekday;
export const useRollingTrend = () => useTimeSeriesSnapshot()?.rollingTrend;
export const useDayHourHeatmap = () => useTimeSeriesSnapshot()?.dayHourHeatmap;
export const useVolumeByType = (g: "day" | "week") =>
  useTimeSeriesSnapshot()?.volumeByType[g];
export const useTypeMixOverTime = (g: "day" | "week") =>
  useTimeSeriesSnapshot()?.typeMixOverTime[g];

export const useSkuPareto = (topN = 10) => useSkuSnapshot()?.skuTop.slice(0, topN);
export const useSkuChannelMatrix = (topN = 8) =>
  useSkuSnapshot()?.skuChannelMatrix.slice(0, topN);

// unitsPerTxnByChannel + aovByChannel were subset selectors of channelEconomics
// in the legacy API. Widgets calling them receive the channelEconomics array.
export const useUnitsPerTxnByChannel = () => useKpiAndChannelSnapshot()?.channelEconomics;
export const useAovByChannel = () => useKpiAndChannelSnapshot()?.channelEconomics;
```

- [ ] **Step 13.2: Type-check**

```bash
npm run type-check
```
Expected: no errors. If a widget references a different return shape via destructuring, note the file and address in the next task.

- [ ] **Step 13.3: Run frontend tests**

```bash
npm run test -- src/
```
Expected: PASS. If any widget test breaks due to hook rename, file a TODO but continue — widget migration in Tasks 14-17 will address.

- [ ] **Step 13.4: Commit**

```bash
git add src/hooks/convex/useAnalytics.ts
git commit -m "refactor(80.1): rewrite useAnalytics hooks as 3 snapshots + field selectors"
```

---

### Task 14: Migrate `SkuParetoChart.tsx` to primitives (R1+R2 priority — this is the screenshot subject)

**Files:**
- Modify: `src/components/analytics/SkuParetoChart.tsx`

- [ ] **Step 14.1: Read the current file**

```bash
cat src/components/analytics/SkuParetoChart.tsx
```
Note the current structure: imports, data destructure, render tree.

- [ ] **Step 14.2: Rewrite with primitives**

Replace the entire file with:
```tsx
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useSkuPareto } from "@/hooks/convex/useAnalytics";
import {
  ChartFrame,
  ChartTooltip,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
  formatCurrencyCompact,
  truncateWithTooltip,
} from "@/lib/chartPrimitives";

export function SkuParetoChart({ topN = 10 }: { topN?: number }) {
  const data = useSkuPareto(topN);
  if (data === undefined) {
    return <ChartFrame title="SKU Pareto (top products by revenue)" loading>{null}</ChartFrame>;
  }

  // Compute cumulative % client-side from the sliced top-N
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  let running = 0;
  const withCumulative = data.map((d) => {
    running += d.revenue;
    return {
      ...d,
      displayName: truncateWithTooltip(d.productName, 22).display,
      fullName: d.productName,
      cumulativePct: totalRevenue > 0 ? (running / totalRevenue) * 100 : 0,
    };
  });

  return (
    <ChartFrame title="SKU Pareto (top products by revenue)">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <ComposedChart data={withCumulative} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="displayName" {...X_AXIS_STRING_LABEL_PROPS} />
          <YAxis
            yAxisId="left"
            tickFormatter={formatCurrencyCompact}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => `${Math.round(v)}%`}
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={(value, name) => {
                  if (name === "Cumulative %") return `${Number(value).toFixed(1)}%`;
                  return formatCurrencyCompact(Number(value));
                }}
              />
            }
            labelFormatter={(_, payload) => {
              const first = Array.isArray(payload) ? payload[0]?.payload : undefined;
              return first?.fullName ?? "";
            }}
          />
          <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#f97316" />
          <Line
            yAxisId="right"
            dataKey="cumulativePct"
            name="Cumulative %"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
```

- [ ] **Step 14.3: Visual check**

```bash
npm run dev
# In another terminal: npx convex dev
```
Open `http://localhost:5173/analytics`. Verify on the SkuParetoChart:
1. X-axis labels are visible for ALL bars (no auto-hiding)
2. Long labels show truncated text on the axis BUT hover reveals the full name
3. Left Y-axis `Rp 0` not clipped
4. Right Y-axis `100%` / `0%` not clipped
5. Tooltip has DARK background (not white), all text legible at a glance
6. Tooltip category colors appear as small colored squares next to value names, NOT as the text color

If any fail, adjust `CHART_MARGIN` or `X_AXIS_STRING_LABEL_PROPS` and re-verify.

- [ ] **Step 14.4: Run tests**

```bash
npm run test
```

- [ ] **Step 14.5: Commit**

```bash
git add src/components/analytics/SkuParetoChart.tsx
git commit -m "feat(80.1): migrate SkuParetoChart to shared primitives (R1+R2)"
```

---

### Task 15: Migrate `UnitsByTypeStackedBars.tsx` + `TypeMixOverTime.tsx` to primitives

**Files:**
- Modify: `src/components/analytics/UnitsByTypeStackedBars.tsx`
- Modify: `src/components/analytics/TypeMixOverTime.tsx`

- [ ] **Step 15.1: Migrate `UnitsByTypeStackedBars.tsx`**

Replace contents with primitive usage. Full file (~40 LOC):
```tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAnalyticsFilters } from "@/contexts/AnalyticsFilterContext";
import { colorFor } from "@/lib/productionTypeColors";
import {
  ChartFrame,
  ChartTooltip,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
} from "@/lib/chartPrimitives";
import { useSkuSnapshot } from "@/hooks/convex/useAnalytics";

export function UnitsByTypeStackedBars() {
  const snapshot = useSkuSnapshot();
  const data = snapshot?.unitsByTypeStackedBars;
  if (data === undefined) {
    return <ChartFrame title="Units by type" loading>{null}</ChartFrame>;
  }

  return (
    <ChartFrame title="Units by type (top products)">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <BarChart data={data.rows} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="productName" {...X_AXIS_STRING_LABEL_PROPS} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => String(v)} />} />
          <Legend />
          {data.series.map((s, i) => (
            <Bar
              key={s.code}
              dataKey={s.code}
              name={s.name}
              stackId="a"
              fill={colorFor(s.code, i)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
```

**Note:** `data.rows` and `data.series` come from the `reduceUnitsByTypeStackedBars` output shape. Preserve those field names from the existing reducer.

- [ ] **Step 15.2: Migrate `TypeMixOverTime.tsx`**

Similar pattern — wrap in `ChartFrame`, use `CHART_MARGIN`, `X_AXIS_STRING_LABEL_PROPS`, `ChartTooltip`. Source hook is `useTypeMixOverTime(granularity)` where granularity is a prop.

- [ ] **Step 15.3: Visual check**

Open `/analytics`. Confirm both charts render with no label clipping + dark-bg tooltips.

- [ ] **Step 15.4: Run tests + type-check**

```bash
npm run type-check && npm run test
```

- [ ] **Step 15.5: Commit**

```bash
git add src/components/analytics/UnitsByTypeStackedBars.tsx src/components/analytics/TypeMixOverTime.tsx
git commit -m "feat(80.1): migrate UnitsByType + TypeMixOverTime to shared primitives"
```

---

### Task 16: Migrate `RevPerUnitChart.tsx` + `RollingTrendChart.tsx` + `WeekdayDualAxisChart.tsx`

**Files:**
- Modify: `src/components/analytics/RevPerUnitChart.tsx`
- Modify: `src/components/analytics/RollingTrendChart.tsx`
- Modify: `src/components/analytics/WeekdayDualAxisChart.tsx`

- [ ] **Step 16.1: Read each current file**

```bash
cat src/components/analytics/RevPerUnitChart.tsx src/components/analytics/RollingTrendChart.tsx src/components/analytics/WeekdayDualAxisChart.tsx
```

- [ ] **Step 16.2: Apply the same migration pattern to each**

For each file:
1. Wrap the outer return in `<ChartFrame title="..." loading={data === undefined}>`
2. Replace inline `<Card>`/`<CardHeader>`/`<CardContent>` with the frame
3. Add `margin={CHART_MARGIN}` to the Recharts root chart
4. Apply `{...X_AXIS_STRING_LABEL_PROPS}` to X-axes with string ticks
5. Replace inline `<Tooltip content={...} />` with `<Tooltip content={<ChartTooltip valueFormatter={...} />} />`
6. Use `formatCurrencyCompact` for Y-axis currency tick formatters

- [ ] **Step 16.3: Visual check + tests**

```bash
npm run type-check && npm run test
```

Open `/analytics`. Verify all three charts:
- No label clipping
- Dark-bg tooltips with WCAG-AA contrast
- Category colors as swatches only

- [ ] **Step 16.4: Commit**

```bash
git add src/components/analytics/RevPerUnitChart.tsx src/components/analytics/RollingTrendChart.tsx src/components/analytics/WeekdayDualAxisChart.tsx
git commit -m "feat(80.1): migrate RevPerUnit + RollingTrend + WeekdayDualAxis to shared primitives"
```

---

### Task 17: Migrate `UnitsPerTxnByChannel.tsx` + `AovByChannel.tsx`

**Files:**
- Modify: `src/components/analytics/UnitsPerTxnByChannel.tsx`
- Modify: `src/components/analytics/AovByChannel.tsx`

- [ ] **Step 17.1: Apply migration pattern**

Same rhythm as Task 16. Both consume `channelEconomics` via the respective selector hooks.

- [ ] **Step 17.2: Visual + type-check + tests**

```bash
npm run type-check && npm run test
```

- [ ] **Step 17.3: Commit**

```bash
git add src/components/analytics/UnitsPerTxnByChannel.tsx src/components/analytics/AovByChannel.tsx
git commit -m "feat(80.1): migrate UnitsPerTxn + AovByChannel to shared primitives"
```

---

### Task 18: Quick sweep — remaining non-chart widgets (KpiRow, ChannelSparklineTable, TakeRateTable)

These don't use Recharts but may have tooltip or contrast issues. Quick audit.

**Files:**
- Modify (if needed): `src/components/analytics/KpiRow.tsx`
- Modify (if needed): `src/components/analytics/ChannelSparklineTable.tsx`
- Modify (if needed): `src/components/analytics/TakeRateTable.tsx`

- [ ] **Step 18.1: Audit each file**

```bash
cat src/components/analytics/KpiRow.tsx src/components/analytics/ChannelSparklineTable.tsx src/components/analytics/TakeRateTable.tsx
```

Look for:
- Hardcoded `Rp` formatting that should use `formatCurrencyCompact` or `formatCurrency`
- Tooltips or popovers with hardcoded colors
- Truncation/ellipsis of text without hover reveal

- [ ] **Step 18.2: Apply minimal fixes**

Only touch what actually has a defect. Do not refactor working code.

- [ ] **Step 18.3: Type-check + tests**

```bash
npm run type-check && npm run test
```

- [ ] **Step 18.4: Commit (skip if nothing changed)**

```bash
git diff --stat src/components/analytics/
# If changes: git add && git commit -m "fix(80.1): tidy non-chart widgets for consistency"
```

**End of Wave B. Push checkpoint.**

```bash
git push
```

---

## Wave C — Nivo Adoption + Lazy-load + Wrapper Cleanup

### Task 19: Install `@nivo/core` + `@nivo/heatmap`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 19.1: Install**

```bash
npm install @nivo/core @nivo/heatmap
```

- [ ] **Step 19.2: Verify `package.json` entries**

```bash
grep nivo package.json
```
Expected: both deps listed with pinned version (no `^` caret). If caret present, edit manually:
```json
"@nivo/core": "0.90.0",
"@nivo/heatmap": "0.90.0"
```
(Replace versions with whatever npm actually installed.) Then `npm install` again to rewrite lock.

- [ ] **Step 19.3: Build verify**

```bash
npm run build
```
Expected: succeeds. If `vite-plugin-bundlesize` fails, note current vendor-chunk size, then bump the cap by the minimum needed in `vite.config.ts`. Document the bump in the PR body (per user memory `feedback_vendor_bundle_cap`).

- [ ] **Step 19.4: Commit**

```bash
git add package.json package-lock.json vite.config.ts 2>/dev/null
git commit -m "chore(80.1): add @nivo/core + @nivo/heatmap for /analytics heatmaps"
```

---

### Task 20: Migrate `DayHourHeatmap.tsx` to Nivo

**Files:**
- Modify: `src/components/analytics/DayHourHeatmap.tsx`

- [ ] **Step 20.1: Read current file**

```bash
cat src/components/analytics/DayHourHeatmap.tsx
```
Note the data shape returned by `useDayHourHeatmap()` — `{ rowLabels, colLabels, grid, max }` or similar. The reducer output is the source of truth.

- [ ] **Step 20.2: Rewrite with Nivo**

Replace contents with:
```tsx
import { useMemo } from "react";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import { useDayHourHeatmap } from "@/hooks/convex/useAnalytics";
import { ChartFrame, ChartTooltip, formatCurrencyCompact } from "@/lib/chartPrimitives";

export function DayHourHeatmap() {
  const data = useDayHourHeatmap();

  const transformed = useMemo(() => {
    if (!data) return [];
    // Existing "collapseOvernight" logic — preserve the current 6-row display.
    // Copy the collapseOvernight function from the pre-migration file if still needed,
    // or move that logic into the reducer (Wave A already extracted it).
    const { rowLabels, colLabels, grid } = data;
    return rowLabels.map((row, r) => ({
      id: row,
      data: colLabels.map((col, c) => ({ x: col, y: grid[r][c] ?? 0 })),
    }));
  }, [data]);

  if (data === undefined) {
    return <ChartFrame title="Day × Hour heatmap" loading>{null}</ChartFrame>;
  }

  return (
    <ChartFrame title="Day × Hour heatmap" height={360}>
      <ResponsiveHeatMap
        data={transformed}
        margin={{ top: 20, right: 30, bottom: 48, left: 80 }}
        valueFormat={(v) => formatCurrencyCompact(Number(v))}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickRotation: 0,
          legend: "Hour (WIB)",
          legendPosition: "middle",
          legendOffset: 36,
        }}
        axisLeft={{ legend: "Day", legendPosition: "middle", legendOffset: -60 }}
        colors={{ type: "quantize", scheme: "purples", steps: 5 }}
        emptyColor="hsl(var(--muted))"
        labelTextColor={{ from: "color", modifiers: [["darker", 3]] }}
        tooltip={({ cell }) => (
          <ChartTooltip
            active
            payload={[{ name: `${cell.serieId} ${cell.data.x}`, value: Number(cell.value ?? 0) }]}
          />
        )}
        theme={{
          text: { fill: "hsl(var(--foreground))" },
          axis: { ticks: { text: { fill: "hsl(var(--muted-foreground))" } } },
        }}
      />
    </ChartFrame>
  );
}
```

**Note:** If the existing `collapseOvernight` display transform is desired, port that logic into the reducer during Wave A Task 2 (one more round-trip) OR leave the transform inside the component via `useMemo`. Decide based on where it fits cleanly.

- [ ] **Step 20.3: Visual check**

Open `/analytics`. Verify:
- Heatmap renders with same color scale intent as before
- Hover shows tooltip with formatted currency (`Rp 1,2jt` etc.)
- Axis labels visible + WIB-labeled
- Cell text legible against cell backgrounds (Nivo's `labelTextColor` auto-adapts)

- [ ] **Step 20.4: Type-check + tests**

```bash
npm run type-check && npm run test
```

- [ ] **Step 20.5: Commit**

```bash
git add src/components/analytics/DayHourHeatmap.tsx
git commit -m "feat(80.1): migrate DayHourHeatmap to @nivo/heatmap"
```

---

### Task 21: Migrate `SkuChannelHeatmap.tsx` to Nivo

**Files:**
- Modify: `src/components/analytics/SkuChannelHeatmap.tsx`

- [ ] **Step 21.1: Read + rewrite**

Follow the same Nivo pattern as Task 20. Data shape is `{ rows, cols, grid }` where `rows = SKU names`, `cols = channel names`. Apply:
- `data = rows.map(sku => ({ id: sku, data: cols.map((ch, i) => ({ x: ch, y: grid[rowIdx][i] })) }))`
- Truncate SKU names via `truncateWithTooltip(sku, 22)` for Y-axis display; full name in tooltip
- `ChartTooltip` wrapping Nivo's tooltip
- `ChartFrame title="SKU × Channel heatmap" height={400}`

- [ ] **Step 21.2: Visual check**

Open `/analytics`. Verify SKU rows + channel columns render, labels readable, tooltip correct.

- [ ] **Step 21.3: Type-check + tests**

```bash
npm run type-check && npm run test
```

- [ ] **Step 21.4: Commit**

```bash
git add src/components/analytics/SkuChannelHeatmap.tsx
git commit -m "feat(80.1): migrate SkuChannelHeatmap to @nivo/heatmap"
```

---

### Task 22: Lazy-load the `/analytics` route

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 22.1: Read current `App.tsx`**

```bash
grep -n "AnalyticsDashboard" src/App.tsx
```
Locate the import + route definition.

- [ ] **Step 22.2: Convert to lazy**

Change:
```tsx
import { AnalyticsDashboard } from "./pages/AnalyticsDashboard";
```
To:
```tsx
const AnalyticsDashboard = React.lazy(() =>
  import("./pages/AnalyticsDashboard").then((m) => ({ default: m.AnalyticsDashboard })),
);
```

Wrap the route element:
```tsx
<Route
  path="/analytics"
  element={
    <ProtectedRoute permission="canAccessDashboard">
      <React.Suspense fallback={<div className="p-6">Loading analytics…</div>}>
        <AnalyticsDashboard />
      </React.Suspense>
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 22.3: Verify lazy chunk**

```bash
npm run build
```
Expected: build output shows a separate chunk for `AnalyticsDashboard` (something like `AnalyticsDashboard-<hash>.js`). Grep the build output to confirm.

- [ ] **Step 22.4: Visual check**

```bash
npm run dev
```
Open DevTools Network tab. Navigate to `/dashboard` first. Confirm no Nivo-related JS downloads. Then navigate to `/analytics`. Confirm `AnalyticsDashboard` + Nivo chunk loads now.

- [ ] **Step 22.5: Commit**

```bash
git add src/App.tsx
git commit -m "perf(80.1): lazy-load /analytics route (Nivo chunk deferred)"
```

---

### Task 23: Delete deprecated wrapper queries + stale wrapper tests

**Files:**
- Modify: `convex/reports/unitEconomics.ts`
- Modify: `tests/convex/unitEconomics.test.ts`

- [ ] **Step 23.1: Verify frontend no longer references the deprecated queries**

```bash
grep -rn "api.reports.unitEconomics.kpiSummary\|api.reports.unitEconomics.channelEconomics\|api.reports.unitEconomics.channelMomentum\|api.reports.unitEconomics.byWeekday\|api.reports.unitEconomics.rollingTrend\|api.reports.unitEconomics.dayHourHeatmap\|api.reports.unitEconomics.volumeByType\|api.reports.unitEconomics.typeMixOverTime\|api.reports.unitEconomics.unitsPerTxnByChannel\|api.reports.unitEconomics.aovByChannel\|api.reports.unitEconomics.skuPareto\|api.reports.unitEconomics.skuChannelMatrix" src/
```
Expected: no matches (hooks only reference the 3 snapshot queries now).

If any match exists, migrate that caller to use a snapshot hook first, then return to this task.

- [ ] **Step 23.2: Delete the 11 wrapper exports**

Open `convex/reports/unitEconomics.ts`. Remove these 11 `export const` blocks (they became thin wrappers in Task 7):
- `kpiSummary`
- `channelEconomics`
- `channelMomentum`
- `byWeekday`
- `rollingTrend`
- `dayHourHeatmap`
- `volumeByType`
- `typeMixOverTime`
- `unitsPerTxnByChannel`
- `aovByChannel`
- `skuPareto`
- `skuChannelMatrix`

Leave the 3 snapshot queries (`kpiAndChannelSnapshot`, `timeSeriesSnapshot`, `skuSnapshot`) intact. Keep the reducers + helpers.

- [ ] **Step 23.3: Remove stale wrapper tests**

Open `tests/convex/unitEconomics.test.ts`. Remove or port tests that call the deleted queries. Tests calling reducers stay. Tests calling snapshot queries stay. Tests calling the removed wrappers — port to calling the relevant snapshot and asserting on its field, OR delete if redundant with existing reducer tests.

Rule of thumb: each test must now call either a reducer, a snapshot, `loadFilteredData`, or `precomputeBomMaps`. Anything else is stale.

- [ ] **Step 23.4: Regenerate API + run full test suite**

```bash
npx convex dev --once --typecheck-components
npm run type-check
npm run test
```

All PASS expected. If tests fail because they referenced deleted queries, remove those tests (they're validating removed surface).

- [ ] **Step 23.5: Commit**

```bash
git add convex/reports/unitEconomics.ts convex/_generated/ tests/convex/unitEconomics.test.ts
git commit -m "refactor(80.1): remove deprecated 11 analytics query wrappers"
```

---

### Task 24: Docs + HUMAN-UAT checklist

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/API_REFERENCE.md`
- Modify: `docs/ROADMAP.md`
- Create: `.planning/phases/80.1-analytics-perf-consolidation/80.1-HUMAN-UAT.md`

- [ ] **Step 24.1: Update `docs/CHANGELOG.md`**

Append under the current unreleased or latest-version heading:
```markdown
## Phase 80.1 — Analytics Dashboard Perf & Chart Primitives Consolidation (2026-04-XX)

- **Perf:** `/analytics` now uses 3 grouped snapshot queries (`kpiAndChannelSnapshot`, `timeSeriesSnapshot`, `skuSnapshot`) instead of 11 per-widget queries. Filter changes trigger 3 subscriptions, not 11. `orders`-write re-invalidation surface cut by ~73%.
- **UX:** Shared `ChartFrame` / `ChartTooltip` / `ChartAxis` primitives enforce WCAG-AA tooltip contrast + no-clip axis labels + truncation-with-hover-reveal across all 13 analytics widgets.
- **Library:** Added `@nivo/heatmap` for `DayHourHeatmap` + `SkuChannelHeatmap`. Other charts remain on Recharts.
- **Perf:** `/analytics` route is now `React.lazy` — Nivo chunk only loads when the page is visited.
- **Cleanup:** Removed 11 deprecated per-widget query wrappers from `convex/reports/unitEconomics.ts`. Inlined `jakartaHour` helper — call sites use `getWibComponents(ts).hour` directly.
```

- [ ] **Step 24.2: Update `docs/API_REFERENCE.md`**

Find the `convex/reports/unitEconomics.ts` section. Document the 3 new snapshot queries with their args + return shapes. Mark the 11 removed queries as deleted:

```markdown
### `reports.unitEconomics`

**Current queries:**
- `kpiAndChannelSnapshot(fromTs, toTs, channels?, menuProductIds?)` → `{ kpi, channelEconomics, channelMomentum, channelSparklines }`
- `timeSeriesSnapshot(fromTs, toTs, channels?, menuProductIds?)` → `{ byWeekday, rollingTrend, dayHourHeatmap, volumeByType: { day, week }, typeMixOverTime: { day, week } }`
- `skuSnapshot(fromTs, toTs, channels?, menuProductIds?)` → `{ skuTop, skuChannelMatrix, revPerUnit, unitsByTypeStackedBars }` — `skuTop` is capped at 20 rows; client slices for display topN.

**Removed in Phase 80.1:** `kpiSummary`, `channelEconomics`, `channelMomentum`, `byWeekday`, `rollingTrend`, `dayHourHeatmap`, `volumeByType`, `typeMixOverTime`, `unitsPerTxnByChannel`, `aovByChannel`, `skuPareto`, `skuChannelMatrix`. Consumers migrate to the 3 snapshots above.
```

- [ ] **Step 24.3: Update `docs/ROADMAP.md`**

Find the Phase 80.1 entry (inserted in v2.0 milestone pre-implementation). Mark it complete: flip the checkbox from `[ ]` to `[x]`, flip the Progress-table row from "Not started" to "Complete", and add the completion date to match other phases' format.

- [ ] **Step 24.4: Create HUMAN-UAT file**

Create `.planning/phases/80.1-analytics-perf-consolidation/80.1-HUMAN-UAT.md`:
```markdown
---
status: pending
phase: 80.1-analytics-perf-consolidation
started: 2026-04-XX
---

## Tests

### 1. Filter latency
expected: Open /analytics on production data. Change date range (30d → 7d). Dashboard refreshes all widgets smoothly with no flicker.
result: [pending]

### 2. Channel filter
expected: Change channel filter. Dashboard re-renders within 1 second.
result: [pending]

### 3. Granularity toggle
expected: Toggle volume-by-type granularity (day ↔ week). Only time-series widgets re-render; KPI + SKU widgets stay stable (no flicker).
result: [pending]

### 4. DayHourHeatmap render
expected: Heatmap shows WIB hour axis + day axis, every cell tooltip shows on hover with currency value.
result: [pending]

### 5. SkuChannelHeatmap render
expected: Heatmap shows SKU names on Y-axis (truncated where long), channel names on X-axis, tooltip shows full SKU name.
result: [pending]

### 6. Lazy-load verification
expected: DevTools Network tab. Load /dashboard first. No Nivo chunk loaded. Navigate to /analytics. Nivo chunk loads on demand.
result: [pending]

### 7. R1 — axis label readability
expected: For every chart with string X-axis labels, hover every label. Every truncated label reveals full text in tooltip. No silent "…".
result: [pending]

### 8. R2 — tooltip contrast
expected: Hover every data point on every chart. Every tooltip has dark background + light text. All values legible at a glance.
result: [pending]

### 9. Mobile/narrow viewport
expected: Narrow browser to 375px width. Every chart either scrolls horizontally OR adapts labels. No chart silently drops ticks.
result: [pending]

### 10. Contrast spot-check
expected: Open any tooltip in DevTools. Accessibility inspector confirms ≥4.5:1 contrast on title + every value row.
result: [pending]
```

- [ ] **Step 24.5: Commit docs**

```bash
git add docs/CHANGELOG.md docs/API_REFERENCE.md docs/ROADMAP.md .planning/phases/80.1-analytics-perf-consolidation/80.1-HUMAN-UAT.md
git commit -m "docs(80.1): document snapshot queries + changelog + HUMAN-UAT checklist"
```

---

## Final Verification

- [ ] **Type check**

```bash
npm run type-check
```
Expected: 0 errors.

- [ ] **Full build**

```bash
npm run build
```
Expected: succeeds within vendor-bundle cap. Document any cap bump in PR body.

- [ ] **Full test suite**

```bash
npm run test
```
Expected: all tests pass, including new reducer + snapshot + call-counter + contrast tests.

- [ ] **Manual smoke test**

Run `npm run dev` + `npx convex dev`. Open `/analytics` on the dev dataset. Complete HUMAN-UAT tests 1, 4, 5, 7, 8 manually.

- [ ] **Push final**

```bash
git push
```

- [ ] **Ready for PR**

Branch: `gsd/phase-80.1-analytics-perf-consolidation`. Title: `feat(80.1): analytics dashboard perf + chart primitives consolidation`. Body summarizes the 3 waves + bundle-cap delta.

---

## Self-Review Summary

**Spec coverage:**
- I-04 (reactive fan-out) → Tasks 1–8 (reducers, precompute, 3 snapshots, wrappers, call-counter test) ✓
- R1 (no-clip labels) → Task 12 (`CHART_MARGIN`, `X_AXIS_STRING_LABEL_PROPS`), Tasks 14–17 (widget migrations apply them), Task 10 (`truncateWithTooltip`) ✓
- R2 (WCAG AA tooltip contrast) → Task 11 (`ChartTooltip` + contrast test), Tasks 14–17 (widgets adopt it) ✓
- R3 (Nivo heatmap contrast) → Tasks 20–21 (`labelTextColor` + `tooltip` wrapper) ✓
- Nivo adoption + lazy-load → Tasks 19, 20, 21, 22 ✓
- Wrapper cleanup → Task 23 ✓
- M-03 `jakartaHour` cleanup → Task 9 ✓
- M-02 shared colors → already done in codebase; acknowledged in plan header, no task needed
- Docs → Task 24 ✓
- HUMAN-UAT → Task 24.4 ✓

**Placeholders:** None. All steps show code or commands.

**Type consistency:** `reduceKpi`, `reduceSkuTop`, `Precomputed`, `WindowData` names used consistently across Tasks 1–8. Hook names consistent between Task 13 (definition) and Tasks 14–17 (consumption). `CHART_MARGIN` and `X_AXIS_STRING_LABEL_PROPS` named identically in Task 12 (def) and Tasks 14–17 (use). `truncateWithTooltip` returns `{ display, full }` — consistent in Task 10 (def), Task 14 (use), Task 21 (use).

**Gaps:** None identified.
