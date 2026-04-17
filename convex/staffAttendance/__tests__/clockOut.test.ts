/**
 * Phase 74 Plan 04 — real clockOut mutation tests.
 *
 * Covers durationMs denormalization, owner-or-manager gate, D-04 prior-day
 * self-closure rejection, already-closed guard, and deleted-row guard.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedUser, insertAttendance } from "./helpers";
import { toWibDateString } from "../flagEngine";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("clockOut", () => {
  it("sets clockOut and durationMs = clockOut - clockIn on the open row", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef A", role: "kitchen" });
    const today = toWibDateString(Date.now());
    const clockInMs = Date.now() - 2 * 60 * 60 * 1000; // 2h ago
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn: clockInMs,
    });

    const before = Date.now();
    await t.mutation(api.staffAttendance.mutations.clockOut, {
      token,
      attendanceId,
    });
    const after = Date.now();

    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.clockOut).toBeDefined();
    expect(row!.clockOut!).toBeGreaterThanOrEqual(before);
    expect(row!.clockOut!).toBeLessThanOrEqual(after);
    expect(row?.durationMs).toBe(row!.clockOut! - clockInMs);
  });

  it("rejects attempts to close another user's shift (non-manager)", async () => {
    const t = convexTest(schema);
    const { token: tokenA } = await seedUser(t, { name: "Chef A", role: "kitchen" });
    const { userId: userIdB } = await seedUser(t, { name: "Chef B", role: "kitchen" });

    const today = toWibDateString(Date.now());
    const attendanceIdB = await insertAttendance(t, {
      userId: userIdB,
      date: today,
      clockIn: Date.now() - 60_000,
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.clockOut, {
        token: tokenA,
        attendanceId: attendanceIdB,
      }),
    ).rejects.toThrow(/another user/);
  });

  it("permits manager/admin to close another user's shift", async () => {
    const t = convexTest(schema);
    const { userId: kitchenId } = await seedUser(t, { name: "Kitchen", role: "kitchen" });
    const { token: managerToken } = await seedUser(t, { name: "Mgr", role: "manager" });

    const today = toWibDateString(Date.now());
    const attendanceId = await insertAttendance(t, {
      userId: kitchenId,
      date: today,
      clockIn: Date.now() - 60_000,
    });

    await t.mutation(api.staffAttendance.mutations.clockOut, {
      token: managerToken,
      attendanceId,
    });
    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.clockOut).toBeDefined();
    expect(row?.durationMs).toBeDefined();
  });

  it("rejects staff self-closure of a prior-day shift (D-04 server enforcement)", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef A", role: "kitchen" });

    const yesterdayMs = Date.now() - DAY_MS;
    const yesterday = toWibDateString(yesterdayMs);
    const attendanceId = await insertAttendance(t, {
      userId,
      date: yesterday,
      clockIn: yesterdayMs,
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.clockOut, { token, attendanceId }),
    ).rejects.toThrow(/prior day/i);
  });

  it("throws when the record is already closed", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef A", role: "kitchen" });

    const today = toWibDateString(Date.now());
    const clockInMs = Date.now() - 2 * 60 * 60 * 1000;
    const clockOutMs = Date.now() - 60_000;
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn: clockInMs,
      clockOut: clockOutMs,
      durationMs: clockOutMs - clockInMs,
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.clockOut, { token, attendanceId }),
    ).rejects.toThrow(/already closed/);
  });

  it("throws when the record has been soft-deleted", async () => {
    const t = convexTest(schema);
    const { token, userId } = await seedUser(t, { name: "Chef A", role: "kitchen" });

    const today = toWibDateString(Date.now());
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 60_000,
      deletedAt: Date.now(),
      deletedBy: "Mgr",
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.clockOut, { token, attendanceId }),
    ).rejects.toThrow(/deleted/i);
  });
});
