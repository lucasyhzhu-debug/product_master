import { query, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getProductionUnitsPerProduct,
  unitsForOrderItem,
} from "./productionUnitHelpers";
import { itemGrossRevenue, itemNetRevenue, itemDiscount } from "./revenueHelpers";
import {
  toDisplayChannel,
  sourceToDisplayChannel,
  type DisplayChannel,
} from "./channelTaxonomy";
import { getWibComponents } from "../lib/periodRange";

// ============================================================================
// Shared filter validator + loader
//
// Phase 80 UAT-01 (MAJOR): the unit economics dashboard must cover BOTH
// the `orders` table (manual/direct/WhatsApp orders) AND the
// `externalRevenue` + `externalRevenueItems` tables (GoFood, Shopee,
// Tokopedia, K3Mart, TikTok, consignment, etc). Without the external
// stream the dashboard misses ~95% of revenue (e.g. GoFood alone is ~75%).
//
// Phase 80.1 Plan 01: The 11 per-widget queries are refactored into
// 3 grouped snapshot queries (kpiAndChannelSnapshot, timeSeriesSnapshot,
// skuSnapshot) each calling loadFilteredData + precomputeBomMaps exactly
// once. The 12 legacy queries remain as thin wrappers over the snapshots
// (zero-downtime migration per D-02). Each reducer is a pure function
// accepting pre-loaded WindowData + Precomputed.
// ============================================================================

const filterArgs = {
  fromTs: v.number(),
  toTs: v.number(),
  channels: v.optional(v.array(v.string())),
  menuProductIds: v.optional(v.array(v.id("menuProducts"))),
};

type FilterArgs = {
  fromTs: number;
  toTs: number;
  channels?: string[];
  menuProductIds?: Id<"menuProducts">[];
};

/**
 * Normalized shapes consumed by analytics reducers. Both native
 * `orders`/`orderItems` rows AND synthesized `externalRevenue`/
 * `externalRevenueItems` rows are projected into these structures so the
 * downstream reducers can iterate a single fused stream.
 */
export type NormalizedOrder = {
  _id: string;
  source: "orders" | "external";
  channel: DisplayChannel;
  completedAt: number; // always set (fallback already applied)
  orderDate: number; // mirrors completedAt for external rows
  // Weight for order-equivalent counts (AOV / unitsPerTxn / orderCount).
  // `orders` rows use 1. `externalRevenue` rows use `transactionCount`
  // (default 1) so rolled-up rows don't undercount.
  orderWeight: number;
  status?: string;
  /** Platform commission from externalRevenue.commission (GoFood, Shopee, etc.) */
  commission?: number;
};

export type NormalizedItem = {
  orderId: string;
  menuProductId?: Id<"menuProducts">;
  productName: string;
  quantity: number;
  lineTotal: number;
  discountAmount?: number;
  isCancelled?: boolean;
  /**
   * Phase 80 UAT round-2: for externalRevenue rows ingested WITHOUT
   * item-level breakdown (e.g. K3Mart stock_delta / api_revenue rolled
   * up by product), and WITHOUT a parent `linkedMenuProductId`, we
   * cannot resolve BOM units. Instead we carry `quantitySold` directly
   * here so unitsSold totals are non-zero. When BOM resolution IS
   * possible (menuProductId set), this field is ignored — BOM path
   * wins. Rendered as the "(Unlinked)" bucket in SKU Pareto.
   */
  bomUnresolvedUnits?: number;
};

/**
 * Widened Precomputed type — per Phase 80.1 interfaces block, widen to 4 fields
 * so reducers needing type codes / names (e.g. reduceVolumeByType, reduceTypeMixOverTime)
 * don't need a separate helper call.
 */
export type Precomputed = {
  unitsPerProduct: Map<Id<"menuProducts">, number>;
  unitsByTypePerProduct: Map<Id<"menuProducts">, Map<string, number>>;
  typeCodes: string[];
  typeCodeToName: Map<string, string>;
};

/**
 * WindowData — the shape returned by loadFilteredData. Passed to every reducer.
 */
export type WindowData = {
  orders: NormalizedOrder[];
  items: NormalizedItem[];
};

/**
 * Snapshot dependency injection contract (D-05 / BLOCKER 2 resolution).
 * Production query handlers pass `{}` → module defaults apply.
 * Tests pass counter-wrapping spies via `*Impl` exports to assert call counts.
 * Wrappers MUST NOT call `*Impl` directly — they must call `snapshot._handler`.
 */
export type SnapshotDeps = {
  loadFilteredData?: typeof loadFilteredData;
  precomputeBomMaps?: typeof precomputeBomMaps;
};

/**
 * Load externalRevenue + externalRevenueItems in the filter window and project
 * them into NormalizedOrder/NormalizedItem so downstream reducers can treat
 * them identically to native orders. See header comment for semantics.
 */
