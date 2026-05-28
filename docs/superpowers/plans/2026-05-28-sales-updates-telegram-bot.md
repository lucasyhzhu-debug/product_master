# Sales-Updates Telegram Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post automated sales round-ups (daily after a 23:00 WIB refresh, weekly Monday 07:00 WIB, monthly 1st 08:00 WIB) to the `sales-updates` Telegram chat, reporting gross revenue + per-SKU quantity by channel (GoFood by outlet, K3Mart, Direct).

**Architecture:** One new backend module `convex/telegram/salesSummary/` with three units — a pure range resolver, an `internalQuery` that aggregates `externalRevenue` (+ `externalRevenueItems`/`orderItems` for products) into channel/outlet/product structures with weekly/monthly deltas, a pure HTML formatter, and an `internalAction` orchestrator that best-effort refreshes GoFood/K3Mart/Internal then sends. Three crons added, one deleted. No schema change.

**Tech Stack:** Convex (internalQuery/internalAction/cronJobs), TypeScript, Vitest + convex-test, Telegram Bot API (HTML parse mode). Reuses Phase 85 registry (`getChatIdByRole`), `sendTelegramHtml`, `resolvePlatform`, `convex/lib/periodRange.ts` helpers.

**Spec:** `docs/superpowers/specs/2026-05-28-sales-updates-telegram-bot-design.md`

---

## Deviations from spec (found during planning)

1. **No new period presets.** Spec §5.5 proposed adding `lastWeek`/`lastMonth` to `PeriodPreset`. Planning found `calculateWeekRange(weekStartMs)` and `calculateMonthRange(year, month)` already exist in `convex/lib/periodRange.ts` (both return current+previous ranges). The new `resolveCadenceRange` helper composes these + `calculatePeriodRange("today")`. `periodRange.ts` is **not modified** — smaller blast radius.
2. **Direct revenue is faithful to the dashboard.** `fetchInternalOrderDataMap` is exported (`convex/externalData/queries.ts:29`); the query reuses it so Direct gross matches `getRevenueByOutletInternal`.
3. **Product source is defensive.** GoFood/K3Mart products come from `externalRevenueItems` when present, else `externalRevenue.productName`/`quantitySold`; Direct products come from `orderItems` (excluding `isCancelled`). Tests pin all three shapes.

---

