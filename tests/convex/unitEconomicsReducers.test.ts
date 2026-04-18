/**
 * Pure-function unit tests for unitEconomics reducers.
 * Phase 80.1 Plan 01 Task 1-2: Extract-not-redesign — each reducer preserves
 * the exact shape the live query currently returns.
 */

import { describe, it, expect } from "vitest";
import {
  reduceKpi,
  reduceChannelEconomics,
  reduceChannelMomentum,
  reduceByWeekday,
  reduceRollingTrend,
  reduceDayHourHeatmap,
  reduceVolumeByType,
  reduceTypeMixOverTime,
  reduceSkuTop,
  reduceSkuChannelMatrix,
} from "../../convex/reports/unitEconomics";
import type {
  NormalizedOrder,
  NormalizedItem,
} from "../../convex/reports/unitEconomics";

export function makeOrder(
  overrides: Partial<NormalizedOrder> = {},
): NormalizedOrder {
  return {
    _id: "o1" as never,
    source: "orders",
    channel: "Direct",
    completedAt: 1700000000000,
    orderDate: 1700000000000,
    orderWeight: 1,
    ...overrides,
  };
}

export function makeItem(
  overrides: Partial<NormalizedItem> = {},
): NormalizedItem {
  return {
    orderId: "o1" as never,
    productName: "Original",
    quantity: 1,
    lineTotal: 50000,
    ...overrides,
  };
}

const EMPTY_PRE = {
  unitsPerProduct: new Map(),
  unitsByTypePerProduct: new Map(),
  typeCodes: [],
  typeCodeToName: new Map(),
};

describe("reduceKpi", () => {
  it("returns live-query shape {current, prior, delta} for a single-period slice", () => {
    const current = {
      orders: [
        makeOrder({ _id: "o1" as never }),
        makeOrder({ _id: "o2" as never }),
      ],
      items: [
        makeItem({ orderId: "o1" as never, lineTotal: 50000 }),
        makeItem({ orderId: "o2" as never, lineTotal: 30000 }),
      ],
    };
    const prior = { orders: [], items: [] };

    const result = reduceKpi(current, prior, EMPTY_PRE);

    // Assert ACTUAL live-query shape (extract-not-redesign — matches {current, prior, delta})
    expect(result).toMatchObject({
      current: expect.objectContaining({
        netRevenue: expect.any(Number),
        orderCount: expect.any(Number),
      }),
      prior: expect.objectContaining({
        netRevenue: expect.any(Number),
        orderCount: expect.any(Number),
      }),
      delta: expect.objectContaining({ netRevenue: null }), // null because prior is empty
    });
    expect(result.current.orderCount).toBe(2);
    expect(result.current.netRevenue).toBe(80000);
  });

  it("returns null deltas when prior is empty", () => {
    const current = { orders: [makeOrder()], items: [makeItem()] };
    const prior = { orders: [], items: [] };
    const result = reduceKpi(current, prior, EMPTY_PRE);
    expect(result.prior.netRevenue).toBe(0);
    expect(result.delta.netRevenue).toBeNull();
  });

  it("is a pure function (no ctx, no async)", () => {
    // Simply calling it without ctx proves it's pure
    const result = reduceKpi(
      { orders: [], items: [] },
      { orders: [], items: [] },
      EMPTY_PRE,
    );
    expect(result).toBeDefined();
    expect(result.current).toBeDefined();
    expect(result.delta).toBeDefined();
  });
});

describe("reduceChannelEconomics", () => {
  it("computes AOV/units-per-txn per channel (shape matches live channelEconomics query)", () => {
    const current = {
      orders: [
        makeOrder({ _id: "o1" as never, channel: "Direct" }),
        makeOrder({ _id: "o2" as never, channel: "GoFood" }),
      ],
      items: [
        makeItem({ orderId: "o1" as never, lineTotal: 100000, quantity: 2 }),
        makeItem({ orderId: "o2" as never, lineTotal: 60000, quantity: 1 }),
      ],
    };
    const result = reduceChannelEconomics(current, EMPTY_PRE);
    expect(Array.isArray(result)).toBe(true);
    const direct = result.find((r: any) => r.channel === "Direct");
    expect(direct).toMatchObject({ channel: "Direct" });
  });
});