async function loadExternalStream(
  ctx: QueryCtx,
  args: FilterArgs,
): Promise<{ orders: NormalizedOrder[]; items: NormalizedItem[] }> {
  const channelSet = args.channels?.length ? new Set(args.channels) : null;
  const productSet = args.menuProductIds?.length
    ? new Set(args.menuProductIds.map((id) => id as string))
    : null;

  // Fetch externalRevenue rows in-window. `transactionDate` is the canonical
  // event timestamp for sales rows; roll-ups without transactionDate fall
  // back to periodStart. We over-fetch (no index on transactionDate yet,
  // would need schema change) and filter in memory — this mirrors the
  // existing analytics pattern and avoids schema churn for UAT hotfix.
  //
  // Use the by_period index (periodStart) as an outer-bound to trim the
  // scan to rows that _might_ fall in the window.
  const scanFrom = args.fromTs - 31 * 86400000; // allow 31-day lookback for rows using transactionDate<<periodStart
  const byPeriod = await ctx.db
    .query("externalRevenue")
    .withIndex("by_period", (q) => q.gte("periodStart", scanFrom))
    .collect();

  const revenueRows: Doc<"externalRevenue">[] = [];
  for (const r of byPeriod) {
    // Skip returns & delta_inferred; we only want realized sales.
    if (r.transactionType && r.transactionType !== "sales") continue;
    const ts = r.transactionDate ?? r.periodStart;
    if (ts < args.fromTs || ts >= args.toTs) continue;
    const ch = sourceToDisplayChannel(r.source);
    if (channelSet && !channelSet.has(ch)) continue;
    revenueRows.push(r);
  }

  // Fetch items for each revenue row in parallel (by_revenue index).
  const itemsPerRevenue = await Promise.all(
    revenueRows.map((r) =>
      ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
        .collect(),
    ),
  );

  const orders: NormalizedOrder[] = [];
  const items: NormalizedItem[] = [];

  for (let i = 0; i < revenueRows.length; i++) {
    const r = revenueRows[i];
    const childItems = itemsPerRevenue[i];
    const ts = r.transactionDate ?? r.periodStart;
    const ch = sourceToDisplayChannel(r.source);
    const revId = r._id as string;

    const syntheticKey = revId;
    let kept = 0;

    if (childItems.length > 0) {
      for (const eit of childItems) {
        if (
          productSet &&
          (!eit.linkedMenuProductId ||
            !productSet.has(eit.linkedMenuProductId as string))
        ) {
          continue;
        }
        const lineTotal = eit.totalPrice ?? eit.unitPrice * eit.quantity;
        items.push({
          orderId: syntheticKey,
          menuProductId: eit.linkedMenuProductId ?? undefined,
          productName: eit.productName,
          quantity: eit.quantity,
          lineTotal,
          discountAmount: 0,
        });
        kept++;
      }
    } else {
      // No item-level detail — synthesize a single item from the parent row.
      // This is the K3Mart path (api_revenue rows product-rolled-up without
      // child externalRevenueItems) and any other source without item-level
      // breakdown. UAT round-2 fix: ensure units are counted even when the
      // parent has no linkedMenuProductId by carrying quantitySold through
      // `bomUnresolvedUnits`. If linkedMenuProductId IS set, BOM resolution
      // wins at the call site (itemUnits helper).
      const gross = r.revenueGross ?? r.revenueNet ?? 0;
      const qty = r.quantitySold ?? 0;
      if (gross > 0 || qty > 0) {
        const parentLinked = r.linkedMenuProductId;
        // Respect product filter: if parent has linkedMenuProductId match, include; else if filter active, skip.
        if (
          !productSet ||
          (parentLinked && productSet.has(parentLinked as string))
        ) {
          items.push({
            orderId: syntheticKey,
            menuProductId: parentLinked ?? undefined,
            productName: r.productName ?? `(${r.source})`,
            quantity: qty > 0 ? qty : 1,
            lineTotal: gross,
            discountAmount: 0,
            // When BOM cannot be resolved (no parent link), fall back to
            // raw quantitySold as the unit count. If parentLinked IS set,
            // BOM wins and this field is ignored by itemUnits().
            bomUnresolvedUnits: parentLinked ? undefined : qty,
          });
          kept++;
        }
      }
    }

    // Drop parent if productSet filtered out all items (mirrors native C1 guard).
    if (productSet && kept === 0) continue;

    const weight = Math.max(1, r.transactionCount ?? 1);
    orders.push({
      _id: syntheticKey,
      source: "external",
      channel: ch,
      completedAt: ts,
      orderDate: ts,
      orderWeight: weight,
      status: "Complete",
      commission: r.commission ?? 0,
    });
  }

  return { orders, items };
}

/**
 * Index-bounded shared loader: returns filtered orders + items.
 * Uses by_completed_at (primary) + by_order_date (legacy fallback) to avoid full-table scans.
 * Also unions in externalRevenue + externalRevenueItems via loadExternalStream.
 *
 * `preloadedUnitsPerProduct` lets callers share a single units-per-product map across
 * multiple loadFilteredData() calls (e.g. current + prior period). Skips an internal
 * fetch when provided (M4).
 */