## Git Workflow
**Branch:** `feature/sales-updates-telegram-bot` (branch from `main` after `git switch main && git pull` — CLAUDE.md Pitfall #12)
**Checkpoints:** after Task 2 (query green), after Task 3 (formatter green), after Task 6 (build gate). Each task ends in a commit.

## Implementation Waves
### Wave 1: Backend data layer [SEQUENTIAL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 1: range resolver | `convex/telegram/salesSummary/range.ts` |
| convex-backend | Task 2: summary query | `convex/telegram/salesSummary/salesSummaryQuery.ts` |

### Wave 2: Formatter + orchestrator [SEQUENTIAL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 3: formatter | `convex/telegram/salesSummary/salesSummaryFormat.ts` |
| convex-backend | Task 4: send action | `convex/telegram/salesSummary/sendSalesSummary.ts` |

### Wave 3: Wiring + verification [SEQUENTIAL, after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 5: crons | `convex/crons.ts` |
| code-auditor | Task 6 verify: type-check + pattern compliance | — |
| Bash | Task 6 verify: `npm run build` + `npm run test` | — |
| convex-backend | Task 6: docs | `docs/CHANGELOG.md`, `docs/FILE_MAP.md` |

## Documentation Updates
- [ ] `docs/CHANGELOG.md` (ALWAYS)
- [ ] `docs/FILE_MAP.md` (Telegram section — new salesSummary files + 3 crons)
- [ ] No `docs/SCHEMA.md` change (no schema change)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `npm run test` passes (new range/query/format tests green)
- [ ] Daily/weekly/monthly crons registered (23:00 / Mon 07:00 / 1st 08:00 WIB); `bigseller nightly 7d resync` deleted
- [ ] Message renders revenue per channel, GoFood broken out by outlet, top-N per-SKU products, weekly/monthly deltas
- [ ] Operator can assign a chat to `sales-updates` via `/admin/telegram-chats` (existing Phase 85 flow — no code needed)

---

## Task 1: Cadence range resolver (pure)

Maps `daily|weekly|monthly` → `{ currentStart, currentEnd, previousStart, previousEnd, periodLabel }` in UTC ms with WIB day boundaries, composing existing `periodRange.ts` helpers. Pure function → fast deterministic unit tests.

**Files:**
- Create: `convex/telegram/salesSummary/range.ts`
- Test: `convex/telegram/salesSummary/__tests__/range.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// convex/telegram/salesSummary/__tests__/range.test.ts
import { describe, it, expect } from "vitest";
import { resolveCadenceRange } from "../range";

// Helper: UTC ms for WIB midnight of a date (WIB = UTC+7).
function wibMidnight(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, -7, 0, 0, 0);
}

describe("resolveCadenceRange", () => {
  it("daily = today's WIB day, current end = now", () => {
    const now = wibMidnight(2026, 5, 28) + 23 * 3600_000; // Thu 2026-05-28 23:00 WIB
    const r = resolveCadenceRange("daily", now);
    expect(r.currentStart).toBe(wibMidnight(2026, 5, 28));
    expect(r.currentEnd).toBe(now);
    expect(r.periodLabel).toBe("Thu 28 May 2026");
  });

  it("weekly = prior complete Mon–Sun when fired on a Monday", () => {
    const now = wibMidnight(2026, 5, 25) + 7 * 3600_000; // Mon 2026-05-25 07:00 WIB
    const r = resolveCadenceRange("weekly", now);
    expect(r.currentStart).toBe(wibMidnight(2026, 5, 18)); // prior Monday
    expect(r.currentEnd).toBe(wibMidnight(2026, 5, 25));    // this Monday (exclusive)
    expect(r.previousStart).toBe(wibMidnight(2026, 5, 11));
    expect(r.previousEnd).toBe(wibMidnight(2026, 5, 18));
    expect(r.periodLabel).toBe("18–24 May 2026");
  });

  it("monthly = prior calendar month when fired on the 1st", () => {
    const now = wibMidnight(2026, 6, 1) + 8 * 3600_000; // Mon 2026-06-01 08:00 WIB
    const r = resolveCadenceRange("monthly", now);
    expect(r.currentStart).toBe(wibMidnight(2026, 5, 1)); // May 1
    expect(r.currentEnd).toBe(wibMidnight(2026, 6, 1));   // Jun 1 (exclusive)
    expect(r.previousStart).toBe(wibMidnight(2026, 4, 1));
    expect(r.previousEnd).toBe(wibMidnight(2026, 5, 1));
    expect(r.periodLabel).toBe("May 2026");
  });

  it("monthly handles January → prior December of previous year", () => {
    const now = wibMidnight(2026, 1, 1) + 8 * 3600_000;
    const r = resolveCadenceRange("monthly", now);
    expect(r.currentStart).toBe(wibMidnight(2025, 12, 1));
    expect(r.currentEnd).toBe(wibMidnight(2026, 1, 1));
    expect(r.periodLabel).toBe("December 2025");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- range.test`
Expected: FAIL — `Cannot find module '../range'`.

- [ ] **Step 3: Write the implementation**

```typescript
// convex/telegram/salesSummary/range.ts
import {
  calculatePeriodRange,
  calculateWeekRange,
  calculateMonthRange,
  getWibComponents,
  wibMidnightToUtc,
  WIB_OFFSET_MS,
} from "../../lib/periodRange";

export type Cadence = "daily" | "weekly" | "monthly";

export interface CadenceRange {
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
  periodLabel: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function wibYmd(utcMs: number) {
  const d = new Date(utcMs + WIB_OFFSET_MS);
  return { weekday: WEEKDAY[d.getUTCDay()], day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

/**
 * Resolve a reporting cadence to its WIB-bounded UTC range + a human label.
 * `daily` → the WIB day containing `now` (currentEnd = now). `weekly` → the
 * prior complete Mon–Sun. `monthly` → the prior complete calendar month.
 * Previous ranges feed weekly/monthly deltas (unused for daily).
 */
export function resolveCadenceRange(cadence: Cadence, now: number): CadenceRange {
  if (cadence === "daily") {
    const r = calculatePeriodRange("today", now);
    const p = wibYmd(r.currentStart);
    return {
      currentStart: r.currentStart,
      currentEnd: r.currentEnd,
      previousStart: r.previousStart,
      previousEnd: r.previousEnd,
      periodLabel: `${p.weekday} ${p.day} ${MONTHS_SHORT[p.month]} ${p.year}`,
    };
  }

  const { year, month, day, dayOfWeek } = getWibComponents(now);

  if (cadence === "weekly") {
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisWeekMonday = wibMidnightToUtc(year, month, day - daysSinceMonday);
    const lastWeekMonday = thisWeekMonday - WEEK_MS;
    const w = calculateWeekRange(lastWeekMonday);
    const s = wibYmd(w.currentStart);
    const e = wibYmd(w.currentEnd - 1); // last day (Sunday), inclusive for the label
    const label = s.month === e.month
      ? `${s.day}–${e.day} ${MONTHS_SHORT[s.month]} ${s.year}`
      : `${s.day} ${MONTHS_SHORT[s.month]} – ${e.day} ${MONTHS_SHORT[e.month]} ${e.year}`;
    return { ...w, periodLabel: label };
  }

  // monthly — prior calendar month
  const m = calculateMonthRange(year, month - 1);
  const s = wibYmd(m.currentStart);
  return { ...m, periodLabel: `${MONTHS[s.month]} ${s.year}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- range.test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/telegram/salesSummary/range.ts convex/telegram/salesSummary/__tests__/range.test.ts
git commit -m "feat(sales-summary): cadence range resolver (daily/weekly/monthly WIB)"
```

---

## Task 2: Sales summary query (`internalQuery`)

Aggregates in-range `externalRevenue` for sources `gobiz`/`k3mart`/`internal` into channel → outlet → product structures, with gross + order counts and weekly/monthly gross deltas. Returns structured data only (formatting is Task 3).

**Files:**
- Create: `convex/telegram/salesSummary/salesSummaryQuery.ts`
- Test: `convex/telegram/salesSummary/__tests__/salesSummaryQuery.test.ts`

**Return type (the contract — used by Task 3):**
```typescript
export interface ProductTally { name: string; qty: number; }
export interface OutletSummary { name: string; gross: number; orders: number; products: ProductTally[]; }
export interface ChannelSummary {
  platform: "GoFood" | "K3Mart" | "Direct";
  gross: number;
  orders: number;
  deltaPct: number | null;        // null for daily, or when prior period had 0 gross
  outlets: OutletSummary[];        // GoFood: one per outlet; K3Mart/Direct: single synthetic outlet "—"
  products: ProductTally[];        // channel-level merged top-N (used for K3Mart/Direct rendering)
}
export interface SalesSummaryData {
  cadence: "daily" | "weekly" | "monthly";
  periodLabel: string;
  generatedAt: number;
  grandTotal: { gross: number; orders: number; deltaPct: number | null };
  channels: ChannelSummary[];      // sorted by gross desc; empty channels omitted
}
```

- [ ] **Step 1: Write the failing tests**

```typescript
// convex/telegram/salesSummary/__tests__/salesSummaryQuery.test.ts
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");
type Ctx = TestConvex<typeof schema>;

function wibMidnight(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, -7, 0, 0, 0);
}
const DAY_NOW = wibMidnight(2026, 5, 28) + 23 * 3600_000; // Thu 23:00 WIB
const DAY_START = wibMidnight(2026, 5, 28);

