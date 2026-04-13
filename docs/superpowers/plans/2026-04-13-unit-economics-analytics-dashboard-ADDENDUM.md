# Addendum: Staff Review Fixes for Unit Economics Analytics Plan

**Parent plan:** `2026-04-13-unit-economics-analytics-dashboard.md`
**Review:** `docs/reviews/staffreview-unit-economics-analytics-dashboard-2026-04-13.md`
**Status:** Supersedes conflicting sections of the parent plan. Where both documents disagree, **this addendum wins**.

This addendum addresses all 4 Critical issues + 6 Improvements + adds unit tests for every backend query plus frontend component smoke tests.

---

## Revised Wave Table (replaces parent §"Implementation Waves")

### Wave 1: Backend [SEQUENTIAL — tasks append to the same file]

| Order | Agent | Task | Files |
|---|---|---|---|
| 1 | convex-backend | **T1** helpers (production-unit + revenue + channel taxonomy + extend platformColors) | `convex/reports/productionUnitHelpers.ts`, `convex/reports/revenueHelpers.ts`, `convex/reports/channelTaxonomy.ts`, `src/lib/platformColors.ts` (extend) |
| 2 | convex-backend | **T1.5** add `by_completed_at` + `by_order_date` indexes on orders | `convex/schema.ts` |
| 3 | convex-backend | **T1.6** migrate dispatchPlanner off hardcoded BIG_BALL/MID_BALL | `convex/dispatchPlanner/queries.ts` |
| 4 | convex-backend | **T2** kpiSummary + index-bounded loader | `convex/reports/unitEconomics.ts` (create) |
| 5 | convex-backend | **T3** time-pattern queries | append |
| 6 | convex-backend | **T4** channel-economics queries | append |
| 7 | convex-backend | **T5** volume/mix queries | append |
| 8 | convex-backend | **T6** concentration queries | append |
| 9 | convex-backend | **T7** momentum queries | append |

### Wave 2: Frontend [PARALLEL after Wave 1]
Same as parent plan — except **T13 Step 3** must edit BOTH `src/components/layout/Header.tsx` AND `src/components/layout/MobileBottomNav.tsx` (confirmed via grep for `SalesAnalytics`). Use `BarChart3` icon, label "Analytics", route `/analytics`.

### Wave 3: Verification [SEQUENTIAL]
| Agent | Task |
|---|---|
| tdd-test-architect | **T14** backend integration tests (expanded — all 11 queries) |
| tdd-test-architect | **T14.5** frontend smoke tests (NEW) |
| code-auditor | **T15** type check + pattern compliance |
| Bash | **T16** `npm run build` + docs + PR |

---

## T1 (REVISED) — Helpers

### Step 1: `convex/reports/productionUnitHelpers.ts`
Same as parent plan — no changes.

### Step 2 (NEW): `convex/reports/revenueHelpers.ts`

```typescript
import type { Doc } from "../_generated/dataModel";

/**
 * Revenue math is derived from DENORMALIZED orderItems fields —
 * NEVER recompute `quantity * unitPrice - discountAmount` manually. Schema:
 *   lineTotal  = quantity * unitPrice - discountAmount  (post-discount, pre-fees)
 *   lineCost   = quantity * unitCost
 *   lineMargin = lineTotal - lineCost
 * If discount rules change, they change in one place (mutations), not here.
 */
export function itemNetRevenue(it: Doc<"orderItems">): number {
  return it.lineTotal;
}
export function itemGrossRevenue(it: Doc<"orderItems">): number {
  return it.lineTotal + (it.discountAmount ?? 0);
}
export function itemDiscount(it: Doc<"orderItems">): number {
  return it.discountAmount ?? 0;
}
```

### Step 3 (NEW): Extend `src/lib/platformColors.ts`

Add display-channel aggregates to the existing `PALETTE` record so analytics widgets reuse the single source of truth. Insert after the existing raw-source entries (`bigseller`), using the same `PlatformPalette` shape:

