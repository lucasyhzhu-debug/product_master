import { query, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getProductionUnitsPerProduct,
  getProductionUnitsByTypePerProduct,
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
// Mapping notes for `externalRevenue` rows:
//   - `transactionDate` is the canonical event timestamp; fall back to
//     `periodStart` when absent.
//   - `transactionCount` (when set) is respected as the "order equivalent"
//     multiplier — a single externalRevenue row may represent multiple
//     transactions (e.g. a daily K3Mart roll-up).
//   - `externalRevenueItems.linkedMenuProductId` is used for BOM-based unit
//     counting. Items without a link are included in revenue totals but
//     contribute zero units (shown as "Unlinked" in SKU Pareto; skipped
//     by units-based metrics).
//   - Commission is a PARENT-level field. Item-level analytics do not
//     apportion commission back to items; commission is only used for
//     order-level reporting (AOV / take-rate). The take-rate test is
//     approximate for this reason.
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
 * Normalized shapes consumed by the 11 analytics queries. Both native
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
  const matchedRevenueIds = new Set<string>();

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

    matchedRevenueIds.add(revId);
    const weight = Math.max(1, r.transactionCount ?? 1);
    orders.push({
      _id: syntheticKey,
      source: "external",
      channel: ch,
      completedAt: ts,
      orderDate: ts,
      orderWeight: weight,
      status: "Complete",
    });
  }

  return { orders, items };
}

/**
 * Index-bounded shared loader: returns filtered orders + items + unit-per-product map.
 * Uses by_completed_at (primary) + by_order_date (legacy fallback) to avoid full-table scans.
 * Also unions in externalRevenue + externalRevenueItems via loadExternalStream.
 *
 * `preloadedUnitsPerProduct` lets callers share a single units-per-product map across
 * multiple loadFilteredData() calls (e.g. current + prior period). Skips an internal
 * fetch when provided (see M4).
 */
