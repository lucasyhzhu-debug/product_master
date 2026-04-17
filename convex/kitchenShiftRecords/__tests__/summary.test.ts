/**
 * Phase 74 Plan 04 — real integration tests for the additive attendance extension
 * of getStaffPerformanceSummary.
 *
 * Covers hours sum, open-shift contribution (D-03), distinct daysAttended,
 * flaggedShiftCount, retroactive production (D-07), BOM-ball-counting
 * preservation, D-11 no-cross-unit subtotals, 4-flag-rule integration, D-14
 * adapter fallback when kitchenConfig lacks componentTracking, and C-5
 * componentTracking subset semantics.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { seedUser, insertAttendance } from "../../staffAttendance/__tests__/helpers";
import { OPEN_SHIFT_THRESHOLD_MS } from "../../staffAttendance/constants";
import { toWibDateString } from "../../staffAttendance/flagEngine";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Insert a kitchenShiftRecords row for the given chef. */
async function insertShiftRecord(
  t: ReturnType<typeof convexTest>,
  args: {
    date: string;
    chefUserId: Id<"users">;
    chefName: string;
    produced?: Array<{ menuProductId: Id<"menuProducts">; quantity: number }>;
    waste?: Array<{
      menuProductId: Id<"menuProducts">;
      quantity: number;
      reason: "qa_testing" | "spoilage" | "waste";
    }>;
    componentProduced?: Array<{
      kitchenComponentCode: string;
      kitchenComponentName: string;
      grams: number;
    }>;
  },
): Promise<Id<"kitchenShiftRecords">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("kitchenShiftRecords", {
      date: args.date,
      submittedAt: Date.now(),
      submittedBy: args.chefName,
      chefUserId: args.chefUserId,
      chefName: args.chefName,
      produced: args.produced ?? [],
      waste: args.waste ?? [],
      inventoryUpdates: [],
      componentProduced: args.componentProduced,
    });
  });
}

