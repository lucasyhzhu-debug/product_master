/**
 * Phase 74 Plan 04 — real clockIn mutation tests.
 *
 * Covers the D-04 blocker, same-day guard, token-derived userId (T-74-01),
 * soft-delete handling, and WIB-date computation via getWibDateStr (I-6).
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedUser, insertAttendance } from "./helpers";
import { getWibDateStr } from "../../lib/periodRange";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("clockIn", () => {
  it("creates an open attendance row (clockOut undefined) with date=todayWib", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef A", role: "kitchen" });

    const attendanceId = await t.mutation(
      api.staffAttendance.mutations.clockIn,
      { token },
    );
    expect(attendanceId).toBeDefined();

    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row).not.toBeNull();
    expect(row?.userId).toBe(userId);
    expect(row?.clockOut).toBeUndefined();
    expect(row?.durationMs).toBeUndefined();
    expect(row?.date).toBe(getWibDateStr(Date.now()));
  });

  it("derives userId from requireRole session (never from args)", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef B", role: "kitchen" });
    // Seed a second user that the test would "like" to spoof into.
    const { userId: otherUserId } = await seedUser(t, { name: "Other Chef", role: "kitchen" });
    expect(otherUserId).not.toBe(userId);

    // clockIn takes only { token } — there is no userId arg to spoof.
    const attendanceId = await t.mutation(
      api.staffAttendance.mutations.clockIn,
      { token },
    );
    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.userId).toBe(userId);
    expect(row?.userId).not.toBe(otherUserId);
  });

  it("blocks clock-in when user has a prior-day open shift (D-04)", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef C", role: "kitchen" });

    // I-6: use getWibDateStr(Date.now() - 24 * 60 * 60 * 1000) for WIB
    // yesterday so the test matches the code path which uses getWibDateStr
    // to compute today's WIB date. UTC-derived dates drift across the 17:00
    // UTC / 00:00 WIB boundary.
    const yesterday = getWibDateStr(Date.now() - 24 * 60 * 60 * 1000);
    await insertAttendance(t, {
      userId,
      date: yesterday,
      clockIn: Date.now() - 24 * 60 * 60 * 1000,
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.clockIn, { token }),
    ).rejects.toThrow(/open shift from/);
  });

  it("prevents same-day double clock-in with friendly error", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef D", role: "kitchen" });

    // I-6: WIB today.
    const today = getWibDateStr(Date.now());
    await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 60_000,
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.clockIn, { token }),
    ).rejects.toThrow(/already clocked in/);
  });

  it("ignores deletedAt rows when checking for open shifts", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef E", role: "kitchen" });

    // Seed a soft-deleted open shift from yesterday — should be ignored by D-04.
    const yesterdayMs = Date.now() - DAY_MS;
    const yesterday = getWibDateStr(yesterdayMs);
    await insertAttendance(t, {
      userId,
      date: yesterday,
      clockIn: yesterdayMs,
      deletedAt: Date.now(),
      deletedBy: "Manager",
    });

    // Should succeed despite the deleted prior-day row.
    const attendanceId = await t.mutation(
      api.staffAttendance.mutations.clockIn,
      { token },
    );
    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.userId).toBe(userId);
    expect(row?.clockOut).toBeUndefined();
  });
});