async function loadFilteredData(
  ctx: QueryCtx,
  args: FilterArgs,
  preloadedUnitsPerProduct?: Map<Id<"menuProducts">, number>,
) {
  if (args.fromTs >= args.toTs) {
    const unitsPerProduct =
      preloadedUnitsPerProduct ?? (await getProductionUnitsPerProduct(ctx));
    return {
      orders: [] as NormalizedOrder[],
      items: [] as NormalizedItem[],
      orderById: new Map<string, NormalizedOrder>(),
      unitsPerProduct,
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
  // This is the "true" event date for reporting.
  for (const o of byCompleted) {
    if (o.status === "Draft" || o.status === "Cancelled") continue;
    if (channelSet && !channelSet.has(toDisplayChannel(o.channel))) continue;
    nativeOrders.push(o);
    seen.add(o._id as string);
  }
  // Legacy fallback: ONLY include orders with NO completedAt (null-safe).
  //
  // Intentional asymmetry (WR-06): orders that have completedAt outside the
  // window are dropped even if their orderDate falls inside it. Their "true"
  // event date is completedAt, which places them in a different period. Do
  // NOT relax this guard to allow completed orders through — that would
  // double-bucket the same order into two periods.
  for (const o of byOrderDate) {
    if (seen.has(o._id as string)) continue;
    if (o.completedAt !== undefined) continue; // only orders MISSING completedAt
    if (o.status === "Draft" || o.status === "Cancelled") continue;
    if (channelSet && !channelSet.has(toDisplayChannel(o.channel))) continue;
    nativeOrders.push(o);
  }

  // Fetch items per-order using by_order index (parallelized — no global orderItems scan).
  // I4: replace sequential for-loop await with Promise.all.
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
  // Otherwise orderCount / AOV / unitsPerTxn / aovByChannel inflate with unrelated orders.
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

  const orderById = new Map<string, NormalizedOrder>();
  for (const o of orders) orderById.set(o._id, o);

  const unitsPerProduct =
    preloadedUnitsPerProduct ?? (await getProductionUnitsPerProduct(ctx));
  return { orders, items, orderById, unitsPerProduct };
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

function priorPeriod(args: FilterArgs): FilterArgs {
  const span = args.toTs - args.fromTs;
  return { ...args, fromTs: args.fromTs - span, toTs: args.fromTs };
}

function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

// ============================================================================
// KPI summary (A)
// ============================================================================

function computeKpis(
  orders: NormalizedOrder[],
  items: NormalizedItem[],
  unitsPerProduct: Map<Id<"menuProducts">, number>,
) {
  let grossRevenue = 0;
  let netRevenue = 0;
  let discount = 0;
  let units = 0;
  for (const it of items) {
    grossRevenue += itemGrossRevenue(it);
    netRevenue += itemNetRevenue(it);
    discount += itemDiscount(it);
    units += itemUnits(it, unitsPerProduct);
  }
  // Order-equivalent count: native orders = 1, externalRevenue rows = transactionCount.
  let orderCount = 0;
  for (const o of orders) orderCount += o.orderWeight;
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

export const kpiSummary = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    // M4: fetch once, share across current+prior loads.
    const unitsPerProduct = await getProductionUnitsPerProduct(ctx);
    const current = await loadFilteredData(ctx, args, unitsPerProduct);
    const prior = await loadFilteredData(ctx, priorPeriod(args), unitsPerProduct);
    const cur = computeKpis(current.orders, current.items, current.unitsPerProduct);
    const pri = computeKpis(prior.orders, prior.items, prior.unitsPerProduct);
    return {
      current: cur,
      prior: pri,
      delta: {
        netRevenue: deltaPct(cur.netRevenue, pri.netRevenue),
        units: deltaPct(cur.units, pri.units),
        aovNet: deltaPct(cur.aovNet, pri.aovNet),
        revPerUnit: deltaPct(cur.revPerUnit, pri.revPerUnit),
        orderCount: deltaPct(cur.orderCount, pri.orderCount),
        unitsPerTxn: deltaPct(cur.unitsPerTxn, pri.unitsPerTxn),
      },
    };
  },
});

// ============================================================================
// Jakarta time helpers (shared across T3-T7)
// ============================================================================

function jakartaMondayIndex(ts: number): number {
  const { dayOfWeek } = getWibComponents(ts);
  return (dayOfWeek + 6) % 7; // Mon=0..Sun=6
}

function jakartaHour(ts: number): number {
  return getWibComponents(ts).hour;
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
// Time pattern queries (B1, B2)
// ============================================================================

export const byWeekday = query({
  args: {
    ...filterArgs,
    mode: v.optional(v.union(v.literal("weekday"), v.literal("rolling"))),
  },
  handler: async (ctx, args) => {
    const { orders, items, orderById, unitsPerProduct } = await loadFilteredData(ctx, args);
    const mode = args.mode ?? "weekday";

    if (mode === "rolling") {
      // Per-day buckets across the filter window (date strings).
      const orderCountByDay = new Map<string, number>();
      const unitCountByDay = new Map<string, number>();
      for (const o of orders) {
        const key = bucketKey(o.completedAt, "day");
        orderCountByDay.set(key, (orderCountByDay.get(key) ?? 0) + o.orderWeight);
      }
      for (const it of items) {
        const o = orderById.get(it.orderId);
        if (!o) continue;
        const key = bucketKey(o.completedAt, "day");
        unitCountByDay.set(
          key,
          (unitCountByDay.get(key) ?? 0) + itemUnits(it, unitsPerProduct),
        );
      }
      // Build a continuous date range from fromTs..toTs to include zero-days.
      const labels: string[] = [];
      const start = bucketKey(args.fromTs, "day");
      const end = bucketKey(args.toTs, "day");
      // Iterate one day at a time using UTC arithmetic on the WIB date strings.
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
      // Merge-in any keys from the data that fell outside the iterated range
      // (defensive: shouldn't happen but avoid silent drops).
      for (const k of orderCountByDay.keys()) if (!labels.includes(k)) labels.push(k);
      for (const k of unitCountByDay.keys()) if (!labels.includes(k)) labels.push(k);
      labels.sort();
      const ordersArr = labels.map((k) => orderCountByDay.get(k) ?? 0);
      const unitsArr = labels.map((k) => unitCountByDay.get(k) ?? 0);
      return { labels, orders: ordersArr, units: unitsArr };
    }

    const orderCountByDow = new Array(7).fill(0);
    const unitCountByDow = new Array(7).fill(0);
    for (const o of orders) {
      const ts = o.completedAt;
      orderCountByDow[jakartaMondayIndex(ts)] += o.orderWeight;
    }
    for (const it of items) {
      const o = orderById.get(it.orderId);
      if (!o) continue;
      const ts = o.completedAt;
      unitCountByDow[jakartaMondayIndex(ts)] += itemUnits(it, unitsPerProduct);
    }
    return {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      orders: orderCountByDow,
      units: unitCountByDow,
    };
  },
});

export const dayHourHeatmap = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const { items, orderById } = await loadFilteredData(ctx, args);
    // rows: 7 (Mon..Sun), cols: 8 (3-hour bins)
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(8).fill(0));
    const binIndex = (hour: number) => Math.min(7, Math.floor(hour / 3));
    for (const it of items) {
      const o = orderById.get(it.orderId);
      if (!o) continue;
      const ts = o.completedAt;
      const row = jakartaMondayIndex(ts);
      const col = binIndex(jakartaHour(ts));
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
  },
});