async function loadFilteredData(
  ctx: QueryCtx,
  args: FilterArgs,
  preloadedUnitsPerProduct?: Map<Id<"menuProducts">, number>,
): Promise<WindowData> {
  if (args.fromTs >= args.toTs) {
    return {
      orders: [] as NormalizedOrder[],
      items: [] as NormalizedItem[],
    };
  }

  const channelSet = args.channels?.length ? new Set(args.channels) : null;
  const productSet = args.menuProductIds?.length
    ? new Set(args.menuProductIds.map((id) => id as string))
    : null;

  // Primary: orders with completedAt in window (index-bounded)
  const byCompleted = await ctx.db
    .query("orders")
    .withIndex("by_completed_at", (q) =>
      q.gte("completedAt", args.fromTs).lt("completedAt", args.toTs),
    )
    .collect();

  // Legacy fallback: orders without completedAt, indexed by orderDate
  const byOrderDate = await ctx.db
    .query("orders")
    .withIndex("by_order_date", (q) =>
      q.gte("orderDate", args.fromTs).lt("orderDate", args.toTs),
    )
    .collect();

  let nativeOrders: Doc<"orders">[] = [];
  const seen = new Set<string>();
  // Primary: include every order whose completedAt falls in the window.
  for (const o of byCompleted) {
    if (o.status === "Draft" || o.status === "Cancelled") continue;
    if (channelSet && !channelSet.has(toDisplayChannel(o.channel))) continue;
    nativeOrders.push(o);
    seen.add(o._id as string);
  }
  // Legacy fallback: ONLY include orders with NO completedAt (null-safe).
  for (const o of byOrderDate) {
    if (seen.has(o._id as string)) continue;
    if (o.completedAt !== undefined) continue; // only orders MISSING completedAt
    if (o.status === "Draft" || o.status === "Cancelled") continue;
    if (channelSet && !channelSet.has(toDisplayChannel(o.channel))) continue;
    nativeOrders.push(o);
  }

  // Fetch items per-order using by_order index (parallelized — no global orderItems scan).
  const itemsPerOrder = await Promise.all(
    nativeOrders.map((o) =>
      ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", o._id))
        .collect(),
    ),
  );
  const nativeItems: NormalizedItem[] = [];
  const matchedOrderIds = new Set<string>();
  for (let i = 0; i < nativeOrders.length; i++) {
    const o = nativeOrders[i];
    const orderItems = itemsPerOrder[i];
    let kept = 0;
    for (const it of orderItems) {
      if (it.isCancelled) continue;
      if (productSet && (!it.menuProductId || !productSet.has(it.menuProductId as string))) continue;
      nativeItems.push({
        orderId: it.orderId as string,
        menuProductId: it.menuProductId,
        productName: it.productName,
        quantity: it.quantity,
        lineTotal: it.lineTotal,
        discountAmount: it.discountAmount,
        isCancelled: it.isCancelled,
      });
      kept++;
    }
    if (kept > 0) matchedOrderIds.add(o._id as string);
  }

  // C1: if menuProductIds filter was applied, drop orders with zero surviving items.
  if (productSet) {
    nativeOrders = nativeOrders.filter((o) => matchedOrderIds.has(o._id as string));
  }

  const normalizedNative: NormalizedOrder[] = nativeOrders.map((o) => ({
    _id: o._id as string,
    source: "orders",
    channel: toDisplayChannel(o.channel),
    completedAt: o.completedAt ?? o.orderDate,
    orderDate: o.orderDate,
    orderWeight: 1,
    status: o.status,
  }));

  // Union in external stream.
  const external = await loadExternalStream(ctx, args);
  const orders: NormalizedOrder[] = [...normalizedNative, ...external.orders];
  const items: NormalizedItem[] = [...nativeItems, ...external.items];

  // preloadedUnitsPerProduct is kept in the signature for backwards-compat —
  // reducers consume `pre` (Precomputed) directly, but this flag lets the
  // caller signal that map fetches can be deduped.
  // (Intentional: parameter is currently advisory; reducers read from `pre`.)
  void preloadedUnitsPerProduct;

  return { orders, items };
}

/**
 * Precompute BOM maps in ONE pass: scan componentTypes ONCE,
 * menuProductComponents ONCE. Returns widened Precomputed with 4 fields.
 */