/** Seed the BOM: one menuProduct + one BIG_BALL production componentType link. */
async function seedBigBallProduct(
  t: ReturnType<typeof convexTest>,
  opts: { code?: string; name?: string; bigBallQty?: number; midBallQty?: number } = {},
): Promise<{
  menuProductId: Id<"menuProducts">;
  bigBallTypeId: Id<"componentTypes">;
  midBallTypeId: Id<"componentTypes">;
}> {
  return await t.run(async (ctx) => {
    const bigBallTypeId = await ctx.db.insert("componentTypes", {
      code: "BIG_BALL",
      name: "Big Ball",
      category: "production",
      gramsPerUnit: 80,
      unitCostIdr: 5000,
      unit: "pcs",
      trackInventory: false,
      sortOrder: 1,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
    const midBallTypeId = await ctx.db.insert("componentTypes", {
      code: "MID_BALL",
      name: "Mid Ball",
      category: "production",
      gramsPerUnit: 45,
      unitCostIdr: 3000,
      unit: "pcs",
      trackInventory: false,
      sortOrder: 2,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
    const menuProductId = await ctx.db.insert("menuProducts", {
      code: opts.code ?? "ORIG",
      name: opts.name ?? "Original (80g)",
      grams: 80,
      defaultPrice: 35000,
      isActive: true,
      unitCost: 15000,
      cachedProductionSummary: "1 Big",
    });
    if ((opts.bigBallQty ?? 1) > 0) {
      await ctx.db.insert("menuProductComponents", {
        menuProductId,
        componentTypeId: bigBallTypeId,
        quantity: opts.bigBallQty ?? 1,
        sortOrder: 1,
      });
    }
    if ((opts.midBallQty ?? 0) > 0) {
      await ctx.db.insert("menuProductComponents", {
        menuProductId,
        componentTypeId: midBallTypeId,
        quantity: opts.midBallQty!,
        sortOrder: 2,
      });
    }
    return { menuProductId, bigBallTypeId, midBallTypeId };
  });
}

describe("getStaffPerformanceSummary attendance extension", () => {
  it("totalHoursWorked sums closed durationMs (open shifts contribute 0, D-03)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    const today = toWibDateString(Date.now());
    // Closed session 1: 1h
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 5 * HOUR_MS,
      clockOut: Date.now() - 4 * HOUR_MS,
      durationMs: HOUR_MS,
    });
    // Closed session 2: 2h
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 3 * HOUR_MS,
      clockOut: Date.now() - 1 * HOUR_MS,
      durationMs: 2 * HOUR_MS,
    });
    // Open session — should NOT contribute to totalHoursWorked.
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 30 * 60 * 1000,
    });

    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: today, endDate: today },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    expect(staff).toBeDefined();
    expect(staff!.totalHoursWorked).toBe(3);
  });

  it("daysAttended counts distinct dates with at least one clock-in", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    const base = Date.now();
    const d1 = toWibDateString(base - 2 * DAY_MS);
    const d2 = toWibDateString(base - 1 * DAY_MS);
    // Two sessions on d1, one on d2 → distinct count = 2.
    await insertAttendance(t, {
      userId,
      date: d1,
      clockIn: base - 2 * DAY_MS,
      clockOut: base - 2 * DAY_MS + HOUR_MS,
      durationMs: HOUR_MS,
    });
    await insertAttendance(t, {
      userId,
      date: d1,
      clockIn: base - 2 * DAY_MS + 2 * HOUR_MS,
      clockOut: base - 2 * DAY_MS + 3 * HOUR_MS,
      durationMs: HOUR_MS,
    });
    await insertAttendance(t, {
      userId,
      date: d2,
      clockIn: base - 1 * DAY_MS,
      clockOut: base - 1 * DAY_MS + HOUR_MS,
      durationMs: HOUR_MS,
    });

    const start = toWibDateString(base - 3 * DAY_MS);
    const end = toWibDateString(base);
    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: start, endDate: end },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    expect(staff?.daysAttended).toBe(2);
  });

  it("BOM-resolved ball counting preserved by the aggregation", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });
    const { menuProductId } = await seedBigBallProduct(t, {
      bigBallQty: 1,
      midBallQty: 2,
    }); // 3 balls per product

    const today = toWibDateString(Date.now());
    await insertShiftRecord(t, {
      date: today,
      chefUserId: userId,
      chefName: "Chef",
      produced: [{ menuProductId, quantity: 5 }], // 5 products * 3 balls = 15
    });
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - HOUR_MS,
      clockOut: Date.now(),
      durationMs: HOUR_MS,
    });

    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: today, endDate: today },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    expect(staff?.totalBallsProduced).toBe(15);
  });

  it("flaggedShiftCount counts sessions flagged by the engine", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    // Open shift from 2 days ago → missing_clockout + over_16h flags.
    const priorDate = toWibDateString(Date.now() - 2 * DAY_MS);
    await insertAttendance(t, {
      userId,
      date: priorDate,
      clockIn: Date.now() - 2 * DAY_MS,
    });

    const start = toWibDateString(Date.now() - 5 * DAY_MS);
    const end = toWibDateString(Date.now());
    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: start, endDate: end },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    expect(staff).toBeDefined();
    expect(staff!.flaggedShiftCount).toBeGreaterThanOrEqual(1);
  });

  it("staff with attendance but zero production still appear (D-07 retroactive)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Prep Only", role: "kitchen" });

    const today = toWibDateString(Date.now());
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 2 * HOUR_MS,
      clockOut: Date.now() - HOUR_MS,
      durationMs: HOUR_MS,
    });
    // No kitchenShiftRecords for this user.

    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: today, endDate: today },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    expect(staff).toBeDefined();
    expect(staff!.totalBallsProduced).toBe(0);
    expect(staff!.totalHoursWorked).toBe(1);
  });

  it("component subtotals preserve unit — no cross-unit summing (D-11)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });
    const { menuProductId } = await seedBigBallProduct(t, {
      bigBallQty: 1,
      midBallQty: 0,
    }); // 1 Big per product → code BIG_BALL (pcs)

    // Seed a kitchenComponent with unit=g.
    await t.run(async (ctx) => {
      await ctx.db.insert("kitchenComponents", {
        name: "Outer Marshmallow",
        code: "OUTER_MARSH",
        unit: "g",
        isActive: true,
        sortOrder: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const today = toWibDateString(Date.now());
    await insertShiftRecord(t, {
      date: today,
      chefUserId: userId,
      chefName: "Chef",
      produced: [{ menuProductId, quantity: 5 }], // 5 BIG_BALL pcs
      componentProduced: [
        {
          kitchenComponentCode: "OUTER_MARSH",
          kitchenComponentName: "Outer Marshmallow",
          grams: 200,
        },
      ],
    });
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - HOUR_MS,
      clockOut: Date.now(),
      durationMs: HOUR_MS,
    });

    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: today, endDate: today },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    const day = staff?.perDayBreakdown.find((d) => d.date === today);
    expect(day).toBeDefined();
    // D-11: two entries with DIFFERENT units — NOT a single summed row.
    const units = new Set(day!.componentTotals.map((c) => c.unit));
    expect(units.has("pcs")).toBe(true);
    expect(units.has("g")).toBe(true);
    const pcsEntry = day!.componentTotals.find((c) => c.unit === "pcs");
    const gEntry = day!.componentTotals.find((c) => c.unit === "g");
    expect(pcsEntry?.quantity).toBe(5);
    expect(gEntry?.quantity).toBe(200);
  });

  it("all 4 flag-engine rule types surface through extended query", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const hireDate = Date.now() - 30 * DAY_MS;
    const { userId } = await seedUser(t, {
      name: "Chef",
      role: "kitchen",
      hireDate,
    });

    const now = Date.now();
    const today = toWibDateString(now);
    const yesterday = toWibDateString(now - DAY_MS);
    const twoDaysAgo = toWibDateString(now - 2 * DAY_MS);
    const beforeHire = toWibDateString(hireDate - 2 * DAY_MS);

    // (a) before_hire: clockIn < hireDate (clock-in BEFORE hireDate)
    await insertAttendance(t, {
      userId,
      date: beforeHire,
      clockIn: hireDate - 2 * DAY_MS,
      clockOut: hireDate - 2 * DAY_MS + HOUR_MS,
      durationMs: HOUR_MS,
    });
    // (b) over_16h: open shift older than threshold — but must not also cross a day
    //     to be distinguishable from missing_clockout? Actually both apply.
    //     Use "today with clockIn > 16h ago" — then date=today so missing_clockout is skipped.
    //     But we need today's date string for 16h ago which crosses a date. Use date=today
    //     and record.date=today so missing_clockout doesn't fire (record.date < todayWib).
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: now - (OPEN_SHIFT_THRESHOLD_MS + HOUR_MS),
    });
    // (c) missing_clockout: open shift on a prior date (yesterday).
    await insertAttendance(t, {
      userId,
      date: yesterday,
      clockIn: now - DAY_MS - HOUR_MS,
    });
    // (d) overlapping: two closed sessions on twoDaysAgo whose time ranges overlap.
    const baseMs = now - 2 * DAY_MS;
    await insertAttendance(t, {
      userId,
      date: twoDaysAgo,
      clockIn: baseMs,
      clockOut: baseMs + 2 * HOUR_MS,
      durationMs: 2 * HOUR_MS,
    });
    await insertAttendance(t, {
      userId,
      date: twoDaysAgo,
      clockIn: baseMs + HOUR_MS, // overlaps the first session
      clockOut: baseMs + 3 * HOUR_MS,
      durationMs: 2 * HOUR_MS,
    });

    const start = toWibDateString(hireDate - 5 * DAY_MS);
    const end = today;
    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: start, endDate: end },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    expect(staff).toBeDefined();
    const allReasons = new Set(
      staff!.perDayBreakdown.flatMap((d) =>
        d.sessions.flatMap((s) => s.flagReasons),
      ),
    );
    expect(allReasons.has("before_hire")).toBe(true);
    expect(allReasons.has("over_16h")).toBe(true);
    expect(allReasons.has("missing_clockout")).toBe(true);
    expect(allReasons.has("overlapping")).toBe(true);
  });

  it("componentTotals non-empty when kitchenConfig lacks componentTracking field", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });
    const { menuProductId } = await seedBigBallProduct(t, {
      bigBallQty: 1,
      midBallQty: 0,
    });

    // Seed kitchenComponent OUTER_MARSH.
    await t.run(async (ctx) => {
      await ctx.db.insert("kitchenComponents", {
        name: "Outer Marshmallow",
        code: "OUTER_MARSH",
        unit: "g",
        isActive: true,
        sortOrder: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    // Seed kitchenConfig WITHOUT componentTracking — main-tree shape.
    await t.run(async (ctx) => {
      await ctx.db.insert("kitchenConfig", {
        maxProductionTarget: 200,
        bigBallTarget: 150,
        midBallTarget: 50,
        updatedAt: Date.now(),
        updatedBy: "admin",
      });
    });

    const today = toWibDateString(Date.now());
    await insertShiftRecord(t, {
      date: today,
      chefUserId: userId,
      chefName: "Chef",
      produced: [{ menuProductId, quantity: 3 }], // BIG_BALL x 3
      componentProduced: [
        {
          kitchenComponentCode: "OUTER_MARSH",
          kitchenComponentName: "Outer Marshmallow",
          grams: 120,
        },
      ],
    });
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - HOUR_MS,
      clockOut: Date.now(),
      durationMs: HOUR_MS,
    });

    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: today, endDate: today },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    const day = staff?.perDayBreakdown.find((d) => d.date === today);
    expect(day).toBeDefined();
    // Adapter fallback derives tracking from tables — expect BIG_BALL + OUTER_MARSH entries.
    expect(day!.componentTotals.length).toBeGreaterThanOrEqual(2);
    const codes = new Set(day!.componentTotals.map((c) => c.code));
    expect(codes.has("BIG_BALL")).toBe(true);
    expect(codes.has("OUTER_MARSH")).toBe(true);
  });

  it("componentTracking subsets authoritatively (C-5 fix — staff review 2026-04-16)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });
    // Both BIG_BALL and MID_BALL in the BOM.
    const { menuProductId } = await seedBigBallProduct(t, {
      bigBallQty: 1,
      midBallQty: 2,
    });

    // Seed kitchenConfig on the main-tree shape (no componentTracking field in
    // the schema validator). Subset tracking is driven by enabledProductionComponents
    // containing ONLY BIG_BALL — MID_BALL must be filtered out of componentTotals.
    // This mirrors the worktree-merged semantics ("componentTracking is authoritative
    // when present — subsetting is intended behavior, not a bug") via the legacy
    // shape that the adapter falls through to.
    await t.run(async (ctx) => {
      await ctx.db.insert("kitchenConfig", {
        maxProductionTarget: 200,
        bigBallTarget: 150,
        midBallTarget: 50,
        enabledProductionComponents: ["BIG_BALL"],
        enabledKitchenComponents: [],
        updatedAt: Date.now(),
        updatedBy: "admin",
      });
    });

    const today = toWibDateString(Date.now());
    await insertShiftRecord(t, {
      date: today,
      chefUserId: userId,
      chefName: "Chef",
      produced: [{ menuProductId, quantity: 4 }], // 4 BIG_BALL + 8 MID_BALL via BOM
    });
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - HOUR_MS,
      clockOut: Date.now(),
      durationMs: HOUR_MS,
    });

    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      { token: mgrToken, startDate: today, endDate: today },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    const day = staff?.perDayBreakdown.find((d) => d.date === today);
    expect(day).toBeDefined();
    const codes = day!.componentTotals.map((c) => c.code);
    expect(codes).toContain("BIG_BALL");
    expect(codes).not.toContain("MID_BALL");
  });

  it("perDayBreakdown sorts dates descending", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    const base = Date.now();
    const d1 = toWibDateString(base - 3 * DAY_MS);
    const d2 = toWibDateString(base - 2 * DAY_MS);
    const d3 = toWibDateString(base - 1 * DAY_MS);
    for (const [d, offset] of [
      [d1, -3 * DAY_MS],
      [d2, -2 * DAY_MS],
      [d3, -1 * DAY_MS],
    ] as const) {
      await insertAttendance(t, {
        userId,
        date: d,
        clockIn: base + offset,
        clockOut: base + offset + HOUR_MS,
        durationMs: HOUR_MS,
      });
    }
    const result = await t.query(
      api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
      {
        token: mgrToken,
        startDate: toWibDateString(base - 5 * DAY_MS),
        endDate: toWibDateString(base),
      },
    );
    const staff = result.staff.find((s) => s.chefUserId === String(userId));
    const dates = staff!.perDayBreakdown.map((d) => d.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });
});