// ============================================================================
// Channel economics (C3, C4)
// ============================================================================

export const channelEconomics = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const { orders, items, orderById, unitsPerProduct } = await loadFilteredData(ctx, args);

    const byChannel = new Map<DisplayChannel, {
      gross: number;
      discount: number;
      units: number;
      orderCount: number;
    }>();

    function bucket(ch: DisplayChannel) {
      if (!byChannel.has(ch)) {
        byChannel.set(ch, { gross: 0, discount: 0, units: 0, orderCount: 0 });
      }
      return byChannel.get(ch)!;
    }

    // Order-level pass for orderCount (weighted by orderWeight).
    for (const o of orders) {
      bucket(o.channel).orderCount += o.orderWeight;
    }

    for (const it of items) {
      const o = orderById.get(it.orderId);
      if (!o) continue;
      const b = bucket(o.channel);
      b.gross += itemGrossRevenue(it);
      b.discount += itemDiscount(it);
      b.units += itemUnits(it, unitsPerProduct);
    }

    const rows = Array.from(byChannel.entries()).map(([channel, b]) => {
      const net = b.gross - b.discount;
      // v1: platform fees = 0 (deferred per spec). Take-rate reflects discount depth only.
      const fees = 0;
      // TODO(v2): split revPerUnit vs netPerUnit when fees are modelled
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
  },
});

// ============================================================================
// Volume & mix queries (D1, D2, D3, D4)
// ============================================================================

export const volumeByType = query({
  args: { ...filterArgs, granularity: v.union(v.literal("day"), v.literal("week")) },
  handler: async (ctx, args) => {
    const { items, orderById } = await loadFilteredData(ctx, args);
    const { byProduct, typeCodes, typeCodeToName } = await getProductionUnitsByTypePerProduct(ctx);

    const bucketMap = new Map<string, Map<string, number>>();
    for (const it of items) {
      if (!it.menuProductId) continue;
      const o = orderById.get(it.orderId);
      if (!o) continue;
      const ts = o.completedAt;
      const key = bucketKey(ts, args.granularity);
      if (!bucketMap.has(key)) bucketMap.set(key, new Map());
      const b = bucketMap.get(key)!;
      const perType = byProduct.get(it.menuProductId);
      if (!perType) continue;
      for (const [code, pcsPerUnit] of perType.entries()) {
        b.set(code, (b.get(code) ?? 0) + pcsPerUnit * it.quantity);
      }
    }

    const sortedBuckets = Array.from(bucketMap.keys()).sort();
    const series = typeCodes.map((code) => ({
      code,
      name: typeCodeToName.get(code) ?? code,
      values: sortedBuckets.map((k) => bucketMap.get(k)?.get(code) ?? 0),
    }));
    return { buckets: sortedBuckets, series };
  },
});

export const unitsPerTxnByChannel = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const { orders, items, orderById, unitsPerProduct } = await loadFilteredData(ctx, args);
    const byChannel = new Map<DisplayChannel, { units: number; orderCount: number }>();
    for (const o of orders) {
      const ch = o.channel;
      if (!byChannel.has(ch)) byChannel.set(ch, { units: 0, orderCount: 0 });
      byChannel.get(ch)!.orderCount += o.orderWeight;
    }
    for (const it of items) {
      const o = orderById.get(it.orderId);
      if (!o) continue;
      const ch = o.channel;
      if (!byChannel.has(ch)) byChannel.set(ch, { units: 0, orderCount: 0 });
      byChannel.get(ch)!.units += itemUnits(it, unitsPerProduct);
    }
    return Array.from(byChannel.entries())
      .map(([channel, b]) => ({
        channel,
        units: b.units,
        orderCount: b.orderCount,
        unitsPerTxn: b.orderCount === 0 ? 0 : b.units / b.orderCount,
      }))
      .sort((a, b) => b.unitsPerTxn - a.unitsPerTxn);
  },
});

export const aovByChannel = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const { orders, items, orderById } = await loadFilteredData(ctx, args);
    const byChannel = new Map<
      DisplayChannel,
      { gross: number; net: number; orderCount: number }
    >();
    for (const o of orders) {
      const ch = o.channel;
      if (!byChannel.has(ch)) byChannel.set(ch, { gross: 0, net: 0, orderCount: 0 });
      byChannel.get(ch)!.orderCount += o.orderWeight;
    }
    for (const it of items) {
      const o = orderById.get(it.orderId);
      if (!o) continue;
      const ch = o.channel;
      if (!byChannel.has(ch)) byChannel.set(ch, { gross: 0, net: 0, orderCount: 0 });
      const b = byChannel.get(ch)!;
      b.gross += itemGrossRevenue(it);
      b.net += itemNetRevenue(it);
    }
    return Array.from(byChannel.entries())
      .map(([channel, b]) => ({
        channel,
        orderCount: b.orderCount,
        grossAov: b.orderCount === 0 ? 0 : b.gross / b.orderCount,
        netAov: b.orderCount === 0 ? 0 : b.net / b.orderCount,
      }))
      .sort((a, b) => b.grossAov - a.grossAov);
  },
});