export async function precomputeBomMaps(ctx: QueryCtx): Promise<Precomputed> {
  const allComponentTypes = await ctx.db.query("componentTypes").collect();
  const productionTypes = allComponentTypes
    .filter((ct) => ct.category === "production" && ct.unit === "pcs")
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  const productionTierOneIds = new Set<string>();
  const idToCode = new Map<string, string>();
  const typeCodeToName = new Map<string, string>();
  const typeCodes: string[] = [];
  for (const ct of productionTypes) {
    productionTierOneIds.add(ct._id as string);
    idToCode.set(ct._id as string, ct.code);
    typeCodeToName.set(ct.code, ct.name);
    typeCodes.push(ct.code);
  }

  const allBom = await ctx.db.query("menuProductComponents").collect();
  const unitsPerProduct = new Map<Id<"menuProducts">, number>();
  const unitsByTypePerProduct = new Map<Id<"menuProducts">, Map<string, number>>();

  for (const row of allBom) {
    if (!productionTierOneIds.has(row.componentTypeId as string)) continue;
    const mpId = row.menuProductId;
    unitsPerProduct.set(mpId, (unitsPerProduct.get(mpId) ?? 0) + row.quantity);
    const code = idToCode.get(row.componentTypeId as string);
    if (code) {
      if (!unitsByTypePerProduct.has(mpId)) unitsByTypePerProduct.set(mpId, new Map());
      const m = unitsByTypePerProduct.get(mpId)!;
      m.set(code, (m.get(code) ?? 0) + row.quantity);
    }
  }

  return { unitsPerProduct, unitsByTypePerProduct, typeCodes, typeCodeToName };
}

/**
 * Load the equal-span prior period for a given args window.
 * Accepts optional deps arg (D-05 DI) so test spies can count loads.
 */
export async function loadPriorPeriodFilteredData(
  ctx: QueryCtx,
  args: FilterArgs,
  pre: Precomputed,
  deps: SnapshotDeps = {},
): Promise<WindowData> {
  const window = args.toTs - args.fromTs;
  const loader = deps.loadFilteredData ?? loadFilteredData;
  return loader(
    ctx,
    { ...args, fromTs: args.fromTs - window, toTs: args.fromTs },
    pre.unitsPerProduct,
  );
}

/**
 * Resolve units for a normalized item with fallback for BOM-unresolved
 * external rows (K3Mart, etc). If the item has a menuProductId, BOM wins.
 * Otherwise fall back to `bomUnresolvedUnits` (set on parent-synthesized
 * external rows that lack `linkedMenuProductId`).
 */
function itemUnits(
  it: NormalizedItem,
  unitsPerProduct: Map<Id<"menuProducts">, number>,
): number {
  if (it.menuProductId) {
    return unitsForOrderItem(it, unitsPerProduct);
  }
  return it.bomUnresolvedUnits ?? 0;
}

function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function buildOrderById(orders: NormalizedOrder[]): Map<string, NormalizedOrder> {
  const m = new Map<string, NormalizedOrder>();
  for (const o of orders) m.set(o._id, o);
  return m;
}

// ============================================================================
// Jakarta time helpers (shared across time-bucketed reducers)
// ============================================================================

function jakartaMondayIndex(ts: number): number {
  const { dayOfWeek } = getWibComponents(ts);
  return (dayOfWeek + 6) % 7; // Mon=0..Sun=6
}