// Seed a GoFood (gobiz) revenue row + optional item children.
async function seedGoFood(
  t: Ctx,
  outletName: string,
  gross: number,
  periodStart: number,
  items: { name: string; qty: number }[],
) {
  await t.run(async (ctx) => {
    const outletId = await ctx.db.insert("externalOutlets", {
      source: "gobiz", externalId: `gf-${outletName}`, name: outletName,
      isActive: true, createdBy: "test", createdAt: periodStart,
    });
    const revId = await ctx.db.insert("externalRevenue", {
      source: "gobiz", outletId, revenueGross: gross,
      periodStart, periodEnd: periodStart, transactionDate: periodStart,
      transactionCount: 1, dataOrigin: "api_revenue", confidence: "exact",
    });
    for (const it of items) {
      await ctx.db.insert("externalRevenueItems", {
        revenueId: revId, source: "gobiz", productName: it.name,
        unitPrice: 0, quantity: it.qty, totalPrice: 0,
        isAutoMatched: false, createdAt: periodStart,
      });
    }
  });
}

// Seed a Direct (internal) order — Direct gross comes from orders, products from orderItems.
async function seedDirect(
  t: Ctx, orderNumber: string, total: number, periodStart: number,
  items: { name: string; qty: number; cancelled?: boolean }[],
) {
  await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", { name: "C", phone: "08", createdBy: "test" });
    const orderId = await ctx.db.insert("orders", {
      orderNumber, customerId, customerName: "C", status: "Complete", paymentStatus: "Paid",
      orderDate: periodStart, totalAmount: total, totalCost: 0, totalMargin: total,
      finalTotal: total, deliveryType: "Pickup", createdBy: "test", itemCount: items.length,
    });
    for (const it of items) {
      await ctx.db.insert("orderItems", {
        orderId, productName: it.name, quantity: it.qty, unitPrice: 0, unitCost: 0,
        discountAmount: 0, lineTotal: 0, lineCost: 0, lineMargin: 0, isCancelled: it.cancelled,
      });
    }
    await ctx.db.insert("externalRevenue", {
      source: "internal", externalTransactionId: orderNumber, revenueGross: total,
      periodStart, periodEnd: periodStart, transactionDate: periodStart,
      transactionCount: 1, dataOrigin: "db_query", confidence: "exact",
    });
  });
}

describe("salesSummaryQuery — daily", () => {
  it("groups GoFood by outlet with per-outlet products; sorts channels by gross", async () => {
    const t = convexTest(schema, modules);
    await seedGoFood(t, "Crystal", 2_300_000, DAY_START + 3600_000,
      [{ name: "Jumbo", qty: 12 }, { name: "Original Triple", qty: 8 }]);
    await seedGoFood(t, "Tamtem", 1_800_000, DAY_START + 3600_000, [{ name: "Jumbo", qty: 9 }]);
    await seedDirect(t, "0528-001", 2_100_000, DAY_START + 3600_000,
      [{ name: "Jumbo", qty: 15 }, { name: "Cancelled", qty: 5, cancelled: true }]);

    const data = await t.query(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: "daily", now: DAY_NOW });

    expect(data.channels.map((c) => c.platform)).toEqual(["GoFood", "Direct"]);
    const gofood = data.channels[0];
    expect(gofood.gross).toBe(4_100_000);
    expect(gofood.outlets.map((o) => o.name).sort()).toEqual(["Crystal", "Tamtem"]);
    const crystal = gofood.outlets.find((o) => o.name === "Crystal")!;
    expect(crystal.products[0]).toEqual({ name: "Jumbo", qty: 12 });
    // Direct: products from orderItems, cancelled excluded
    const direct = data.channels[1];
    expect(direct.gross).toBe(2_100_000);
    expect(direct.products).toEqual([{ name: "Jumbo", qty: 15 }]);
    // grandTotal
    expect(data.grandTotal.gross).toBe(6_200_000);
    expect(data.grandTotal.orders).toBe(3);
    expect(data.grandTotal.deltaPct).toBeNull(); // daily = no delta
  });

  it("omits channels with zero sales", async () => {
    const t = convexTest(schema, modules);
    await seedDirect(t, "0528-001", 100_000, DAY_START + 3600_000, [{ name: "Jumbo", qty: 1 }]);
    const data = await t.query(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: "daily", now: DAY_NOW });
    expect(data.channels.map((c) => c.platform)).toEqual(["Direct"]);
  });

  it("falls back to externalRevenue.productName when a GoFood row has no item children", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("externalOutlets", {
        source: "gobiz", externalId: "gf-x", name: "Goldfinch", isActive: true, createdBy: "t", createdAt: DAY_START });
      await ctx.db.insert("externalRevenue", {
        source: "gobiz", outletId, revenueGross: 500_000, productName: "Bite Single", quantitySold: 4,
        periodStart: DAY_START + 3600_000, periodEnd: DAY_START + 3600_000, transactionDate: DAY_START + 3600_000,
        transactionCount: 1, dataOrigin: "api_revenue", confidence: "exact" });
    });
    const data = await t.query(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: "daily", now: DAY_NOW });
    expect(data.channels[0].outlets[0].products).toEqual([{ name: "Bite Single", qty: 4 }]);
  });
});

