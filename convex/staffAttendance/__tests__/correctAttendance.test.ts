/**
 * Phase 74 Plan 04 — real correctAttendance mutation tests.
 *
 * Covers role gate (manager/admin), D-19 required trimmed note, I-1 clockOut
 * sanity guard, and all four correction actions:
 *   - edit_timestamps: appends correction w/ previous clockIn/clockOut
 *   - add_missed: inserts a new row with a single correction entry
 *   - reassign: changes userId and captures previousUserId
 *   - delete: soft-deletes and appends correction
 * Snapshot fields correctedBy/correctedByUserId reflect the manager.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedUser, insertAttendance } from "./helpers";
import { toWibDateString } from "../flagEngine";

describe("correctAttendance", () => {
  it("requires manager/admin role (rejects kitchen/order_staff)", async () => {
    const t = convexTest(schema);
    const { token: kitchenToken, userId } = await seedUser(t, {
      name: "Chef",
      role: "kitchen",
    });
    const today = toWibDateString(Date.now());
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 60_000,
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.correctAttendance, {
        token: kitchenToken,
        action: "edit_timestamps",
        correctionNote: "try it",
        attendanceId,
        clockIn: Date.now() - 2 * 60 * 60 * 1000,
      }),
    ).rejects.toThrow(/Not authorized/);
  });

  it("requires non-empty correctionNote trimmed server-side (D-19)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });
    const today = toWibDateString(Date.now());
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 60_000,
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.correctAttendance, {
        token: mgrToken,
        action: "edit_timestamps",
        correctionNote: "   \t\n ",
        attendanceId,
        clockIn: Date.now() - 2 * 60 * 60 * 1000,
      }),
    ).rejects.toThrow(/note is required/i);
  });

  it("edit_timestamps appends corrections[] entry with previousClockIn/previousClockOut", async () => {
    const t = convexTest(schema);
    const { token: mgrToken, userId: mgrId } = await seedUser(t, {
      name: "Manager Mary",
      role: "manager",
    });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    const today = toWibDateString(Date.now());
    const originalIn = Date.now() - 3 * 60 * 60 * 1000;
    const originalOut = Date.now() - 60 * 60 * 1000;
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn: originalIn,
      clockOut: originalOut,
      durationMs: originalOut - originalIn,
    });

    const newIn = originalIn - 30 * 60 * 1000;
    await t.mutation(api.staffAttendance.mutations.correctAttendance, {
      token: mgrToken,
      action: "edit_timestamps",
      correctionNote: "fixing clock-in drift",
      attendanceId,
      clockIn: newIn,
    });

    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.clockIn).toBe(newIn);
    expect(row?.clockOut).toBe(originalOut);
    expect(row?.durationMs).toBe(originalOut - newIn);
    expect(row?.corrections).toHaveLength(1);
    const entry = row!.corrections![0];
    expect(entry.action).toBe("edit_timestamps");
    expect(entry.previousClockIn).toBe(originalIn);
    expect(entry.previousClockOut).toBe(originalOut);
    expect(entry.correctionNote).toBe("fixing clock-in drift");
    expect(entry.correctedByUserId).toBe(mgrId);
    expect(entry.correctedBy).toBe("Manager Mary");
  });

  it("edit_timestamps rejects clockOut < clockIn (I-1 guard)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });
    const today = toWibDateString(Date.now());
    const clockIn = Date.now() - 60 * 60 * 1000;
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn,
    });

    await expect(
      t.mutation(api.staffAttendance.mutations.correctAttendance, {
        token: mgrToken,
        action: "edit_timestamps",
        correctionNote: "trying to set out < in",
        attendanceId,
        clockOut: clockIn - 60_000,
      }),
    ).rejects.toThrow(/must be after/i);
  });

  it("add_missed inserts a new row with a single correction entry", async () => {
    const t = convexTest(schema);
    const { token: mgrToken, userId: mgrId } = await seedUser(t, {
      name: "Mgr",
      role: "manager",
    });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    const date = "2026-04-10";
    const clockIn = Date.parse("2026-04-10T01:00:00Z"); // 08:00 WIB
    const clockOut = Date.parse("2026-04-10T09:00:00Z"); // 16:00 WIB
    const newId = await t.mutation(
      api.staffAttendance.mutations.correctAttendance,
      {
        token: mgrToken,
        action: "add_missed",
        correctionNote: "forgot to clock in that day",
        userId,
        date,
        clockIn,
        clockOut,
      },
    );

    const row = await t.run(async (ctx) => await ctx.db.get(newId!));
    expect(row).not.toBeNull();
    expect(row?.userId).toBe(userId);
    expect(row?.date).toBe(date);
    expect(row?.clockIn).toBe(clockIn);
    expect(row?.clockOut).toBe(clockOut);
    expect(row?.durationMs).toBe(clockOut - clockIn);
    expect(row?.corrections).toHaveLength(1);
    expect(row!.corrections![0].action).toBe("add_missed");
    expect(row!.corrections![0].correctedByUserId).toBe(mgrId);
    expect(row!.corrections![0].correctionNote).toBe(
      "forgot to clock in that day",
    );
  });

  it("reassign changes userId and captures previousUserId in the correction entry", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId: userA } = await seedUser(t, { name: "A", role: "kitchen" });
    const { userId: userB } = await seedUser(t, { name: "B", role: "kitchen" });

    const today = toWibDateString(Date.now());
    const attendanceId = await insertAttendance(t, {
      userId: userA,
      date: today,
      clockIn: Date.now() - 60 * 60 * 1000,
    });

    await t.mutation(api.staffAttendance.mutations.correctAttendance, {
      token: mgrToken,
      action: "reassign",
      correctionNote: "wrong chef selected",
      attendanceId,
      userId: userB,
    });

    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.userId).toBe(userB);
    expect(row?.corrections).toHaveLength(1);
    expect(row!.corrections![0].action).toBe("reassign");
    expect(row!.corrections![0].previousUserId).toBe(userA);
  });

  it("delete soft-deletes via deletedAt/deletedBy + corrections[action=delete]", async () => {
    const t = convexTest(schema);
    const { token: mgrToken, userId: mgrId } = await seedUser(t, {
      name: "Manager Max",
      role: "manager",
    });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    const today = toWibDateString(Date.now());
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 60 * 60 * 1000,
    });

    await t.mutation(api.staffAttendance.mutations.correctAttendance, {
      token: mgrToken,
      action: "delete",
      correctionNote: "duplicate entry",
      attendanceId,
    });

    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.deletedAt).toBeTypeOf("number");
    expect(row!.deletedAt!).toBeGreaterThan(0);
    expect(row?.deletedBy).toBe("Manager Max");
    expect(row?.corrections).toHaveLength(1);
    expect(row!.corrections![0].action).toBe("delete");
    expect(row!.corrections![0].correctedByUserId).toBe(mgrId);
  });

  it("multiple corrections accumulate in corrections[] preserving history", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId: userA } = await seedUser(t, { name: "A", role: "kitchen" });
    const { userId: userB } = await seedUser(t, { name: "B", role: "kitchen" });

    const today = toWibDateString(Date.now());
    const originalIn = Date.now() - 4 * 60 * 60 * 1000;
    const attendanceId = await insertAttendance(t, {
      userId: userA,
      date: today,
      clockIn: originalIn,
    });

    // 1) edit_timestamps
    await t.mutation(api.staffAttendance.mutations.correctAttendance, {
      token: mgrToken,
      action: "edit_timestamps",
      correctionNote: "first edit",
      attendanceId,
      clockIn: originalIn + 15 * 60 * 1000,
    });
    // 2) reassign
    await t.mutation(api.staffAttendance.mutations.correctAttendance, {
      token: mgrToken,
      action: "reassign",
      correctionNote: "chef swap",
      attendanceId,
      userId: userB,
    });

    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.corrections).toHaveLength(2);
    expect(row!.corrections![0].action).toBe("edit_timestamps");
    expect(row!.corrections![1].action).toBe("reassign");
    expect(row!.corrections![1].previousUserId).toBe(userA);
  });
});