```typescript
  // --- Display-channel aggregates used by AnalyticsDashboard ---
  Shopee:      { hex: "#f97316", borderTop: "border-t-orange-500", borderLeft: "border-l-orange-500", dot: "bg-orange-500", hoverBg: "hover:bg-orange-50 dark:hover:bg-orange-950/20", badgeBorder: "border-orange-500 dark:border-orange-600", badgeText: "text-orange-700 dark:text-orange-400" },
  Tokopedia:   { hex: "#ef4444", borderTop: "border-t-red-500",    borderLeft: "border-l-red-500",    dot: "bg-red-500",    hoverBg: "hover:bg-red-50 dark:hover:bg-red-950/20",    badgeBorder: "border-red-500 dark:border-red-600",    badgeText: "text-red-700 dark:text-red-400" },
  GoFood:      { hex: "#22c55e", borderTop: "border-t-green-500",  borderLeft: "border-l-green-500",  dot: "bg-green-500",  hoverBg: "hover:bg-green-50 dark:hover:bg-green-950/20", badgeBorder: "border-green-500 dark:border-green-600", badgeText: "text-green-700 dark:text-green-400" },
  K3Mart:      { hex: "#3b82f6", borderTop: "border-t-blue-500",   borderLeft: "border-l-blue-500",   dot: "bg-blue-500",   hoverBg: "hover:bg-blue-50 dark:hover:bg-blue-950/20",   badgeBorder: "border-blue-500 dark:border-blue-600",   badgeText: "text-blue-700 dark:text-blue-400" },
  Direct:      { hex: "#10b981", borderTop: "border-t-emerald-500",borderLeft: "border-l-emerald-500",dot: "bg-emerald-500",hoverBg: "hover:bg-emerald-50 dark:hover:bg-emerald-950/20",badgeBorder: "border-emerald-500 dark:border-emerald-600",badgeText: "text-emerald-700 dark:text-emerald-400" },
  Consignment: { hex: "#a855f7", borderTop: "border-t-purple-500", borderLeft: "border-l-purple-500", dot: "bg-purple-500", hoverBg: "hover:bg-purple-50 dark:hover:bg-purple-950/20", badgeBorder: "border-purple-500 dark:border-purple-600", badgeText: "text-purple-700 dark:text-purple-400" },
  TikTok:      { hex: "#8b5cf6", borderTop: "border-t-violet-500", borderLeft: "border-l-violet-500", dot: "bg-violet-500", hoverBg: "hover:bg-violet-50 dark:hover:bg-violet-950/20", badgeBorder: "border-violet-500 dark:border-violet-600", badgeText: "text-violet-700 dark:text-violet-400" },
  Other:       { hex: "#64748b", borderTop: "border-t-slate-500",  borderLeft: "border-l-slate-500",  dot: "bg-slate-500",  hoverBg: "hover:bg-slate-50 dark:hover:bg-slate-950/20", badgeBorder: "border-slate-500 dark:border-slate-600", badgeText: "text-slate-700 dark:text-slate-400" },
```

### Step 4 (RENUMBERED from parent Step 1): `convex/reports/channelTaxonomy.ts`
Same content as parent plan — just runs after the revenue helpers and platformColors extension.

### Step 5 (RENUMBERED): Commit

```bash
git add convex/reports/productionUnitHelpers.ts convex/reports/revenueHelpers.ts convex/reports/channelTaxonomy.ts src/lib/platformColors.ts
git commit -m "feat(analytics): helpers — dynamic production-unit BOM + revenue derivation + channel taxonomy + platform color aggregates"
```

---

## T1.5 (NEW) — Index on orders

### Step 1: Extend orders schema

In `convex/schema.ts`, locate the `orders: defineTable({...})` block. After the existing `.index("by_kitchen_visible", ...)`, append:

```typescript
    .index("by_completed_at", ["completedAt"])
    .index("by_order_date", ["orderDate"])
```

### Step 2: Regenerate types

```bash
npx convex dev --once
```

Expect `convex/_generated/api.d.ts` to regenerate.

### Step 3: Commit

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(analytics): add by_completed_at + by_order_date indexes on orders — enables bounded date-range scans"
```

---

## T1.6 (NEW) — Migrate dispatchPlanner

### Step 1: Add import in `convex/dispatchPlanner/queries.ts`

```typescript
import { getProductionUnitsByTypePerProduct } from "../reports/productionUnitHelpers";
```

### Step 2: Replace the hardcoded accumulator

In `convex/dispatchPlanner/queries.ts`, replace lines ~260-312 (the two `if (ct.code === "BIG_BALL")` blocks and the return):

```typescript
    const { byProduct } = await getProductionUnitsByTypePerProduct(ctx);
    const unitsByType: Record<string, number> = {};
    const packagingMap = new Map<string, number>();

    // Pass 1: dispatch plan entries
    for (const plan of dayPlans) {
      const mpId = plan.menuProductId as string;
      packagingMap.set(mpId, (packagingMap.get(mpId) ?? 0) + plan.plannedQty);
      const perType = byProduct.get(plan.menuProductId);
      if (!perType) continue;
      for (const [code, pcsPerUnit] of perType.entries()) {
        unitsByType[code] = (unitsByType[code] ?? 0) + pcsPerUnit * plan.plannedQty;
      }
    }

    // Pass 2: direct-sales order-derived quantities
    for (const [mpId, qty] of orderProductQty) {
      packagingMap.set(mpId, (packagingMap.get(mpId) ?? 0) + qty);
      const perType = byProduct.get(mpId as Id<"menuProducts">);
      if (!perType) continue;
      for (const [code, pcsPerUnit] of perType.entries()) {
        unitsByType[code] = (unitsByType[code] ?? 0) + pcsPerUnit * qty;
      }
    }

    const packagingBreakdown = Array.from(packagingMap.entries()).map(([menuProductId, quantity]) => ({
      menuProductId,
      quantity,
    }));

    // Backward-compatible return: existing UI consumers still see bigBalls/midBalls.
    // New callers can use unitsByType which includes HAZELNUT_REGULAR and future types.
    return {
      bigBalls: unitsByType["BIG_BALL"] ?? 0,
      midBalls: unitsByType["MID_BALL"] ?? 0,
      unitsByType,
      packagingBreakdown,
    };