describe("salesSummaryQuery — weekly delta", () => {
  it("computes gross deltaPct vs the prior week", async () => {
    const t = convexTest(schema, modules);
    const NOW = wibMidnight(2026, 5, 25) + 7 * 3600_000; // Mon 07:00 WIB
    // current week (18–24 May): 1,100,000 ; previous week (11–17 May): 1,000,000 → +10%
    await seedGoFood(t, "Crystal", 1_100_000, wibMidnight(2026, 5, 20), [{ name: "Jumbo", qty: 5 }]);
    await seedGoFood(t, "Crystal", 1_000_000, wibMidnight(2026, 5, 13), [{ name: "Jumbo", qty: 4 }]);
    const data = await t.query(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: "weekly", now: NOW });
    expect(data.channels[0].gross).toBe(1_100_000);
    expect(data.channels[0].deltaPct).toBeCloseTo(10, 1);
    expect(data.grandTotal.deltaPct).toBeCloseTo(10, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- salesSummaryQuery.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// convex/telegram/salesSummary/salesSummaryQuery.ts
import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { resolvePlatform } from "../../reports/platform";
import { fetchInternalOrderDataMap } from "../../externalData/queries";
import { resolveCadenceRange, type Cadence } from "./range";

const TOP_N_DAILY = 3;
const TOP_N_PERIOD = 5;
type InScopePlatform = "GoFood" | "K3Mart" | "Direct";
const IN_SCOPE: InScopePlatform[] = ["GoFood", "K3Mart", "Direct"];

export interface ProductTally { name: string; qty: number; }
export interface OutletSummary { name: string; gross: number; orders: number; products: ProductTally[]; }
export interface ChannelSummary {
  platform: InScopePlatform; gross: number; orders: number; deltaPct: number | null;
  outlets: OutletSummary[]; products: ProductTally[];
}
export interface SalesSummaryData {
  cadence: Cadence; periodLabel: string; generatedAt: number;
  grandTotal: { gross: number; orders: number; deltaPct: number | null };
  channels: ChannelSummary[];
}

function topN(tally: Map<string, number>, n: number): ProductTally[] {
  return [...tally.entries()].map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty).slice(0, n);
}

function pctDelta(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

// Pull in-range externalRevenue for the 3 in-scope sources via by_period.
async function fetchInScopeRevenue(ctx: QueryCtx, start: number, end: number): Promise<Doc<"externalRevenue">[]> {
  const rows = await ctx.db.query("externalRevenue")
    .withIndex("by_period", (q) => q.gte("periodStart", start).lt("periodStart", end))
    .collect();
  return rows.filter((r) => r.source === "gobiz" || r.source === "k3mart" || r.source === "internal");
}

// Resolve raw source → in-scope Platform (or null if out of scope).
function toInScope(source: Doc<"externalRevenue">["source"]): InScopePlatform | null {
  const p = resolvePlatform({ source }).platform;
  return (IN_SCOPE as string[]).includes(p) ? (p as InScopePlatform) : null;
}

// Compute gross for a row (internal uses order totals, like getRevenueByOutletInternal).
function rowGross(
  row: Doc<"externalRevenue">,
  orderMap: Map<string, { totalAmount: number; finalTotal: number }>,
): number {
  if (row.source === "internal" && row.externalTransactionId) {
    const od = orderMap.get(row.externalTransactionId);
    return od ? od.totalAmount : (row.revenueGross ?? 0);
  }
  return row.revenueGross ?? 0;
}

export const getSalesSummary = internalQuery({
  args: {
    cadence: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SalesSummaryData> => {
    const nowMs = args.now ?? Date.now();
    const range = resolveCadenceRange(args.cadence, nowMs);
    const withDelta = args.cadence !== "daily";

    const currentRows = await fetchInScopeRevenue(ctx, range.currentStart, range.currentEnd);
    const previousRows = withDelta
      ? await fetchInScopeRevenue(ctx, range.previousStart, range.previousEnd)
      : [];

    // Internal-order totals (Direct gross) + outlet names, fetched in parallel.
    const [curOrderMap, prevOrderMap] = await Promise.all([
      fetchInternalOrderDataMap(ctx, currentRows),
      fetchInternalOrderDataMap(ctx, previousRows),
    ]);
    const outletIds = [...new Set(currentRows.filter((r) => r.outletId).map((r) => r.outletId!))];
    const outletNames = new Map<string, string>();
    await Promise.all(outletIds.map(async (id) => {
      const o = await ctx.db.get(id);
      if (o) outletNames.set(id, o.name);
    }));

    // Product children for current rows (GoFood/K3Mart). Internal handled via orderItems below.
    const itemsByRevenue = new Map<string, Doc<"externalRevenueItems">[]>();
    await Promise.all(currentRows.map(async (r) => {
      if (r.source === "internal") return;
      const items = await ctx.db.query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", r._id)).collect();
      if (items.length > 0) itemsByRevenue.set(r._id, items);
    }));

    // Resolve linkedMenuProductId → product name (prefer internal name per spec D3).
    const linkedIds = new Set<Id<"menuProducts">>();
    for (const items of itemsByRevenue.values())
      for (const it of items) if (it.linkedMenuProductId) linkedIds.add(it.linkedMenuProductId);
    const menuName = new Map<string, string>();
    await Promise.all([...linkedIds].map(async (id) => {
      const mp = await ctx.db.get(id);
      if (mp) menuName.set(id, mp.name);
    }));

    // Internal orderItems (Direct products) keyed by orderId, only for current internal rows.
    const internalOrderItems = new Map<string, Doc<"orderItems">[]>();
    await Promise.all(currentRows.filter((r) => r.source === "internal" && r.externalTransactionId).map(async (r) => {
      const order = await ctx.db.query("orders")
        .withIndex("by_order_number", (q) => q.eq("orderNumber", r.externalTransactionId!)).first();
      if (!order) return;
      const oi = await ctx.db.query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id)).collect();
      internalOrderItems.set(r._id, oi);
    }));

    // ── Aggregate current rows into platform → outlet ──
    type OutletAgg = { name: string; gross: number; orders: number; products: Map<string, number> };
    type ChannelAgg = { gross: number; orders: number; outlets: Map<string, OutletAgg>; products: Map<string, number> };
    const channels = new Map<InScopePlatform, ChannelAgg>();

    for (const row of currentRows) {
      const platform = toInScope(row.source);
      if (!platform) continue;
      if (!channels.has(platform))
        channels.set(platform, { gross: 0, orders: 0, outlets: new Map(), products: new Map() });
      const ch = channels.get(platform)!;
      const gross = rowGross(row, curOrderMap);
      const orders = row.transactionCount ?? 1;
      ch.gross += gross;
      ch.orders += orders;

      const outletKey = row.outletId ?? "—";
      const outletName = row.outletId ? (outletNames.get(row.outletId) ?? "Unknown") : "—";
      if (!ch.outlets.has(outletKey))
        ch.outlets.set(outletKey, { name: outletName, gross: 0, orders: 0, products: new Map() });
      const out = ch.outlets.get(outletKey)!;
      out.gross += gross;
      out.orders += orders;

      // Products: items → fallback row → internal orderItems.
      const addProduct = (name: string, qty: number) => {
        ch.products.set(name, (ch.products.get(name) ?? 0) + qty);
        out.products.set(name, (out.products.get(name) ?? 0) + qty);
      };
      const items = itemsByRevenue.get(row._id);
      if (items) {
        for (const it of items) {
          const name = (it.linkedMenuProductId && menuName.get(it.linkedMenuProductId)) || it.productName;
          addProduct(name, it.quantity);
        }
      } else if (row.source === "internal") {
        for (const oi of internalOrderItems.get(row._id) ?? []) {
          if (oi.isCancelled) continue;
          addProduct(oi.productName, oi.quantity);
        }
      } else if (row.productName && row.quantitySold) {
        addProduct(row.productName, row.quantitySold);
      }
    }

    // ── Previous-period gross per platform (for deltas) ──
    const prevGross = new Map<InScopePlatform, number>();
    let prevGrandGross = 0;
    for (const row of previousRows) {
      const platform = toInScope(row.source);
      if (!platform) continue;
      const g = rowGross(row, prevOrderMap);
      prevGross.set(platform, (prevGross.get(platform) ?? 0) + g);
      prevGrandGross += g;
    }

    const topProducts = args.cadence === "daily" ? TOP_N_DAILY : TOP_N_PERIOD;
    const result: ChannelSummary[] = [];
    let grandGross = 0, grandOrders = 0;
    for (const [platform, ch] of channels) {
      grandGross += ch.gross;
      grandOrders += ch.orders;
      result.push({
        platform, gross: ch.gross, orders: ch.orders,
        deltaPct: withDelta ? pctDelta(ch.gross, prevGross.get(platform) ?? 0) : null,
        outlets: [...ch.outlets.values()]
          .sort((a, b) => b.gross - a.gross)
          .map((o) => ({ name: o.name, gross: o.gross, orders: o.orders, products: topN(o.products, topProducts) })),
        products: topN(ch.products, topProducts),
      });
    }
    result.sort((a, b) => b.gross - a.gross);

    return {
      cadence: args.cadence, periodLabel: range.periodLabel, generatedAt: nowMs,
      grandTotal: {
        gross: grandGross, orders: grandOrders,
        deltaPct: withDelta ? pctDelta(grandGross, prevGrandGross) : null,
      },
      channels: result,
    };
  },
});
```

> **Execution note:** if `orderItems` lacks a `by_order` index or `menuProducts` lacks a `name` field, the type-check/test will surface it — confirm against `convex/schema.ts` and adjust the index name / field accessor. Both are standard and expected to exist.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- salesSummaryQuery.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/telegram/salesSummary/salesSummaryQuery.ts convex/telegram/salesSummary/__tests__/salesSummaryQuery.test.ts
git commit -m "feat(sales-summary): per-channel/outlet/product aggregation query with weekly/monthly deltas"
```

---

## Task 3: Telegram message formatter (pure)

Turns `SalesSummaryData` into Telegram HTML chunks (≤4000 chars, per-section truncation guard), mirroring `packListFormat.ts`. Daily = clean snapshot; weekly/monthly add ▲/▼ deltas + a refresh footer for daily.

**Files:**
- Create: `convex/telegram/salesSummary/salesSummaryFormat.ts`
- Test: `convex/telegram/salesSummary/__tests__/salesSummaryFormat.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// convex/telegram/salesSummary/__tests__/salesSummaryFormat.test.ts
import { describe, it, expect } from "vitest";
import { formatSalesSummary, type RefreshStatus } from "../salesSummaryFormat";
import type { SalesSummaryData } from "../salesSummaryQuery";

const OK: RefreshStatus = { gofood: "ok", k3mart: "ok", direct: "ok" };

const daily: SalesSummaryData = {
  cadence: "daily", periodLabel: "Wed 28 May 2026", generatedAt: Date.UTC(2026, 4, 28, 16, 2),
  grandTotal: { gross: 6_200_000, orders: 3, deltaPct: null },
  channels: [
    { platform: "GoFood", gross: 4_100_000, orders: 2, deltaPct: null, products: [],
      outlets: [
        { name: "Crystal", gross: 2_300_000, orders: 1, products: [{ name: "Jumbo", qty: 12 }] },
        { name: "Tamtem", gross: 1_800_000, orders: 1, products: [{ name: "Jumbo", qty: 9 }] },
      ] },
    { platform: "Direct", gross: 2_100_000, orders: 1, deltaPct: null,
      outlets: [{ name: "—", gross: 2_100_000, orders: 1, products: [{ name: "Jumbo", qty: 15 }] }],
      products: [{ name: "Jumbo", qty: 15 }] },
  ],
};

describe("formatSalesSummary — daily", () => {
  it("renders header, GoFood by outlet, Direct channel-level, and a refresh footer", () => {
    const chunks = formatSalesSummary({ data: daily, refresh: OK });
    const text = chunks.join("\n");
    expect(text).toContain("Sales — Wed 28 May 2026");
    expect(text).toContain("Rp 6.2M");
    expect(text).toContain("Crystal");
    expect(text).toContain("12× Jumbo");
    expect(text).toContain("GoFood ✓ K3Mart ✓ Direct ✓");
    expect(text).not.toContain("vs prior"); // no deltas on daily
  });

  it("marks a failed source in the footer", () => {
    const chunks = formatSalesSummary({ data: daily, refresh: { gofood: "fail", k3mart: "ok", direct: "ok" } });
    expect(chunks.join("\n")).toContain("GoFood ✗");
  });

  it("returns a single 'no sales' message when there are no channels", () => {
    const empty: SalesSummaryData = { ...daily, channels: [], grandTotal: { gross: 0, orders: 0, deltaPct: null } };
    const chunks = formatSalesSummary({ data: empty, refresh: OK });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("No sales recorded");
  });
});

describe("formatSalesSummary — weekly", () => {
  it("renders the date-range header and ▲/▼ deltas, no refresh footer", () => {
    const weekly: SalesSummaryData = {
      ...daily, cadence: "weekly", periodLabel: "18–24 May 2026",
      grandTotal: { gross: 58_200_000, orders: 980, deltaPct: 12 },
      channels: [{ ...daily.channels[0], gross: 34_100_000, deltaPct: 8 }],
    };
    const text = formatSalesSummary({ data: weekly, refresh: OK }).join("\n");
    expect(text).toContain("Weekly Sales — 18–24 May 2026");
    expect(text).toContain("▲ 12% vs prior week");
    expect(text).toContain("▲ 8%");
    expect(text).not.toContain("Refreshed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- salesSummaryFormat.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// convex/telegram/salesSummary/salesSummaryFormat.ts
import { escapeHtml } from "../../lib/telegramHtml";
import type { SalesSummaryData, ChannelSummary, ProductTally } from "./salesSummaryQuery";

export interface RefreshStatus { gofood: "ok" | "fail" | "skip"; k3mart: "ok" | "fail" | "skip"; direct: "ok" | "fail" | "skip"; }
export interface FormatInput { data: SalesSummaryData; refresh: RefreshStatus; }

const CHUNK_BUDGET = 4000;
const MAX_SECTION_LEN = 3800;
const TRUNCATE_MARKER = "\n  …[truncated — check dashboard]";
const CHANNEL_EMOJI: Record<ChannelSummary["platform"], string> = { GoFood: "🛵", K3Mart: "🏪", Direct: "🏠" };

function rupiah(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)}K`;
  return `Rp ${n}`;
}

function delta(pct: number | null, suffix = ""): string {
  if (pct === null) return "";
  const arrow = pct >= 0 ? "▲" : "▼";
  return `  ${arrow} ${Math.abs(Math.round(pct))}%${suffix}`;
}

function products(list: ProductTally[]): string {
  if (list.length === 0) return "";
  return "\n      " + list.map((p) => `${p.qty}× ${escapeHtml(p.name)}`).join(" · ");
}

function renderChannel(ch: ChannelSummary): string {
  const head = `${CHANNEL_EMOJI[ch.platform]} <b>${ch.platform}</b> — ${rupiah(ch.gross)} (${ch.orders} orders)${delta(ch.deltaPct)}`;
  if (ch.platform === "GoFood") {
    const lines = ch.outlets.map((o) =>
      `  • ${escapeHtml(o.name)} — ${rupiah(o.gross)}${products(o.products)}`);
    return [head, ...lines].join("\n");
  }
  return head + products(ch.products);
}

function header(data: SalesSummaryData): string {
  const title = data.cadence === "daily"
    ? `Sales — ${data.periodLabel} (end of day)`
    : data.cadence === "weekly"
      ? `Weekly Sales — ${data.periodLabel}`
      : `Monthly Sales — ${data.periodLabel}`;
  const cmp = data.cadence === "weekly" ? " vs prior week" : data.cadence === "monthly" ? " vs prior month" : "";
  const total = `Total: ${rupiah(data.grandTotal.gross)} · ${data.grandTotal.orders} orders${delta(data.grandTotal.deltaPct, cmp)}`;
  return `📊 <b>${title}</b>\n${total}`;
}

function footer(refresh: RefreshStatus, generatedAt: number): string {
  const mark = (s: "ok" | "fail" | "skip") => (s === "ok" ? "✓" : s === "fail" ? "✗" : "–");
  const wib = new Date(generatedAt + 7 * 3600_000);
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const mm = String(wib.getUTCMinutes()).padStart(2, "0");
  return `\n<i>Refreshed ${hh}:${mm} WIB · GoFood ${mark(refresh.gofood)} K3Mart ${mark(refresh.k3mart)} Direct ${mark(refresh.direct)}</i>`;
}

export function formatSalesSummary(input: FormatInput): string[] {
  const { data, refresh } = input;
  if (data.channels.length === 0) {
    const when = data.cadence === "daily" ? "today" : `for ${data.periodLabel}`;
    return [`${header(data)}\n\nNo sales recorded ${when}.`];
  }

  const sections = data.channels.map(renderChannel).map((s) =>
    s.length > MAX_SECTION_LEN ? s.slice(0, MAX_SECTION_LEN - TRUNCATE_MARKER.length) + TRUNCATE_MARKER : s);

  const chunks: string[] = [];
  let current = header(data);
  for (const sec of sections) {
    const addition = `\n\n${sec}`;
    if (current.length + addition.length > CHUNK_BUDGET) {
      chunks.push(current);
      current = `<i>…continued (${chunks.length + 1})</i>\n\n${sec}`;
    } else {
      current += addition;
    }
  }
  // Daily-only refresh footer appended to the final chunk (skip if it would overflow → own chunk).
  if (data.cadence === "daily") {
    const f = footer(refresh, data.generatedAt);
    if (current.length + f.length > CHUNK_BUDGET) { chunks.push(current); current = f.trimStart(); }
    else current += f;
  }
  chunks.push(current);
  return chunks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- salesSummaryFormat.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/telegram/salesSummary/salesSummaryFormat.ts convex/telegram/salesSummary/__tests__/salesSummaryFormat.test.ts
git commit -m "feat(sales-summary): Telegram HTML formatter (daily snapshot + weekly/monthly deltas)"
```

---

## Task 4: Send orchestrator (`internalAction`)

Daily: best-effort refresh of GoFood/K3Mart/Internal (each isolated in try/catch), then query + send. Weekly/monthly: skip refresh, query + send. Mirrors `sendPackList`'s chunk-send + breadcrumb. No unit test — actions performing real `fetch` are verified via cron/manual run (same precedent as `sendPackList`, which has no action-level test).

**Files:**
- Create: `convex/telegram/salesSummary/sendSalesSummary.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// convex/telegram/salesSummary/sendSalesSummary.ts
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { sendTelegramHtml } from "../../lib/telegramHtml";
import { formatSalesSummary, type RefreshStatus } from "./salesSummaryFormat";

export const sendSalesSummary = internalAction({
  args: { cadence: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")) },
  // Explicit return type breaks circular type inference (same reason as sendPackList).
  handler: async (ctx, args): Promise<{ chunkCount: number; channelCount: number }> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Telegram env var missing (TELEGRAM_BOT_TOKEN)");

    const refresh: RefreshStatus = { gofood: "skip", k3mart: "skip", direct: "skip" };

    if (args.cadence === "daily") {
      // Best-effort: one failed sync must not block the others or the summary.
      try { await ctx.runAction(internal.integrations.gobiz.adapter.autoSyncGoBizRevenue, {}); refresh.gofood = "ok"; }
      catch (e) { refresh.gofood = "fail"; console.warn("sales-summary: GoFood sync failed", e); }
      try { await ctx.runAction(api.integrations.k3mart.adapter.syncK3MartSales, { triggeredBy: "cron" }); refresh.k3mart = "ok"; }
      catch (e) { refresh.k3mart = "fail"; console.warn("sales-summary: K3Mart sync failed", e); }
      try { await ctx.runAction(api.integrations.internal.adapter.syncInternalOrders, { triggeredBy: "cron" }); refresh.direct = "ok"; }
      catch (e) { refresh.direct = "fail"; console.warn("sales-summary: Internal sync failed", e); }
    }

    const data = await ctx.runQuery(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: args.cadence });
    const chatId = await ctx.runQuery(internal.telegram.chatRegistry.getChatIdByRole, { role: "sales-updates" });
    const chunks = formatSalesSummary({ data, refresh });

    let sent = 0;
    try {
      for (const chunk of chunks) { await sendTelegramHtml(token, chatId, chunk); sent++; }
    } catch (err) {
      if (sent > 0) {
        try { await sendTelegramHtml(token, chatId, `<i>⚠️ Sales summary send failed after ${sent}/${chunks.length} chunks. Check Convex logs.</i>`); }
        catch { /* best-effort */ }
      }
      throw err;
    }
    return { chunkCount: chunks.length, channelCount: data.channels.length };
  },
});
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`
Expected: PASS (no errors in the new file; confirms `api.integrations.*` / `internal.telegram.*` references resolve).

- [ ] **Step 3: Commit**

```bash
git add convex/telegram/salesSummary/sendSalesSummary.ts
git commit -m "feat(sales-summary): send orchestrator with best-effort daily refresh"
```

---

## Task 5: Cron wiring (add 3, delete 1)

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Edit `convex/crons.ts`**

Delete the BigSeller nightly resync block (the `crons.daily("bigseller nightly 7d resync", ...)` call and its leading comment, currently lines 13–21). If the `internal` import of `internal.integrations.bigseller.cron.nightlySync` becomes unused, leave the top-level `internal` import (still used by the pack-list + new crons).

Add at the end, before `export default crons;`:

```typescript
// Sales-updates bot — daily end-of-day summary at 23:00 WIB (= 16:00 UTC).
// Best-effort refreshes GoFood/K3Mart/Internal, then posts revenue + per-SKU by channel.
crons.daily(
  "sales summary daily",
  { hourUTC: 16, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
  { cadence: "daily" },
);

// Sales-updates bot — weekly round-up Monday 07:00 WIB (= Mon 00:00 UTC), prior Mon–Sun.
crons.weekly(
  "sales summary weekly",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
  { cadence: "weekly" },
);

// Sales-updates bot — monthly round-up 1st at 08:00 WIB (= 1st 01:00 UTC), prior calendar month.
crons.monthly(
  "sales summary monthly",
  { day: 1, hourUTC: 1, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
  { cadence: "monthly" },
);
```

- [ ] **Step 2: Verify crons register (type-check + codegen)**

Run: `npm run type-check`
Expected: PASS. (If `npx convex dev` is running, the dashboard Crons tab should now list the 3 new crons and no longer list `bigseller nightly 7d resync`.)

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat(sales-summary): register daily/weekly/monthly crons; remove 3am bigseller resync"
```

---

## Task 6: Docs + verification gate

**Files:**
- Modify: `docs/CHANGELOG.md`, `docs/FILE_MAP.md`

- [ ] **Step 1: Append to `docs/CHANGELOG.md`** (under a new dated entry at the top)

```markdown
## 2026-05-28 — Sales-updates Telegram bot (daily/weekly/monthly)

- New `convex/telegram/salesSummary/` module: `range.ts` (cadence→WIB range), `salesSummaryQuery.ts` (gross + per-SKU by channel/outlet, weekly/monthly deltas), `salesSummaryFormat.ts` (Telegram HTML), `sendSalesSummary.ts` (orchestrator).
- Channels: GoFood (by outlet), K3Mart (if any), Direct. Posts to the `sales-updates` Telegram role (Phase 85 registry).
- Crons: `sales summary daily` (23:00 WIB, best-effort refresh GoFood/K3Mart/Internal then send), `sales summary weekly` (Mon 07:00 WIB), `sales summary monthly` (1st 08:00 WIB).
- Removed `bigseller nightly 7d resync` cron — BigSeller is now refreshed manually (Shopee/TikTok out of summary scope).
- No schema change.
- Operator step: assign a Telegram group to `sales-updates` via `/admin/telegram-chats`.
```

- [ ] **Step 2: Update `docs/FILE_MAP.md`** — in the Telegram section, add the `salesSummary/` files and note the 3 new crons + the deleted bigseller resync.

- [ ] **Step 3: Full verification gate**

Run: `npm run type-check && npm run test && npm run build`
Expected: all PASS; new tests green; build succeeds (no vendor-bundle changes — backend only).

- [ ] **Step 4: Commit**

```bash
git add docs/CHANGELOG.md docs/FILE_MAP.md
git commit -m "docs(sales-summary): CHANGELOG + FILE_MAP for sales-updates bot"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage**
- Channels GoFood-by-outlet / K3Mart / Direct → Task 2 (`toInScope` filter + outlet grouping). ✅
- Gross headline + per-SKU qty → Task 2 (`rowGross`, product tallies) + Task 3 (`rupiah`, `products`). ✅
- Daily after best-effort refresh → Task 4 + Task 5 daily cron. ✅
- Weekly Mon 07:00 / Monthly 1st 08:00 with deltas → Task 1 ranges + Task 2 `deltaPct` + Task 5 crons. ✅
- Delete 3am BigSeller resync → Task 5. ✅
- No "units sold" aggregate (rule #13) → header is "Rp X · N orders"; products rendered as a per-SKU list only. ✅
- No schema change / operator assigns role → confirmed; Task 6 runbook note. ✅

**2. Placeholder scan** — no TBD/TODO; all code blocks complete; two "Execution note"s flag real schema checks (by_order index, menuProducts.name), not gaps.

**3. Type consistency** — `SalesSummaryData`/`ChannelSummary`/`OutletSummary`/`ProductTally` defined in Task 2, imported unchanged in Tasks 3–4. `RefreshStatus` defined in Task 3, imported in Task 4. `Cadence` defined in Task 1, reused in Tasks 2/4. Function names consistent: `resolveCadenceRange`, `getSalesSummary`, `formatSalesSummary`, `sendSalesSummary`.

---

## Risks / execution watch-items
1. **`orderItems` `by_order` index + `menuProducts.name` field** — assumed standard; type-check/test will fail loud if the names differ. Adjust accessor in Task 2.
2. **GoFood/K3Mart data shape** — Task 2 handles items, row-level fallback, and (internal) orderItems; if a channel uses a 4th shape, add a branch in the `addProduct` block and a seeding test.
3. **K3Mart cron auth** — `syncK3MartSales` resolves stored creds via `getK3MartToken(ctx)` (no session token); if it throws under cron, the daily footer shows `K3Mart ✗` and the summary still sends (by design).
4. **Read budget** — per-internal-order orderItems lookups scale with daily order count (~tens). Fine at current scale; if Direct order volume grows past ~1k/day, batch via a date-ranged `orders` query instead.
