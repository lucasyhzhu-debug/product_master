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

const IN_SCOPE_SOURCES = ["gobiz", "k3mart", "internal"] as const;

// Pull in-range externalRevenue for the 3 in-scope sources via the compound
// by_source_period index — reads ONLY these sources, not the
// whole period across bigseller/shopee/tiktok/grabfood/consignment.
//
// SCALE NOTE: this query + the product fan-out below issue O(rows) index reads
// (one externalRevenueItems lookup per non-internal row; one orders + one
// orderItems lookup per internal row). At the current scale (~1K externalRevenue
// records total) a monthly run stays well under Convex's 16,384-read
// per-query limit. WATCH-ITEM: when a monthly run's in-scope rows exceed ~5K,
// move product aggregation to pre-aggregation/pagination.
async function fetchInScopeRevenue(
  ctx: QueryCtx,
  start: number,
  end: number,
): Promise<Doc<"externalRevenue">[]> {
  const perSource = await Promise.all(
    IN_SCOPE_SOURCES.map((source) =>
      ctx.db.query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", source).gte("periodStart", start).lt("periodStart", end))
        .collect()
    )
  );
  return perSource.flat();
}

function toInScope(source: Doc<"externalRevenue">["source"]): InScopePlatform | null {
  const p = resolvePlatform({ source }).platform;
  // Equality chain narrows p to InScopePlatform in the true branch — no cast needed.
  return p === "GoFood" || p === "K3Mart" || p === "Direct" ? p : null;
}