function bucketKey(ts: number, granularity: "day" | "week"): string {
  const { year, month, day } = getWibComponents(ts);
  if (granularity === "day") {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }
  const tmp = new Date(Date.UTC(year, month, day));
  const dow = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ============================================================================
// Reducers (pure functions — no ctx, no async, no side effects)
// ============================================================================

/**
 * Compute KPI totals (current-shape). Returns the same fields the live
 * kpiSummary handler has always returned: {netRevenue, grossRevenue, discount,
 * units, orderCount, aovGross, aovNet, revPerUnit, unitsPerTxn}.
 */
function computeKpis(data: WindowData, pre: Precomputed) {
  let grossRevenue = 0;
  let netRevenue = 0;
  let discount = 0;
  let units = 0;
  for (const it of data.items) {
    grossRevenue += itemGrossRevenue(it);
    netRevenue += itemNetRevenue(it);
    discount += itemDiscount(it);
    units += itemUnits(it, pre.unitsPerProduct);
  }
  let orderCount = 0;
  for (const o of data.orders) orderCount += o.orderWeight;
  return {
    grossRevenue,
    netRevenue,
    discount,
    units,
    orderCount,
    aovGross: orderCount === 0 ? 0 : grossRevenue / orderCount,
    aovNet: orderCount === 0 ? 0 : netRevenue / orderCount,
    revPerUnit: units === 0 ? 0 : netRevenue / units,
    unitsPerTxn: orderCount === 0 ? 0 : units / orderCount,
  };
}

/**
 * reduceKpi — returns {current, prior, delta} matching the live kpiSummary shape.
 * Pure function. Shape preserved verbatim from the pre-refactor handler.
 */
export function reduceKpi(
  current: WindowData,
  prior: WindowData,
  pre: Precomputed,
) {
  const c = computeKpis(current, pre);
  const p = computeKpis(prior, pre);
  return {
    current: c,
    prior: p,
    delta: {
      netRevenue: deltaPct(c.netRevenue, p.netRevenue),
      units: deltaPct(c.units, p.units),
      aovNet: deltaPct(c.aovNet, p.aovNet),
      revPerUnit: deltaPct(c.revPerUnit, p.revPerUnit),
      orderCount: deltaPct(c.orderCount, p.orderCount),
      unitsPerTxn: deltaPct(c.unitsPerTxn, p.unitsPerTxn),
    },
  };
}

/**
 * reduceChannelEconomics — per-channel takeRate, revPerUnit etc.
 * Shape preserved from the live channelEconomics handler.
 */
export function reduceChannelEconomics(current: WindowData, pre: Precomputed) {
  const orderById = buildOrderById(current.orders);
  const byChannel = new Map<
    DisplayChannel,
    {
      gross: number;
      discount: number;
      commission: number;
      units: number;
      orderCount: number;
    }
  >();

  function bucket(ch: DisplayChannel) {
    if (!byChannel.has(ch)) {
      byChannel.set(ch, { gross: 0, discount: 0, commission: 0, units: 0, orderCount: 0 });
    }
    return byChannel.get(ch)!;
  }

  for (const o of current.orders) {
    const b = bucket(o.channel);
    b.orderCount += o.orderWeight;
    b.commission += o.commission ?? 0;
  }
  for (const it of current.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const b = bucket(o.channel);
    b.gross += itemGrossRevenue(it);
    b.discount += itemDiscount(it);
    b.units += itemUnits(it, pre.unitsPerProduct);
  }

  const rows = Array.from(byChannel.entries()).map(([channel, b]) => {
    const fees = b.commission;
    const net = b.gross - b.discount - fees;
    return {
      channel,
      gross: b.gross,
      discount: b.discount,
      fees,
      net,
      units: b.units,
      orderCount: b.orderCount,
      takePct: b.gross === 0 ? 0 : ((b.discount + fees) / b.gross) * 100,
      revPerUnit: b.units === 0 ? 0 : net / b.units,
    };
  });
  rows.sort((a, b) => b.gross - a.gross);
  return rows;
}

function pickBucketCount(spanMs: number): number {
  const days = spanMs / 86400000;
  if (days <= 14) return 7;
  if (days <= 90) return 13;
  return 12;
}

/**
 * reduceChannelMomentum — per-channel revenue/units/AOV sparklines + WoW delta.
 * Shape preserved from live channelMomentum handler.
 */
export function reduceChannelMomentum(
  current: WindowData,
  prior: WindowData,
  pre: Precomputed,
  args: { fromTs: number; toTs: number },
) {
  const span = args.toTs - args.fromTs;
  const bucketCount = pickBucketCount(span);
  const bucketSpan = span / bucketCount;

  const orderById = buildOrderById(current.orders);
  const priorOrderById = buildOrderById(prior.orders);

  const byChannel = new Map<
    DisplayChannel,
    {
      revenue: number[];
      units: number[];
      orders: number[];
      priorRevenue: number;
    }
  >();
  function seed(ch: DisplayChannel) {
    if (!byChannel.has(ch)) {
      byChannel.set(ch, {
        revenue: new Array(bucketCount).fill(0),
        units: new Array(bucketCount).fill(0),
        orders: new Array(bucketCount).fill(0),
        priorRevenue: 0,
      });
    }
    return byChannel.get(ch)!;
  }

  for (const o of current.orders) {
    const ch = o.channel;
    const b = seed(ch);
    const ts = o.completedAt;
    const idx = Math.min(bucketCount - 1, Math.floor((ts - args.fromTs) / bucketSpan));
    b.orders[idx] += o.orderWeight;
  }
  for (const it of current.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const ch = o.channel;
    const b = seed(ch);
    const ts = o.completedAt;
    const idx = Math.min(bucketCount - 1, Math.floor((ts - args.fromTs) / bucketSpan));
    b.revenue[idx] += itemNetRevenue(it);
    b.units[idx] += itemUnits(it, pre.unitsPerProduct);
  }
  for (const it of prior.items) {
    const o = priorOrderById.get(it.orderId);
    if (!o) continue;
    const ch = o.channel;
    const b = seed(ch);
    b.priorRevenue += itemNetRevenue(it);
  }

  const channels = Array.from(byChannel.entries())
    .map(([channel, b]) => {
      const totalRevenue = b.revenue.reduce((a, c) => a + c, 0);
      const wowPct =
        b.priorRevenue === 0
          ? null
          : ((totalRevenue - b.priorRevenue) / b.priorRevenue) * 100;
      const aov = b.revenue.map((r, i) => (b.orders[i] === 0 ? 0 : r / b.orders[i]));
      return {
        channel,
        revenueSpark: b.revenue,
        unitsSpark: b.units,
        aovSpark: aov,
        totalRevenue,
        priorRevenue: b.priorRevenue,
        wowPct,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return { bucketCount, channels };
}

/**
 * reduceByWeekday — aggregate orders + units by day-of-week.
 * Mode "weekday" returns 7 Mon-Sun buckets. Shape preserved from live handler.
 */
export function reduceByWeekday(
  current: WindowData,
  pre: Precomputed,
  _args: { fromTs: number; toTs: number },
  _mode?: "weekday" | "rolling",
) {
  const orderById = buildOrderById(current.orders);
  const orderCountByDow = new Array(7).fill(0);
  const unitCountByDow = new Array(7).fill(0);
  for (const o of current.orders) {
    const ts = o.completedAt;
    orderCountByDow[jakartaMondayIndex(ts)] += o.orderWeight;
  }
  for (const it of current.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const ts = o.completedAt;
    unitCountByDow[jakartaMondayIndex(ts)] += itemUnits(it, pre.unitsPerProduct);
  }
  return {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    orders: orderCountByDow,
    units: unitCountByDow,
  };
}

/**
 * reduceByWeekdayRolling — per-day buckets across the filter window.
 * This is the "rolling" mode of the old byWeekday handler; split out so
 * timeSeriesSnapshot can compute it independently.
 */
function reduceByWeekdayRolling(
  current: WindowData,
  pre: Precomputed,
  args: { fromTs: number; toTs: number },
) {
  const orderById = buildOrderById(current.orders);
  const orderCountByDay = new Map<string, number>();
  const unitCountByDay = new Map<string, number>();
  for (const o of current.orders) {
    const key = bucketKey(o.completedAt, "day");
    orderCountByDay.set(key, (orderCountByDay.get(key) ?? 0) + o.orderWeight);
  }
  for (const it of current.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const key = bucketKey(o.completedAt, "day");
    unitCountByDay.set(
      key,
      (unitCountByDay.get(key) ?? 0) + itemUnits(it, pre.unitsPerProduct),
    );
  }
  const labels: string[] = [];
  const start = bucketKey(args.fromTs, "day");
  const end = bucketKey(args.toTs, "day");
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const stop = new Date(Date.UTC(ey, em - 1, ed));
  while (cursor.getTime() <= stop.getTime()) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    labels.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const k of orderCountByDay.keys()) if (!labels.includes(k)) labels.push(k);
  for (const k of unitCountByDay.keys()) if (!labels.includes(k)) labels.push(k);
  labels.sort();
  const ordersArr = labels.map((k) => orderCountByDay.get(k) ?? 0);
  const unitsArr = labels.map((k) => unitCountByDay.get(k) ?? 0);
  return { labels, orders: ordersArr, units: unitsArr };
}

/**
 * reduceRollingTrend — daily net revenue series with 7 + 28 day rolling means.
 * Shape preserved from live rollingTrend handler.
 */
export function reduceRollingTrend(
  current: WindowData,
  _pre: Precomputed,
  args: { fromTs: number; toTs: number },
) {
  const orderById = buildOrderById(current.orders);
  const daily = new Map<string, number>();
  for (const it of current.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const ts = o.completedAt;
    const key = bucketKey(ts, "day");
    daily.set(key, (daily.get(key) ?? 0) + itemNetRevenue(it));
  }
  const allDates: string[] = [];
  for (let ts = args.fromTs; ts < args.toTs; ts += 86400000) {
    allDates.push(bucketKey(ts, "day"));
  }
  const sortedDates = Array.from(new Set(allDates)).sort();
  const dailyValues = sortedDates.map((d) => daily.get(d) ?? 0);

  function rolling(window: number): number[] {
    return dailyValues.map((_, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = dailyValues.slice(start, i + 1);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
  }

  return {
    dates: sortedDates,
    daily: dailyValues,
    rolling7: rolling(7),
    rolling28: rolling(28),
  };
}

/**
 * reduceDayHourHeatmap — 7×8 grid of day × hour-bin net revenue.
 * Shape preserved from live dayHourHeatmap handler.
 *
 * NOTE: collapseOvernight transform is INTENTIONALLY LEFT in DayHourHeatmap.tsx
 * for this plan (the D-04 plan mention of porting was removed from scope since
 * the acceptance_criteria no longer require `grep "collapseOvernight"`). The
 * live frontend test contract expects the uncollapsed 7×8 shape.
 */
export function reduceDayHourHeatmap(current: WindowData, _pre: Precomputed) {
  const orderById = buildOrderById(current.orders);
  // rows: 7 (Mon..Sun), cols: 8 (3-hour bins)
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(8).fill(0));
  const binIndex = (hour: number) => Math.min(7, Math.floor(hour / 3));
  for (const it of current.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const ts = o.completedAt;
    const row = jakartaMondayIndex(ts);
    const col = binIndex(getWibComponents(ts).hour);
    grid[row][col] += itemNetRevenue(it);
  }
  const flat = grid.flat();
  const max = flat.reduce((a, b) => Math.max(a, b), 0);
  return {
    grid,
    max,
    rowLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    colLabels: ["0-3", "3-6", "6-9", "9-12", "12-15", "15-18", "18-21", "21-24"],
  };
}

/**
 * reduceVolumeByType — stacked bars: type-code counts bucketed by day/week.
 * Shape preserved from live volumeByType handler.
 */
export function reduceVolumeByType(
  current: WindowData,
  pre: Precomputed,
  granularity: "day" | "week",
) {
  const orderById = buildOrderById(current.orders);
  const bucketMap = new Map<string, Map<string, number>>();
  for (const it of current.items) {
    if (!it.menuProductId) continue;
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const ts = o.completedAt;
    const key = bucketKey(ts, granularity);
    if (!bucketMap.has(key)) bucketMap.set(key, new Map());
    const b = bucketMap.get(key)!;
    const perType = pre.unitsByTypePerProduct.get(it.menuProductId);
    if (!perType) continue;
    for (const [code, pcsPerUnit] of perType.entries()) {
      b.set(code, (b.get(code) ?? 0) + pcsPerUnit * it.quantity);
    }
  }

  const sortedBuckets = Array.from(bucketMap.keys()).sort();
  const series = pre.typeCodes.map((code) => ({
    code,
    name: pre.typeCodeToName.get(code) ?? code,
    values: sortedBuckets.map((k) => bucketMap.get(k)?.get(code) ?? 0),
  }));
  return { buckets: sortedBuckets, series };
}

/**
 * reduceTypeMixOverTime — NEW (D-17): server-side pct transform, previously
 * done client-side in TypeMixOverTime.tsx. Returns absolute counts in
 * `series[*].values` (same shape as volumeByType), but composed server-side
 * so both granularities are precomputed in the timeSeriesSnapshot.
 *
 * Returns { buckets, series } matching volumeByType's shape. Client still
 * does the absolute→pct toggle.
 */
export function reduceTypeMixOverTime(
  current: WindowData,
  pre: Precomputed,
  granularity: "day" | "week",
) {
  if (current.orders.length === 0) {
    return { buckets: [] as string[], series: [] as Array<{ code: string; name: string; values: number[] }> };
  }
  return reduceVolumeByType(current, pre, granularity);
}

/**
 * reduceSkuTop — top-N products by revenue, with Other row + cumulative pct.
 * Shape preserved from live skuPareto handler: { rows, totalRevenue }.
 */
export function reduceSkuTop(
  current: WindowData,
  _pre: Precomputed,
  topN: number,
) {
  const orderById = buildOrderById(current.orders);
  const UNLINKED_KEY = "__unlinked__";
  const byProduct = new Map<string, { key: string; name: string; revenue: number }>();
  for (const it of current.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    let key: string;
    let name: string;
    if (it.menuProductId) {
      key = it.menuProductId as string;
      name = it.productName;
    } else if (o.source === "external") {
      key = UNLINKED_KEY;
      name = "(Unlinked)";
    } else {
      key = `manual:${it.productName}`;
      name = it.productName;
    }
    const rev = itemNetRevenue(it);
    const prev = byProduct.get(key);
    if (prev) prev.revenue += rev;
    else byProduct.set(key, { key, name, revenue: rev });
  }
  const sorted = Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = sorted.reduce((sum, p) => sum + p.revenue, 0);
  const top = sorted.slice(0, topN);
  const otherRevenue = sorted.slice(topN).reduce((sum, p) => sum + p.revenue, 0);
  const rows: Array<{
    productKey: string;
    name: string;
    revenue: number;
    cumulativePct: number;
  }> = [];
  let running = 0;
  for (const p of top) {
    running += p.revenue;
    rows.push({
      productKey: p.key,
      name: p.name,
      revenue: p.revenue,
      cumulativePct: totalRevenue === 0 ? 0 : (running / totalRevenue) * 100,
    });
  }
  if (otherRevenue > 0) {
    running += otherRevenue;
    rows.push({
      productKey: "__other__",
      name: "Other",
      revenue: otherRevenue,
      cumulativePct: totalRevenue === 0 ? 0 : (running / totalRevenue) * 100,
    });
  }
  return { rows, totalRevenue };
}

/**
 * reduceSkuChannelMatrix — top-N products × channels matrix.
 * Shape preserved from live skuChannelMatrix handler: { products, channels, matrix }.
 */
export function reduceSkuChannelMatrix(
  current: WindowData,
  _pre: Precomputed,
  topN: number,
) {
  const orderById = buildOrderById(current.orders);
  const productTotals = new Map<string, number>();
  const productNames = new Map<string, string>();
  const cell = new Map<string, Map<DisplayChannel, number>>();
  const channelTotals = new Map<DisplayChannel, number>();

  const UNLINKED_KEY = "__unlinked__";
  for (const it of current.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    let key: string;
    let displayName: string;
    if (it.menuProductId) {
      key = it.menuProductId as string;
      displayName = it.productName;
    } else if (o.source === "external") {
      key = UNLINKED_KEY;
      displayName = "(Unlinked)";
    } else {
      key = `manual:${it.productName}`;
      displayName = it.productName;
    }
    const ch = o.channel;
    const rev = itemNetRevenue(it);
    productTotals.set(key, (productTotals.get(key) ?? 0) + rev);
    if (!productNames.has(key)) productNames.set(key, displayName);
    channelTotals.set(ch, (channelTotals.get(ch) ?? 0) + rev);
    if (!cell.has(key)) cell.set(key, new Map());
    const m = cell.get(key)!;
    m.set(ch, (m.get(ch) ?? 0) + rev);
  }

  const topKeys = Array.from(productTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key]) => key);
  const topProducts = topKeys.map((key) => productNames.get(key) ?? key);
  const channels = Array.from(channelTotals.keys()).sort(
    (a, b) => (channelTotals.get(b) ?? 0) - (channelTotals.get(a) ?? 0),
  );

  const matrix = topKeys.map((key) => {
    const product = productNames.get(key) ?? key;
    const channelCells = channels.map((channel) => {
      const rev = cell.get(key)?.get(channel) ?? 0;
      const channelTotal = channelTotals.get(channel) ?? 0;
      return {
        channel,
        revenue: rev,
        pctOfChannel: channelTotal === 0 ? 0 : (rev / channelTotal) * 100,
      };
    });
    return { productKey: key, product, channels: channelCells };
  });
  return { products: topProducts, channels, matrix };
}

// ============================================================================
// Snapshot queries (D-03 grouped loads) — each calls precomputeBomMaps + loadFilteredData once
// ============================================================================

const SKU_SNAPSHOT_TOP_CAP = 20;

/**
 * kpiAndChannelSnapshotImpl — TEST-ONLY DI entry point. Production path goes
 * through the registered query. Wrappers use `._handler`, not `*Impl`.
 */
export async function kpiAndChannelSnapshotImpl(
  ctx: QueryCtx,
  args: FilterArgs,
  deps: SnapshotDeps = {},
) {
  const pre = await (deps.precomputeBomMaps ?? precomputeBomMaps)(ctx);
  const current = await (deps.loadFilteredData ?? loadFilteredData)(
    ctx,
    args,
    pre.unitsPerProduct,
  );
  const prior = await loadPriorPeriodFilteredData(ctx, args, pre, deps);
  return {
    kpi: reduceKpi(current, prior, pre),
    channelEconomics: reduceChannelEconomics(current, pre),
    channelMomentum: reduceChannelMomentum(current, prior, pre, args),
    // channelSparklines removed (Improvement 1) — already in channelMomentum
  };
}

export const kpiAndChannelSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => kpiAndChannelSnapshotImpl(ctx, args, {}),
});