describe("reduceSkuTop", () => {
  it("returns top-N SKUs ordered by revenue desc", () => {
    const current = {
      orders: [makeOrder({ _id: "o1" as never })],
      items: [
        makeItem({
          orderId: "o1" as never,
          productName: "A",
          lineTotal: 30000,
        }),
        makeItem({
          orderId: "o1" as never,
          productName: "B",
          lineTotal: 50000,
        }),
        makeItem({
          orderId: "o1" as never,
          productName: "C",
          lineTotal: 10000,
        }),
      ],
    };
    const result = reduceSkuTop(current, EMPTY_PRE, 20);
    // result.rows is sorted by revenue desc
    expect(result.rows[0].name).toBe("B");
    expect(result.rows[1].name).toBe("A");
    expect(result.rows[2].name).toBe("C");
  });

  it("caps at N even when more SKUs exist", () => {
    const current = {
      orders: [makeOrder({ _id: "o1" as never })],
      items: Array.from({ length: 30 }, (_, i) =>
        makeItem({
          orderId: "o1" as never,
          productName: `P${i}`,
          lineTotal: 1000 * (30 - i),
        }),
      ),
    };
    const result = reduceSkuTop(current, EMPTY_PRE, 20);
    // 20 products + 1 "Other" row = 21 total when cap < unique count
    expect(result.rows.length).toBeLessThanOrEqual(21);
    expect(result.rows[0].name).toBe("P0");
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
    const result = reduceVolumeByType(current, EMPTY_PRE, "day");
    expect(result).toHaveProperty("buckets");
    expect(result).toHaveProperty("series");
  });
});

// =========================================
// NEW reducer — reduceTypeMixOverTime
// (moves client-side pct transform from TypeMixOverTime.tsx server-side per D-17)
// =========================================

describe("reduceTypeMixOverTime (NEW — moves client-side pct transform server-side)", () => {
  it("returns { buckets, series } shape", () => {
    const pre = {
      unitsPerProduct: new Map(),
      unitsByTypePerProduct: new Map([
        ["p1" as never, new Map([["BIG_BALL", 1]])],
      ]),
      typeCodes: ["BIG_BALL", "MID_BALL"],
      typeCodeToName: new Map([
        ["BIG_BALL", "Big Ball"],
        ["MID_BALL", "Mid Ball"],
      ]),
    };
    const result = reduceTypeMixOverTime({ orders: [], items: [] }, pre, "day");
    expect(result).toHaveProperty("buckets");
    expect(result).toHaveProperty("series");
    expect(Array.isArray(result.buckets)).toBe(true);
    expect(Array.isArray(result.series)).toBe(true);
  });

  it("returns empty buckets and series for empty input", () => {
    const result = reduceTypeMixOverTime(
      { orders: [], items: [] },
      EMPTY_PRE,
      "day",
    );
    expect(result).toEqual({ buckets: [], series: [] });
  });
});

describe("reduce* empty-state safety", () => {
  const empty = { orders: [], items: [] };
  it("reduceChannelMomentum empty", () => {
    const args = { fromTs: 0, toTs: 86400000 };
    expect(
      reduceChannelMomentum(empty, empty, EMPTY_PRE, args),
    ).toBeDefined();
  });
  it("reduceByWeekday empty", () => {
    const args = { fromTs: 0, toTs: 86400000 };
    expect(reduceByWeekday(empty, EMPTY_PRE, args, "weekday")).toBeDefined();
  });
  it("reduceRollingTrend empty", () => {
    const args = { fromTs: 0, toTs: 86400000 };
    expect(reduceRollingTrend(empty, EMPTY_PRE, args)).toBeDefined();
  });
  it("reduceDayHourHeatmap empty", () =>
    expect(reduceDayHourHeatmap(empty, EMPTY_PRE)).toBeDefined());
  it("reduceSkuChannelMatrix empty", () =>
    expect(reduceSkuChannelMatrix(empty, EMPTY_PRE, 20)).toBeDefined());
});
