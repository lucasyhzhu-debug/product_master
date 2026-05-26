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
import { getWibDateStr, getWibComponents, wibMidnightToUtc } from "../../lib/periodRange";

// Pin the test clock to noon WIB today so `Date.now() - Nh` calculations in
// the edit_timestamps tests stay within a single WIB day. Without this, CI
// runs between 00:00-03:00 WIB fail with `Existing date does not match new
// clock-in WIB date` because `Date.now() - 3h` crosses the WIB midnight.
// Out-of-scope fix introduced by the telegram-pack-list PR (2026-05-26) —
// the staffAttendance tests have always been latent flaky in this window;
// surfaced tonight because PR #167 happened to land near WIB midnight.
function noonWibTodayMs(): number {
  const wib = getWibComponents(Date.now());
  return wibMidnightToUtc(wib.year, wib.month, wib.day) + 12 * 60 * 60 * 1000;
}

describe("correctAttendance", () => {
  it("requires manager/admin role (rejects kitchen/order_staff)", async () => {
    const t = convexTest(schema);
    const { token: kitchenToken, userId } = await seedUser(t, {
      name: "Chef",
      role: "kitchen",
    });
    const today = getWibDateStr(Date.now());
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
    const today = getWibDateStr(Date.now());
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

    const now = noonWibTodayMs();
    const today = getWibDateStr(now);
    const originalIn = now - 3 * 60 * 60 * 1000;
    const originalOut = now - 60 * 60 * 1000;
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
    const today = getWibDateStr(Date.now());
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

    const today = getWibDateStr(Date.now());
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

    const today = getWibDateStr(Date.now());
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

  it("add_missed rejects when clockIn WIB date disagrees with date arg (WR-03 regression)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    // clockIn = 2026-04-16T18:00Z = 2026-04-17T01:00 WIB (next day in WIB).
    // Passing date="2026-04-16" is inconsistent with the WIB-derived date.
    const badClockIn = Date.parse("2026-04-16T18:00:00Z");
    await expect(
      t.mutation(api.staffAttendance.mutations.correctAttendance, {
        token: mgrToken,
        action: "add_missed",
        correctionNote: "test WR-03 guard",
        userId,
        date: "2026-04-16",
        clockIn: badClockIn,
      }),
    ).rejects.toThrow(/does not match/i);
  });

  it("edit_timestamps rejects clockIn that moves shift across WIB midnight (WR-03 regression)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });

    // Seeded row: date=2026-04-16, clockIn at 08:00 WIB same day.
    const goodClockIn = Date.parse("2026-04-16T01:00:00Z"); // 08:00 WIB
    const attendanceId = await insertAttendance(t, {
      userId,
      date: "2026-04-16",
      clockIn: goodClockIn,
    });

    // Moving clockIn to 2026-04-15T18:00Z = 2026-04-16T01:00 WIB is fine (same date).
    // But moving to 2026-04-15T16:00Z = 2026-04-15T23:00 WIB crosses WIB date boundary.
    const crossMidnight = Date.parse("2026-04-15T16:00:00Z");
    await expect(
      t.mutation(api.staffAttendance.mutations.correctAttendance, {
        token: mgrToken,
        action: "edit_timestamps",
        correctionNote: "try to move across WIB midnight",
        attendanceId,
        clockIn: crossMidnight,
      }),
    ).rejects.toThrow(/does not match/i);
  });

  it("rejects any correction action on a soft-deleted row (Triple-review C1)", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId } = await seedUser(t, { name: "Chef", role: "kitchen" });
    const { userId: userB } = await seedUser(t, { name: "B", role: "kitchen" });

    const today = getWibDateStr(Date.now());
    const attendanceId = await insertAttendance(t, {
      userId,
      date: today,
      clockIn: Date.now() - 60 * 60 * 1000,
    });

    // Soft-delete it first.
    await t.mutation(api.staffAttendance.mutations.correctAttendance, {
      token: mgrToken,
      action: "delete",
      correctionNote: "initial delete",
      attendanceId,
    });

    // Each remaining action must reject with the "Cannot correct a deleted" error.
    await expect(
      t.mutation(api.staffAttendance.mutations.correctAttendance, {
        token: mgrToken,
        action: "edit_timestamps",
        correctionNote: "try to edit deleted row",
        attendanceId,
        clockIn: Date.now() - 2 * 60 * 60 * 1000,
      }),
    ).rejects.toThrow(/deleted/i);

    await expect(
      t.mutation(api.staffAttendance.mutations.correctAttendance, {
        token: mgrToken,
        action: "reassign",
        correctionNote: "try to reassign deleted row",
        attendanceId,
        userId: userB,
      }),
    ).rejects.toThrow(/deleted/i);

    await expect(
      t.mutation(api.staffAttendance.mutations.correctAttendance, {
        token: mgrToken,
        action: "delete",
        correctionNote: "try to double-delete",
        attendanceId,
      }),
    ).rejects.toThrow(/deleted/i);

    // Audit trail is preserved: only the initial delete entry remains.
    const row = await t.run(async (ctx) => await ctx.db.get(attendanceId));
    expect(row?.corrections).toHaveLength(1);
    expect(row!.corrections![0].correctionNote).toBe("initial delete");
  });

  it("multiple corrections accumulate in corrections[] preserving history", async () => {
    const t = convexTest(schema);
    const { token: mgrToken } = await seedUser(t, { name: "Mgr", role: "manager" });
    const { userId: userA } = await seedUser(t, { name: "A", role: "kitchen" });
    const { userId: userB } = await seedUser(t, { name: "B", role: "kitchen" });

    const now = noonWibTodayMs();
    const today = getWibDateStr(now);
    const originalIn = now - 4 * 60 * 60 * 1000;
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