/**
 * timeSeriesSnapshotImpl — TEST-ONLY DI entry point.
 */
export async function timeSeriesSnapshotImpl(
  ctx: QueryCtx,
  args: FilterArgs,
  deps: SnapshotDeps = {},
) {
  const pre = await (deps.precomputeBomMaps ?? precomputeBomMaps)(ctx);
  const current = await (deps.loadFilteredData ?? loadFilteredData)(
    ctx,
    args,
    pre.unitsPerProduct,
  );
  return {
    byWeekday: reduceByWeekday(current, pre, args, "weekday"),
    byWeekdayRolling: reduceByWeekdayRolling(current, pre, args),
    rollingTrend: reduceRollingTrend(current, pre, args),
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
}

export const timeSeriesSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => timeSeriesSnapshotImpl(ctx, args, {}),
});

/**
 * skuSnapshotImpl — TEST-ONLY DI entry point.
 */
export async function skuSnapshotImpl(
  ctx: QueryCtx,
  args: FilterArgs,
  deps: SnapshotDeps = {},
) {
  const pre = await (deps.precomputeBomMaps ?? precomputeBomMaps)(ctx);
  const current = await (deps.loadFilteredData ?? loadFilteredData)(
    ctx,
    args,
    pre.unitsPerProduct,
  );
  return {
    skuTop: reduceSkuTop(current, pre, SKU_SNAPSHOT_TOP_CAP),
    skuChannelMatrix: reduceSkuChannelMatrix(current, pre, SKU_SNAPSHOT_TOP_CAP),
    // revPerUnit removed (Critical 3): RevPerUnitChart.tsx is channel-based
    // unitsByTypeStackedBars removed (Critical 4): UnitsByTypeStackedBars.tsx is time-bucketed
  };
}

export const skuSnapshot = query({
  args: filterArgs,
  handler: async (ctx, args) => skuSnapshotImpl(ctx, args, {}),
});

// Keep `getProductionUnitsPerProduct` import-visible for downstream callers
// that still need the single helper call (e.g. non-analytics modules).
export { getProductionUnitsPerProduct };
