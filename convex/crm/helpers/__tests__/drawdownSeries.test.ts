import { describe, it, expect } from "vitest";
import { Id, TableNames } from "../../../_generated/dataModel";
import { buildDrawdownSeries } from "../drawdownSeries";

// Fake Id helper — avoids convexTest overhead for a pure-fn test.
const fakeId = <T extends TableNames>(table: T, n = 1): Id<T> =>
  `${table}-fake-${n}` as unknown as Id<T>;

// Fixed reference: 2026-06-25 (Wednesday) 12:00 UTC
// Week: Mon 2026-06-22 → Sun 2026-06-28 (in epoch ms)
const DAY = 24 * 3600_000;

// Monday 2026-06-22 00:00 UTC (WIB = Mon 07:00, but dates are epoch ms — compare directly)
const MON = Date.UTC(2026, 5, 22, 0, 0, 0, 0);
const TUE = MON + 1 * DAY;
const WED = MON + 2 * DAY;
const THU = MON + 3 * DAY;
const FRI = MON + 4 * DAY;
const SAT = MON + 5 * DAY;
const SUN = MON + 6 * DAY;

// "today" is Wednesday (12:00 UTC, epoch ms)
const TODAY = Date.UTC(2026, 5, 24, 12, 0, 0, 0); // Wed 2026-06-24 12:00 UTC

// Minimal plannedDays items — per schema: date (epoch ms), qty per day = sum of items[].qty
const makePlannedDays = (
  days: { date: number; qty: number }[],
) =>
  days.map(({ date, qty }) => ({
    date,
    deliverByTime: "09:00",
    items: [
      {
        menuProductId: fakeId("menuProducts"),
        productName: "Original",
        qty,
        unitPrice: 29000,
        lineTotal: qty * 29000,
      },
    ],
    locked: false,
  }));

// Delivered: Mon=10, Tue=10 (both ≤ today), Wed/Thu/Fri/Sat/Sun=planned but not yet delivered
const DELIVERED_BY_DAY = [
  { date: MON, pcs: 10 },
  { date: TUE, pcs: 10 },
];

// Planned: Mon–Sun, 10 pcs/day
const PLANNED_DAYS = makePlannedDays([
  { date: MON, qty: 10 },
  { date: TUE, qty: 10 },
  { date: WED, qty: 10 },
  { date: THU, qty: 10 },
  { date: FRI, qty: 10 },
  { date: SAT, qty: 10 },
  { date: SUN, qty: 10 },
]);

// poolTrajectory: creditRemaining at end of each day (passed in; never re-keyed)
// Mon: 290000 → after 10 pcs @ 29000 → 290000 - 290000 = 0 (or whatever the pool says)
// For simplicity: start with 2030000 (70 pcs * 29000), deduct 290000/day
const POOL_TRAJECTORY = [
  { date: MON, creditRemaining: 1740000 }, // 2030000 - 290000
  { date: TUE, creditRemaining: 1450000 }, // - 290000 again
  { date: WED, creditRemaining: 1160000 }, // projected
  { date: THU, creditRemaining: 870000 },
  { date: FRI, creditRemaining: 580000 },
  { date: SAT, creditRemaining: 290000 },
  { date: SUN, creditRemaining: 0 },       // exhausted exactly at week end
];

// A trajectory where credit remains at week end (Sunday) → leftoverFlag = true
const POOL_TRAJECTORY_LEFTOVER = [
  { date: MON, creditRemaining: 1740000 },
  { date: TUE, creditRemaining: 1450000 },
  { date: WED, creditRemaining: 1160000 },
  { date: THU, creditRemaining: 870000 },
  { date: FRI, creditRemaining: 580000 },
  { date: SAT, creditRemaining: 290000 },
  { date: SUN, creditRemaining: 200000 }, // leftover > 0 on Sunday → flag
];