```

### Step 3: Verify no consumers break

```bash
grep -rn "bigBalls\|midBalls" src/ convex/
```

Expect the UI consumers (DispatchPlanner.tsx, any kitchen view) still work because the return shape preserves `bigBalls`/`midBalls`.

### Step 4: Run existing dispatchPlanner tests

```bash
npm run test -- convex/dispatchPlanner
```

### Step 5: Commit

```bash
git add convex/dispatchPlanner/queries.ts
git commit -m "refactor(dispatchPlanner): iterate production componentTypes dynamically — closes Hazelnut silent-undercount risk"
```

---

## T2 (REVISED) — Replace `loadFilteredData`

The parent plan's `loadFilteredData` does full-table scans. Replace its body with the index-bounded version below. Everything else in Task 2 (the `computeKpis`, `priorPeriod`, `deltaPct`, `kpiSummary` export) is correct as-is, EXCEPT: swap `grossRevenue += it.quantity * it.unitPrice` and `discount += it.discountAmount ?? 0` for calls to `itemGrossRevenue(it)` / `itemDiscount(it)` / `itemNetRevenue(it)` (see helpers).

### Replacement `loadFilteredData`

```typescript
import { query, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { getProductionUnitsPerProduct, unitsForOrderItem } from "./productionUnitHelpers";
import { itemGrossRevenue, itemNetRevenue, itemDiscount } from "./revenueHelpers";
import { toDisplayChannel, type DisplayChannel } from "./channelTaxonomy";
import { getWibComponents } from "../lib/periodRange";

const filterArgs = {
  fromTs: v.number(),
  toTs: v.number(),
  channels: v.optional(v.array(v.string())),
  menuProductIds: v.optional(v.array(v.id("menuProducts"))),
};
type FilterArgs = {
  fromTs: number; toTs: number;
  channels?: string[]; menuProductIds?: Id<"menuProducts">[];
};

async function loadFilteredData(ctx: QueryCtx, args: FilterArgs) {
  if (args.fromTs >= args.toTs) {
    const unitsPerProduct = await getProductionUnitsPerProduct(ctx);
    return { orders: [] as Doc<"orders">[], items: [] as Doc<"orderItems">[], orderById: new Map<string, Doc<"orders">>(), unitsPerProduct };
  }

  const channelSet = args.channels?.length ? new Set(args.channels) : null;
  const productSet = args.menuProductIds?.length
    ? new Set(args.menuProductIds.map((id) => id as string)) : null;

  // Primary: orders with completedAt in window (index-bounded)
  const byCompleted = await ctx.db
    .query("orders")
    .withIndex("by_completed_at", (q) =>
      q.gte("completedAt", args.fromTs).lt("completedAt", args.toTs))
    .collect();

  // Legacy fallback: orders without completedAt, indexed by orderDate
  const byOrderDate = await ctx.db
    .query("orders")
    .withIndex("by_order_date", (q) =>
      q.gte("orderDate", args.fromTs).lt("orderDate", args.toTs))
    .collect();

  const orders: Doc<"orders">[] = [];
  const seen = new Set<string>();
  for (const o of byCompleted) {
    if (o.status === "Draft" || o.status === "Cancelled") continue;
    if (channelSet && !channelSet.has(toDisplayChannel(o.channel))) continue;
    orders.push(o);
    seen.add(o._id as string);
  }
  for (const o of byOrderDate) {
    if (seen.has(o._id as string)) continue;
    if (o.completedAt !== undefined) continue; // only orders MISSING completedAt
    if (o.status === "Draft" || o.status === "Cancelled") continue;
    if (channelSet && !channelSet.has(toDisplayChannel(o.channel))) continue;
    orders.push(o);
  }

  const orderById = new Map<string, Doc<"orders">>();
  for (const o of orders) orderById.set(o._id as string, o);

  // Fetch items per-order using by_order index (no global orderItems scan)
  const items: Doc<"orderItems">[] = [];
  for (const o of orders) {
    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", o._id))
      .collect();
    for (const it of orderItems) {
      if (it.isCancelled) continue;
      if (productSet && (!it.menuProductId || !productSet.has(it.menuProductId as string))) continue;
      items.push(it);
    }
  }

  const unitsPerProduct = await getProductionUnitsPerProduct(ctx);
  return { orders, items, orderById, unitsPerProduct };
}
```

### Revised `computeKpis`

```typescript
function computeKpis(
  orders: Doc<"orders">[],
  items: Doc<"orderItems">[],
  unitsPerProduct: Map<Id<"menuProducts">, number>,
) {
  let grossRevenue = 0, netRevenue = 0, discount = 0, units = 0;
  for (const it of items) {
    grossRevenue += itemGrossRevenue(it);
    netRevenue += itemNetRevenue(it);
    discount += itemDiscount(it);
    units += unitsForOrderItem(it, unitsPerProduct);
  }
  const orderCount = orders.length;
  return {
    grossRevenue, netRevenue, units, orderCount,
    aovGross: orderCount === 0 ? 0 : grossRevenue / orderCount,
    aovNet: orderCount === 0 ? 0 : netRevenue / orderCount,
    revPerUnit: units === 0 ? 0 : netRevenue / units,
    unitsPerTxn: orderCount === 0 ? 0 : units / orderCount,
  };
}
```

Rest of T2 (priorPeriod, deltaPct, kpiSummary export) is unchanged from parent.

---

## T3–T7 Global Patch: Replace Manual Revenue Math

**Every** occurrence in T3–T7 queries of the form:

```typescript
it.quantity * it.unitPrice                    // → itemGrossRevenue(it)
it.quantity * it.unitPrice - (it.discountAmount ?? 0)  // → itemNetRevenue(it)
it.discountAmount ?? 0                        // → itemDiscount(it)
```

**must** be replaced by the helper calls. This eliminates ~8 sites of duplicate math. Imports at top of `unitEconomics.ts` (shown in T2 above) already cover these.

### T3 Revised: Use periodRange helper

Replace the inline `getJakartaDate` function in T3 Step 1 with:

```typescript
// periodRange already imported in T2
function jakartaMondayIndex(ts: number): number {
  const { dayOfWeek } = getWibComponents(ts); // 0=Sun..6=Sat
  return (dayOfWeek + 6) % 7;                  // Mon=0..Sun=6
}
function jakartaHour(ts: number): number {
  return new Date(ts + 7 * 60 * 60 * 1000).getUTCHours();
}
```

Use `jakartaMondayIndex(ts)` and `jakartaHour(ts)` in both `byWeekday` and `dayHourHeatmap`. Remove the redundant `weekdayIndex` / `binIndex` inline declarations.

### T5 Revised: bucketKey via getWibComponents

Replace the inline `bucketKey` with:

```typescript
function bucketKey(ts: number, granularity: "day" | "week"): string {
  const { year, month, day } = getWibComponents(ts);
  if (granularity === "day") {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }
  // Approximate ISO week — not full RFC 3339, adequate for UI.
  const tmp = new Date(Date.UTC(year, month, day));
  const dow = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
```

### T7 Revised: Adaptive momentum bucket count

Replace the hardcoded `const bucketCount = 6` in `channelMomentum` with:

```typescript
function pickBucketCount(spanMs: number): number {
  const days = spanMs / 86400000;
  if (days <= 14) return 7;   // ~daily for short windows
  if (days <= 90) return 13;  // ~weekly for medium
  return 12;                  // monthly for long
}

export const channelMomentum = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const span = args.toTs - args.fromTs;
    const bucketCount = pickBucketCount(span);
    const bucketSpan = span / bucketCount;
    // …rest unchanged, still reads itemNetRevenue(it) / unitsForOrderItem
```

Return payload — add `bucketCount` for the frontend to label correctly:

```typescript
    return { buckets: bucketCount, channels: Array.from(byChannel.entries()).map(...) };
```

Frontend `ChannelSparklineTable` (T12) must iterate over `data.channels` instead of `data` directly after this change.

---

## T11 & T12 Patch: Use `getPlatformPalette` Instead of Inline Colors

In every widget that has inline `CHANNEL_COLORS` (`RevPerUnitChart.tsx`, `UnitsPerTxnByChannel.tsx`, `AovByChannel.tsx`), replace:

```typescript
const CHANNEL_COLORS: Record<string, string> = { … };
// …
<Cell fill={CHANNEL_COLORS[r.channel] ?? "#8b5cf6"} />
```

With:

```typescript
import { getPlatformPalette } from "@/lib/platformColors";
// …
<Cell fill={getPlatformPalette(r.channel).hex} />
```

For bar charts without per-cell color (e.g., `UnitsPerTxnByChannel`), wrap the single `<Bar>` with per-channel `<Cell>` children:

```typescript
<Bar dataKey="unitsPerTxn">
  {rows.map((r) => <Cell key={r.channel} fill={getPlatformPalette(r.channel).hex} />)}
  <LabelList dataKey="unitsPerTxn" position="top" />
</Bar>
```

**Type-only (BIG_BALL/MID_BALL/HAZELNUT) colors** in `UnitsByTypeStackedBars.tsx` and `TypeMixOverTime.tsx` stay local (they are product-level, not channel-level) but extract into a small `TYPE_COLOR_FALLBACK` array constant at module top for clarity.

---

## T13 Patch: Nav Files

T13 Step 3 (nav entry) must edit BOTH:
- `src/components/layout/Header.tsx` (desktop)
- `src/components/layout/MobileBottomNav.tsx` (mobile)

Find the existing `SalesAnalytics` link block in each file and add an Analytics entry using the same pattern. Icon: `BarChart3` from `lucide-react`. Label: "Analytics". Route: `/analytics`.

Verify visually with `npm run dev` at both desktop and mobile viewports.

---

## T10 Fragment Key Fix (DayHourHeatmap)

The parent T10 Step 3 `DayHourHeatmap` uses unkeyed `<>…</>` fragments in a row loop. Replace:

```tsx
{data.rowLabels.map((row, ri) => (
  <>
    <div key={"row-" + row} …>{row}</div>
    {data.grid[ri].map(...)}
  </>
))}
```

With `<React.Fragment key={row}>`:

```tsx
{data.rowLabels.map((row, ri) => (
  <React.Fragment key={row}>
    <div className="flex items-center justify-end pr-1 text-muted-foreground">{row}</div>
    {data.grid[ri].map((val, ci) => (
      <div
        key={`${ri}-${ci}`}
        className={`aspect-square rounded ${intensityClass(val, data.max)}`}
        title={`${row} ${data.colLabels[ci]}: ${formatCurrency(val)}`}
      />
    ))}
  </React.Fragment>
))}
```

Add `import { Fragment } from "react";` to the imports.

---

## T14 (EXPANDED) — Backend Integration Tests

The parent plan has 5 test cases. Add the following cases to `tests/convex/unitEconomics.test.ts`:

### Test 6: `volumeByType` includes Hazelnut lane

```typescript
describe("unitEconomics.volumeByType", () => {
  test("Hazelnut-Regular appears as a distinct series", async () => {
    const t = convexTest(schema);
    const { hazelnutId } = await seedBaseFixtures(t);
    const mp = await t.run(async (ctx) => ctx.db.insert("menuProducts", {
      name: "Hazelnut Single", category: "finished", defaultPrice: 50000, unitCost: 0, isActive: true,
    }));
    await t.run(async (ctx) => ctx.db.insert("menuProductComponents", {
      menuProductId: mp, componentTypeId: hazelnutId, quantity: 1,
    }));
    const customerId = await t.run(async (ctx) => ctx.db.insert("customers", { name: "T", phone: "" }));
    const ts = Date.now() - 86400000;
    const orderId = await t.run(async (ctx) => ctx.db.insert("orders", {
      orderNumber: "h1", customerId, customerName: "T", status: "Complete",
      orderDate: ts, completedAt: ts, deliveryType: "Pickup",
    }));
    await t.run(async (ctx) => ctx.db.insert("orderItems", {
      orderId, productName: "Hazelnut Single", quantity: 4, unitPrice: 50000, unitCost: 0,
      discountAmount: 0, lineTotal: 200000, lineCost: 0, lineMargin: 200000, menuProductId: mp,
    }));
    const res = await t.query(api.reports.unitEconomics.volumeByType, {
      fromTs: ts - 1000, toTs: Date.now() + 1000, granularity: "day",
    });
    const series = res.series.find((s) => s.code === "HAZELNUT_REGULAR");
    expect(series).toBeDefined();
    expect(series!.values.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
```

### Test 7: `channelEconomics` take-rate math

```typescript
describe("unitEconomics.channelEconomics", () => {
  test("takePct reflects discount / gross", async () => {
    const t = convexTest(schema);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await t.run(async (ctx) => ctx.db.insert("menuProducts", {
      name: "Original", category: "finished", defaultPrice: 30000, unitCost: 0, isActive: true,
    }));
    await t.run(async (ctx) => ctx.db.insert("menuProductComponents", {
      menuProductId: mp, componentTypeId: bigBallId, quantity: 1,
    }));
    const customerId = await t.run(async (ctx) => ctx.db.insert("customers", { name: "T", phone: "" }));
    const ts = Date.now() - 86400000;
    const orderId = await t.run(async (ctx) => ctx.db.insert("orders", {
      orderNumber: "s1", customerId, customerName: "T", status: "Complete",
      orderDate: ts, completedAt: ts, deliveryType: "Pickup", channel: "shopee",
    }));
    // Gross 100k, discount 20k → takePct = 20%
    await t.run(async (ctx) => ctx.db.insert("orderItems", {
      orderId, productName: "Original", quantity: 4, unitPrice: 25000, unitCost: 0,
      discountAmount: 20000, lineTotal: 80000, lineCost: 0, lineMargin: 80000, menuProductId: mp,
    }));
    const rows = await t.query(api.reports.unitEconomics.channelEconomics, {
      fromTs: ts - 1000, toTs: Date.now() + 1000,
    });
    const shopee = rows.find((r) => r.channel === "Shopee");
    expect(shopee).toBeDefined();
    expect(shopee!.gross).toBe(100000);
    expect(shopee!.discount).toBe(20000);
    expect(shopee!.takePct).toBeCloseTo(20, 1);
    expect(shopee!.netPerUnit).toBe(20000); // 80k / 4 units
  });
});
```

### Test 8: `skuPareto` cumulativePct monotonic + "Other" bucket

```typescript
describe("unitEconomics.skuPareto", () => {
  test("top 10 + Other, cumulativePct runs 0→100", async () => {
    const t = convexTest(schema);
    const { bigBallId } = await seedBaseFixtures(t);
    const customerId = await t.run(async (ctx) => ctx.db.insert("customers", { name: "T", phone: "" }));
    const ts = Date.now() - 86400000;
    const orderId = await t.run(async (ctx) => ctx.db.insert("orders", {
      orderNumber: "p1", customerId, customerName: "T", status: "Complete",
      orderDate: ts, completedAt: ts, deliveryType: "Pickup",
    }));
    for (let i = 0; i < 12; i++) {
      const mp = await t.run(async (ctx) => ctx.db.insert("menuProducts", {
        name: `P${i}`, category: "finished", defaultPrice: 10000, unitCost: 0, isActive: true,
      }));
      await t.run(async (ctx) => ctx.db.insert("menuProductComponents", {
        menuProductId: mp, componentTypeId: bigBallId, quantity: 1,
      }));
      await t.run(async (ctx) => ctx.db.insert("orderItems", {
        orderId, productName: `P${i}`, quantity: 12 - i, unitPrice: 10000, unitCost: 0,
        discountAmount: 0, lineTotal: (12 - i) * 10000, lineCost: 0, lineMargin: (12 - i) * 10000,
        menuProductId: mp,
      }));
    }
    const { rows } = await t.query(api.reports.unitEconomics.skuPareto, {
      fromTs: ts - 1000, toTs: Date.now() + 1000, topN: 10,
    });
    expect(rows.length).toBe(11); // 10 top + Other
    expect(rows[10].name).toBe("Other");
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].cumulativePct).toBeGreaterThanOrEqual(rows[i - 1].cumulativePct);
    }
    expect(rows[rows.length - 1].cumulativePct).toBeCloseTo(100, 1);
  });
});
```

### Test 9: `rollingTrend` 7d/28d windowing

```typescript
describe("unitEconomics.rollingTrend", () => {
  test("rolling7[i] = mean of last 7 daily values", async () => {
    const t = convexTest(schema);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await t.run(async (ctx) => ctx.db.insert("menuProducts", {
      name: "Original", category: "finished", defaultPrice: 30000, unitCost: 0, isActive: true,
    }));
    await t.run(async (ctx) => ctx.db.insert("menuProductComponents", {
      menuProductId: mp, componentTypeId: bigBallId, quantity: 1,
    }));
    const customerId = await t.run(async (ctx) => ctx.db.insert("customers", { name: "T", phone: "" }));
    const now = Date.now();
    // Seed 10 days × Rp 30_000 net each (1 unit/day)
    for (let d = 9; d >= 0; d--) {
      const ts = now - d * 86400000;
      const orderId = await t.run(async (ctx) => ctx.db.insert("orders", {
        orderNumber: `d${d}`, customerId, customerName: "T", status: "Complete",
        orderDate: ts, completedAt: ts, deliveryType: "Pickup",
      }));
      await t.run(async (ctx) => ctx.db.insert("orderItems", {
        orderId, productName: "Original", quantity: 1, unitPrice: 30000, unitCost: 0,
        discountAmount: 0, lineTotal: 30000, lineCost: 0, lineMargin: 30000, menuProductId: mp,
      }));
    }
    const res = await t.query(api.reports.unitEconomics.rollingTrend, {
      fromTs: now - 10 * 86400000, toTs: now + 1000,
    });
    expect(res.daily.every((v) => v === 30000)).toBe(true);
    // Last rolling7 should equal 30000 (mean of seven 30000s)
    expect(res.rolling7[res.rolling7.length - 1]).toBeCloseTo(30000, 1);
  });
});
```

### Test 10: dispatchPlanner regression (Hazelnut present)

Add in `tests/convex/dispatchPlanner.test.ts` (new file if absent):

```typescript
import { expect, test, describe } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

describe("dispatchPlanner.getProductionRequirements (T1.6 regression guard)", () => {
  test("returns unitsByType including HAZELNUT_REGULAR", async () => {
    const t = convexTest(schema);
    const hazelnutId = await t.run(async (ctx) => ctx.db.insert("componentTypes", {
      name: "Hazelnut-Regular", code: "HAZELNUT_REGULAR", category: "production", unit: "pcs", sortOrder: 3,
    }));
    const mp = await t.run(async (ctx) => ctx.db.insert("menuProducts", {
      name: "Hazelnut Single", category: "finished", defaultPrice: 50000, unitCost: 0, isActive: true,
    }));
    await t.run(async (ctx) => ctx.db.insert("menuProductComponents", {
      menuProductId: mp, componentTypeId: hazelnutId, quantity: 1,
    }));
    // Note: you may need to seed a dispatchPlan row — inspect the query's args signature
    // and add minimal fixtures to satisfy it. The assertion that matters:
    //   result.unitsByType.HAZELNUT_REGULAR > 0 when Hazelnut orders exist
  });
});
```

(This test is a scaffold — executor should adapt it to the exact query signature in `dispatchPlanner/queries.ts` after reading the file.)

### Commit for expanded tests

```bash
git add tests/convex/unitEconomics.test.ts tests/convex/dispatchPlanner.test.ts
git commit -m "test(analytics): expanded backend tests — volumeByType Hazelnut, takePct, pareto Other, rolling7, dispatchPlanner regression"
```

---

## T14.5 (NEW) — Frontend Smoke Tests

**Files:**
- Create: `tests/frontend/analytics/KpiRow.test.tsx`
- Create: `tests/frontend/analytics/AnalyticsFilterBar.test.tsx`
- Create: `tests/frontend/analytics/WeekdayDualAxisChart.test.tsx`

### Test 1: `KpiRow`

```typescript
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiRow } from "@/components/analytics/KpiRow";

vi.mock("@/hooks/convex/useAnalytics", () => ({
  useKpiSummary: vi.fn(),
}));
import { useKpiSummary } from "@/hooks/convex/useAnalytics";

describe("KpiRow", () => {
  test("shows skeleton when data is undefined", () => {
    (useKpiSummary as any).mockReturnValue(undefined);
    render(<KpiRow />);
    // 6 skeleton cards
    expect(document.querySelectorAll(".animate-pulse").length).toBe(6);
  });

  test("renders 6 tiles with formatted values and deltas", () => {
    (useKpiSummary as any).mockReturnValue({
      current: { grossRevenue: 0, netRevenue: 100_000_000, units: 2500,
        orderCount: 1000, aovGross: 0, aovNet: 100_000, revPerUnit: 40_000, unitsPerTxn: 2.5 },
      prior: {},
      delta: { netRevenue: 10, units: 5, aovNet: null, revPerUnit: -2, orderCount: 15, unitsPerTxn: 0.1 },
    });
    render(<KpiRow />);
    expect(screen.getByText(/Revenue/i)).toBeInTheDocument();
    expect(screen.getByText(/Units sold/i)).toBeInTheDocument();
    expect(screen.getByText("2,500")).toBeInTheDocument();
    expect(screen.getByText("2.50")).toBeInTheDocument();
    // null delta renders em-dash
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});
```

### Test 2: `AnalyticsFilterBar` URL sync

```typescript
import { describe, expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { AnalyticsFilterProvider } from "@/contexts/AnalyticsFilterContext";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";

function ParamProbe() {
  const [p] = useSearchParams();
  return <div data-testid="probe">{p.toString()}</div>;
}

describe("AnalyticsFilterBar", () => {
  test("clicking 7d preset writes from+to into URL", () => {
    render(
      <MemoryRouter initialEntries={["/analytics"]}>
        <AnalyticsFilterProvider>
          <AnalyticsFilterBar />
          <ParamProbe />
        </AnalyticsFilterProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("7d"));
    const params = screen.getByTestId("probe").textContent ?? "";
    expect(params).toMatch(/from=\d+/);
    expect(params).toMatch(/to=\d+/);
  });
});
```

### Test 3: `WeekdayDualAxisChart` renders without throw

```typescript
import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { WeekdayDualAxisChart } from "@/components/analytics/WeekdayDualAxisChart";

vi.mock("@/hooks/convex/useAnalytics", () => ({
  useByWeekday: vi.fn(),
}));
import { useByWeekday } from "@/hooks/convex/useAnalytics";

describe("WeekdayDualAxisChart", () => {
  test("renders with mock data", () => {
    (useByWeekday as any).mockReturnValue({
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      orders: [10, 12, 11, 14, 18, 22, 16],
      units: [20, 25, 22, 28, 40, 48, 34],
    });
    const { container } = render(<WeekdayDualAxisChart />);
    // Recharts renders an SVG
    expect(container.querySelector("svg")).not.toBeNull();
  });

  test("renders skeleton when loading", () => {
    (useByWeekday as any).mockReturnValue(undefined);
    const { container } = render(<WeekdayDualAxisChart />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
```

### Commit

```bash
git add tests/frontend/analytics
git commit -m "test(analytics): frontend smoke tests — KpiRow loading/render, FilterBar URL sync, chart renders"
```

### Run both test suites

```bash
npm run test
```

Expect: all backend + frontend tests pass.

---

## T16 Patch — Explicit PR Step

After T16 Step 7 (push), add Step 8:

### Step 8: Open PR with squash-merge recommendation

```bash
gh pr create \
  --title "feat(analytics): unit economics dashboard" \
  --body "$(cat <<'EOF'
## Summary

New /analytics page with 13 widgets covering unit economics:
- Headline KPIs (revenue, units, AOV, rev/unit, orders, units/txn) with WoW deltas
- Time patterns (weekday dual-axis, day×hour heatmap)
- Channel economics (rev/unit, take-rate table)
- Volume & mix (units stacked by production type, units/txn, AOV gross vs net, type mix over time)
- SKU concentration (Pareto, SKU × channel heatmap)
- Momentum (per-channel sparklines, rolling 7d/28d)

Filterable by date, channel, and product. URL-synced for bookmarkable views.

## Critical fixes baked in
- Dynamic BOM iteration for production-unit counting (Big Ball + Mid Ball + Hazelnut + future)
- Indexed `by_completed_at` bounded scans (fixes 11× full-table-scan footprint)
- Denormalized `lineTotal` used instead of recomputing revenue math
- dispatchPlanner migrated off hardcoded BIG_BALL/MID_BALL (Pitfall #11 closure)

## Merge strategy
**Squash-merge recommended** — one revertable commit on main. Commit log on the branch documents the 18-step implementation.

## Test plan
- [ ] Manual smoke: open /analytics as manager user, verify all 13 widgets render
- [ ] Filter smoke: change date range, confirm all widgets refetch
- [ ] Mobile: verify nav + scrollable page at 375×667 viewport
- [ ] Regression: open dispatch planner, verify bigBalls/midBalls still populate (backward-compat preserved)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then request review in the repo's conventional way. Merge via **squash** (one commit on main for easy rollback).

---

## Updated Success Criteria (parent §"Success Criteria")

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `npm run test` passes (existing + 10 new backend + 3 new frontend tests)
- [ ] All 13 widgets render with live data
- [ ] **Hazelnut sales counted in `units` metric** (regression-guarded by test 1)
- [ ] **`volumeByType` returns `HAZELNUT_REGULAR` series** (regression-guarded by test 6)
- [ ] **dispatchPlanner `unitsByType` includes HAZELNUT_REGULAR** (regression-guarded by test 10)
- [ ] **`by_completed_at` index exists in schema** (verify via `convex dashboard`)
- [ ] Filter changes reflect in all widgets
- [ ] Route protected by `canAccessDashboard`
- [ ] URL filter state shareable (bookmark test: paste `/analytics?from=X&to=Y` in new tab)
- [ ] Nav links present in both Header and MobileBottomNav

---

## Summary of Changes vs. Parent Plan

| Category | Change |
|---|---|
| New tasks | T1.5 (index), T1.6 (dispatchPlanner migration), T14.5 (frontend tests) |
| Expanded tests | +5 backend test cases + 3 frontend component tests = **8 new tests** |
| Helpers | Added `revenueHelpers.ts`; extended `platformColors.ts` |
| Performance | `loadFilteredData` now uses `by_completed_at` + `by_order_date` indexes; per-order `by_order` fetch |
| DRY | Removed manual `quantity * unitPrice` math — use `itemGrossRevenue`/`itemNetRevenue`/`itemDiscount` helpers |
| Colors | All widgets use `getPlatformPalette(displayChannel).hex` — no inline CHANNEL_COLORS maps |
| Dates | All Jakarta-timezone logic routes through `getWibComponents` (no duplicate offset math) |
| Adaptive | `channelMomentum` bucket count adapts to window span (7/13/12) |
| Nav | T13 specifies BOTH Header.tsx AND MobileBottomNav.tsx |
| PR | T16 Step 8 explicitly opens a squash-merge PR |
| Fragment key | DayHourHeatmap fixed to use `<Fragment key={row}>` |