// Gross for one row. For internal (Direct) rows, prefer the order's totalAmount
// (the dashboard's source) so Direct gross matches getRevenueByOutletInternal.
// KEEP IN SYNC with the internal-order gross rule in convex/externalData/queries.ts
// (getRevenueByOutletInternal) — if that selection changes, mirror it here.
function rowGross(
  row: Doc<"externalRevenue">,
  orderMap: Map<string, { totalAmount: number; finalTotal: number; deliveryFee: number }>,
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

    const [curOrderMap, prevOrderMap] = await Promise.all([
      fetchInternalOrderDataMap(ctx, currentRows),
      fetchInternalOrderDataMap(ctx, previousRows),
    ]);

    const outletIds = [...new Set(
      currentRows.filter((r) => r.outletId).map((r) => r.outletId!)
    )];
    const outletNames = new Map<string, string>();
    await Promise.all(outletIds.map(async (id) => {
      const o = await ctx.db.get(id);
      if (o) outletNames.set(id, o.name);
    }));

    // Fetch externalRevenueItems for non-internal rows
    const itemsByRevenue = new Map<string, Doc<"externalRevenueItems">[]>();
    await Promise.all(currentRows.map(async (r) => {
      if (r.source === "internal") return;
      const items = await ctx.db.query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", r._id)).collect();
      if (items.length > 0) itemsByRevenue.set(r._id, items);
    }));

    // Fetch menuProduct names for linked items
    const linkedIds = new Set<Id<"menuProducts">>();
    for (const items of itemsByRevenue.values()) {
      for (const it of items) {
        if (it.linkedMenuProductId) linkedIds.add(it.linkedMenuProductId);
      }
    }
    const menuName = new Map<string, string>();
    await Promise.all([...linkedIds].map(async (id) => {
      const mp = await ctx.db.get(id);
      if (mp) menuName.set(id, mp.name);
    }));

    // Fetch orderItems for internal rows
    const internalOrderItems = new Map<string, Doc<"orderItems">[]>();
    await Promise.all(
      currentRows
        .filter((r) => r.source === "internal" && r.externalTransactionId)
        .map(async (r) => {
          const order = await ctx.db.query("orders")
            .withIndex("by_order_number", (q) => q.eq("orderNumber", r.externalTransactionId!))
            .first();
          if (!order) return;
          const oi = await ctx.db.query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id)).collect();
          internalOrderItems.set(r._id, oi);
        })
    );

    type OutletAgg = { name: string; gross: number; orders: number; products: Map<string, number> };
    type ChannelAgg = {
      gross: number; orders: number;
      outlets: Map<string, OutletAgg>;
      products: Map<string, number>;
    };
    const channels = new Map<InScopePlatform, ChannelAgg>();

    for (const row of currentRows) {
      // Skip returns & delta_inferred; we only want realized sales.
      // Canonical predicate from convex/reports/unitEconomics.ts line 216.
      // NOTE: getRevenueByOutletInternal (the dashboard) does NOT filter returns,
      // so K3Mart gross here reads LOWER than the dashboard for periods with
      // returns. This is intentional — the summary reports realized sales only.
      if (row.transactionType && row.transactionType !== "sales") continue;
      const platform = toInScope(row.source);
      if (!platform) continue;

      if (!channels.has(platform)) {
        channels.set(platform, { gross: 0, orders: 0, outlets: new Map(), products: new Map() });
      }
      const ch = channels.get(platform)!;
      const gross = rowGross(row, curOrderMap);
      const orders = row.transactionCount ?? 1;
      ch.gross += gross;
      ch.orders += orders;

      const outletKey = row.outletId ?? "—";
      const outletName = row.outletId ? (outletNames.get(row.outletId) ?? "Unknown") : "—";
      if (!ch.outlets.has(outletKey)) {
        ch.outlets.set(outletKey, { name: outletName, gross: 0, orders: 0, products: new Map() });
      }
      const out = ch.outlets.get(outletKey)!;
      out.gross += gross;
      out.orders += orders;

      const addProduct = (name: string, qty: number) => {
        ch.products.set(name, (ch.products.get(name) ?? 0) + qty);
        out.products.set(name, (out.products.get(name) ?? 0) + qty);
      };

      const items = itemsByRevenue.get(row._id);
      if (items) {
        for (const it of items) {
          const name =
            (it.linkedMenuProductId && menuName.get(it.linkedMenuProductId)) ||
            it.productName;
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

    // Aggregate previous period gross by platform
    const prevGross = new Map<InScopePlatform, number>();
    let prevGrandGross = 0;
    for (const row of previousRows) {
      // Skip returns & delta_inferred; we only want realized sales.
      // Canonical predicate from convex/reports/unitEconomics.ts line 216.
      if (row.transactionType && row.transactionType !== "sales") continue;
      const platform = toInScope(row.source);
      if (!platform) continue;
      const g = rowGross(row, prevOrderMap);
      prevGross.set(platform, (prevGross.get(platform) ?? 0) + g);
      prevGrandGross += g;
    }

    const topProducts = args.cadence === "daily" ? TOP_N_DAILY : TOP_N_PERIOD;
    const result: ChannelSummary[] = [];
    let grandGross = 0;
    let grandOrders = 0;

    for (const [platform, ch] of channels) {
      grandGross += ch.gross;
      // K3Mart "orders" are per-product-line counts, not customer orders (the
      // formatter hides them per-channel for the same reason) — exclude from the
      // headline order total so it stays a genuine order count.
      if (platform !== "K3Mart") grandOrders += ch.orders;
      result.push({
        platform,
        gross: ch.gross,
        orders: ch.orders,
        deltaPct: withDelta ? pctDelta(ch.gross, prevGross.get(platform) ?? 0) : null,
        outlets: [...ch.outlets.values()]
          .sort((a, b) => b.gross - a.gross)
          .map((o) => ({
            name: o.name,
            gross: o.gross,
            orders: o.orders,
            products: topN(o.products, topProducts),
          })),
        products: topN(ch.products, topProducts),
      });
    }

    result.sort((a, b) => b.gross - a.gross);

    return {
      cadence: args.cadence,
      periodLabel: range.periodLabel,
      generatedAt: nowMs,
      grandTotal: {
        gross: grandGross,
        orders: grandOrders,
        deltaPct: withDelta ? pctDelta(grandGross, prevGrandGross) : null,
      },
      channels: result,
    };
  },
});