describe("buildDrawdownSeries", () => {
  it("partitions points into isPast (≤ today) and future (> today)", () => {
    const { points } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      PLANNED_DAYS,
      POOL_TRAJECTORY,
      TODAY,
    );

    // Mon, Tue, Wed = ≤ today → isPast = true
    const past = points.filter((p) => p.isPast);
    const future = points.filter((p) => !p.isPast);

    // WED is ≤ today (TODAY = Wed 12:00; WED = Wed 00:00)
    expect(past.map((p) => p.date)).toEqual([MON, TUE, WED]);
    expect(future.map((p) => p.date)).toEqual([THU, FRI, SAT, SUN]);
  });

  it("fills deliveredPcs from deliveredByDay for past days", () => {
    const { points } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      PLANNED_DAYS,
      POOL_TRAJECTORY,
      TODAY,
    );

    const mon = points.find((p) => p.date === MON)!;
    const tue = points.find((p) => p.date === TUE)!;
    const wed = points.find((p) => p.date === WED)!;

    expect(mon.deliveredPcs).toBe(10);
    expect(tue.deliveredPcs).toBe(10);
    // Wed is past but no delivery yet → 0
    expect(wed.deliveredPcs).toBe(0);
  });

  it("fills plannedPcs from plannedDays items sum for each day", () => {
    const { points } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      PLANNED_DAYS,
      POOL_TRAJECTORY,
      TODAY,
    );

    // Every day has 10 pcs planned
    points.forEach((p) => {
      expect(p.plannedPcs).toBe(10);
    });
  });

  it("reads creditRemaining directly from poolTrajectory (never re-keys)", () => {
    const { points } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      PLANNED_DAYS,
      POOL_TRAJECTORY,
      TODAY,
    );

    const mon = points.find((p) => p.date === MON)!;
    const sun = points.find((p) => p.date === SUN)!;

    expect(mon.creditRemaining).toBe(1740000);
    expect(sun.creditRemaining).toBe(0);
  });

  it("leftoverFlag = false when creditRemaining at week end (Sunday) = 0", () => {
    const { leftoverFlag } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      PLANNED_DAYS,
      POOL_TRAJECTORY,
      TODAY,
    );

    expect(leftoverFlag).toBe(false);
  });

  it("leftoverFlag = true when creditRemaining at week end (Sunday) > 0", () => {
    const { leftoverFlag } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      PLANNED_DAYS,
      POOL_TRAJECTORY_LEFTOVER,
      TODAY,
    );

    expect(leftoverFlag).toBe(true);
  });

  it("produces one point per plannedDay, sorted ascending by date", () => {
    const { points } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      PLANNED_DAYS,
      POOL_TRAJECTORY,
      TODAY,
    );

    expect(points).toHaveLength(7);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].date).toBeGreaterThan(points[i - 1].date);
    }
  });

  it("handles empty deliveredByDay — all past days show deliveredPcs = 0", () => {
    const { points } = buildDrawdownSeries(
      [],
      PLANNED_DAYS,
      POOL_TRAJECTORY,
      TODAY,
    );

    const past = points.filter((p) => p.isPast);
    past.forEach((p) => {
      expect(p.deliveredPcs).toBe(0);
    });
  });

  it("handles empty plannedDays — returns empty points, leftoverFlag = false", () => {
    const { points, leftoverFlag } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      [],
      [],
      TODAY,
    );

    expect(points).toHaveLength(0);
    expect(leftoverFlag).toBe(false);
  });

  it("day exactly equal to today is treated as past (isPast = true)", () => {
    // today = TODAY (Wed 12:00 UTC). WED = Wed 00:00 UTC. WED ≤ TODAY → isPast = true.
    const { points } = buildDrawdownSeries(
      DELIVERED_BY_DAY,
      makePlannedDays([{ date: TODAY, qty: 5 }]),
      [{ date: TODAY, creditRemaining: 500000 }],
      TODAY,
    );

    expect(points).toHaveLength(1);
    expect(points[0].isPast).toBe(true);
  });

  it("day just after today is treated as future (isPast = false)", () => {
    const TOMORROW = TODAY + 1 * DAY;
    const { points } = buildDrawdownSeries(
      [],
      makePlannedDays([{ date: TOMORROW, qty: 5 }]),
      [{ date: TOMORROW, creditRemaining: 500000 }],
      TODAY,
    );

    expect(points).toHaveLength(1);
    expect(points[0].isPast).toBe(false);
  });

  it("plannedPcs sums multiple items on the same day", () => {
    const multiItemDay: ReturnType<typeof makePlannedDays> = [
      {
        date: MON,
        deliverByTime: "09:00",
        items: [
          { menuProductId: fakeId("menuProducts", 1), productName: "A", qty: 3, unitPrice: 10000, lineTotal: 30000 },
          { menuProductId: fakeId("menuProducts", 2), productName: "B", qty: 7, unitPrice: 15000, lineTotal: 105000 },
        ],
        locked: false,
      },
    ];

    const { points } = buildDrawdownSeries(
      [],
      multiItemDay,
      [{ date: MON, creditRemaining: 1000000 }],
      TODAY,
    );

    expect(points[0].plannedPcs).toBe(10); // 3 + 7
  });
});