// ============================================================================
// Concentration queries (E1, E2)
// ============================================================================

export const skuPareto = query({
  args: { ...filterArgs, topN: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { items, orderById } = await loadFilteredData(ctx, args);
    // Group by menuProductId (canonical identity). Fall back to a synthetic
    // `manual:${productName}` key for native manual items with no menuProductId
    // so they still appear but do not merge with BOM-linked products of the
    // same display name (see WR-05). External items without linkedMenuProductId
    // roll up into a single "(Unlinked)" bucket since their productName is
    // platform-specific and unit-resolution is impossible (UAT-01).
    const UNLINKED_KEY = "__unlinked__";
    const byProduct = new Map<string, { key: string; name: string; revenue: number }>();
    for (const it of items) {
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
    const topN = args.topN ?? 10;
    const top = sorted.slice(0, topN);
    const otherRevenue = sorted.slice(topN).reduce((sum, p) => sum + p.revenue, 0);
    // I3: productKey is stable identity (menuProductId or `manual:<name>`).
    // UI must use productKey for React keys to handle products that share a display name.
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
  },
});

export const skuChannelMatrix = query({
  args: { ...filterArgs, topN: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { items, orderById } = await loadFilteredData(ctx, args);
    // Group by canonical product key (menuProductId) — see WR-05. Display name
    // is preserved for the UI row label but identity is the menuProductId.
    const productTotals = new Map<string, number>();
    const productNames = new Map<string, string>();
    const cell = new Map<string, Map<DisplayChannel, number>>();
    const channelTotals = new Map<DisplayChannel, number>();

    const UNLINKED_KEY = "__unlinked__";
    for (const it of items) {
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

    const topN = args.topN ?? 8;
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
      // I3: productKey is stable identity for React keys (two products can share display name).
      return { productKey: key, product, channels: channelCells };
    });
    return { products: topProducts, channels, matrix };
  },
});

// ============================================================================
// Momentum queries (F1, F2)
// ============================================================================

function pickBucketCount(spanMs: number): number {
  const days = spanMs / 86400000;
  if (days <= 14) return 7;
  if (days <= 90) return 13;
  return 12;
}

export const channelMomentum = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const span = args.toTs - args.fromTs;
    const bucketCount = pickBucketCount(span);
    const bucketSpan = span / bucketCount;

    // M4: fetch once, share across current+prior loads.
    const unitsPerProductMap = await getProductionUnitsPerProduct(ctx);
    const { orders, items, orderById, unitsPerProduct } = await loadFilteredData(
      ctx,
      args,
      unitsPerProductMap,
    );
    const priorData = await loadFilteredData(ctx, priorPeriod(args), unitsPerProductMap);

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

    for (const o of orders) {
      const ch = o.channel;
      const b = seed(ch);
      const ts = o.completedAt;
      const idx = Math.min(bucketCount - 1, Math.floor((ts - args.fromTs) / bucketSpan));
      b.orders[idx] += o.orderWeight;
    }
    for (const it of items) {
      const o = orderById.get(it.orderId);
      if (!o) continue;
      const ch = o.channel;
      const b = seed(ch);
      const ts = o.completedAt;
      const idx = Math.min(bucketCount - 1, Math.floor((ts - args.fromTs) / bucketSpan));
      b.revenue[idx] += itemNetRevenue(it);
      b.units[idx] += itemUnits(it, unitsPerProduct);
    }
    for (const it of priorData.items) {
      const o = priorData.orderById.get(it.orderId);
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
  },
});

export const rollingTrend = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    const { items, orderById } = await loadFilteredData(ctx, args);
    const daily = new Map<string, number>();
    for (const it of items) {
      const o = orderById.get(it.orderId);
      if (!o) continue;
      const ts = o.completedAt;
      const key = bucketKey(ts, "day");
      daily.set(key, (daily.get(key) ?? 0) + itemNetRevenue(it));
    }
    // Build a contiguous list of WIB calendar days spanning [fromTs, toTs) so
    // zero-revenue days are preserved. Averaging over data-point days only
    // would overstate rolling means during slow periods (see WR-02).
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
  },
});
