/**
 * Phase 74 Staff Attendance — read queries.
 *
 *   getCurrentOpenShift      — caller's open row (or null). O(1) via by_user_open.
 *   getMyLastShiftSummary    — caller's most recent CLOSED shift joined with
 *                              same-day kitchenShiftRecords for the gate-screen
 *                              "Last shift: 6h 23m • 42 balls" recap.
 *   getFlaggedShifts         — manager/admin-only listing for the correction UI.
 *   getMyPerformance         — Task 2 stub returning { staff: null }. Task 3
 *                              replaces this with a call to aggregateStaffPerformance
 *                              (hard-scoped to the caller's userId — T-74-03).
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";
import { detectFlags, detectOverlaps } from "./flagEngine";

export const getCurrentOpenShift = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen",
      "order_staff",
      "manager",
      "admin",
    ]);
    const row = await ctx.db
      .query("staffAttendance")
      .withIndex("by_user_open", (q) =>
        q.eq("userId", user._id).eq("clockOut", undefined),
      )
      .first();
    if (!row || row.deletedAt) return null;
    return row;
  },
});

/**
 * Gate-screen "Last shift" recap. Returns the caller's most recent CLOSED
 * attendance row joined with same-day kitchenShiftRecords. BOM-resolved ball
 * counts (Business Rule 10/13) — production components only.
 */
export const getMyLastShiftSummary = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen",
      "order_staff",
      "manager",
      "admin",
    ]);

    // Most recent CLOSED, non-deleted attendance for this user.
    const recent = await ctx.db
      .query("staffAttendance")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id))
      .order("desc")
      .filter((q) => q.neq(q.field("clockOut"), undefined))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
    if (!recent || recent.clockOut === undefined) return null;

    // Same-day shift records authored by (or about) this user.
    const shifts = await ctx.db
      .query("kitchenShiftRecords")
      .withIndex("by_date", (q) => q.eq("date", recent.date))
      .filter((q) => q.eq(q.field("chefUserId"), user._id))
      .collect();

    // Real BOM resolution (no stub). Pattern copied from
    // convex/kitchenShiftRecords/queries.ts getStaffPerformanceSummary.
    const prodComponentTypes = await ctx.db
      .query("componentTypes")
      .filter((q) => q.eq(q.field("category"), "production"))
      .collect();
    const prodComponentIds = new Set(
      prodComponentTypes.map((c) => c._id as Id<"componentTypes">),
    );

    // Pre-fetch BOM once and bucket by menuProductId to avoid N+1.
    const allMpcs = await ctx.db.query("menuProductComponents").collect();
    const bomByProduct = new Map<
      string,
      Array<{ componentTypeId: Id<"componentTypes">; quantity: number }>
    >();
    for (const mpc of allMpcs) {
      const key = String(mpc.menuProductId);
      const list = bomByProduct.get(key) ?? [];
      list.push({
        componentTypeId: mpc.componentTypeId as Id<"componentTypes">,
        quantity: mpc.quantity,
      });
      bomByProduct.set(key, list);
    }

    let ballsProduced = 0;
    for (const rec of shifts) {
      for (const item of rec.produced ?? []) {
        const bom = bomByProduct.get(String(item.menuProductId)) ?? [];
        for (const comp of bom) {
          if (prodComponentIds.has(comp.componentTypeId)) {
            ballsProduced += item.quantity * comp.quantity;
          }
        }
      }
    }

    return {
      date: recent.date,
      clockIn: recent.clockIn,
      clockOut: recent.clockOut,
      durationMs: recent.durationMs ?? recent.clockOut - recent.clockIn,
      ballsProduced,
    };
  },
});

/**
 * Manager/admin-only listing of flagged shifts for the correction dashboard.
 * Scans staffAttendance by date range, groups by user, runs the flag engine
 * per session, and attaches overlapping flags from detectOverlaps().
 */
export const getFlaggedShifts = query({
  args: {
    token: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const rows = await ctx.db
      .query("staffAttendance")
      .withIndex("by_date", (q) =>
        q.gte("date", args.startDate).lte("date", args.endDate),
      )
      .collect();
    const active = rows.filter((r) => !r.deletedAt);

    // Group by user for overlap detection.
    const byUser = new Map<Id<"users">, typeof active>();
    for (const r of active) {
      const list = byUser.get(r.userId) ?? [];
      list.push(r);
      byUser.set(r.userId, list);
    }

    // Batch-fetch users to get hireDate for the before_hire rule.
    const userIds = Array.from(byUser.keys());
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      users.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => [u._id, u]),
    );

    const now = Date.now();
    const results: Array<{
      attendance: (typeof active)[number];
      userName: string;
      flagReasons: string[];
    }> = [];
    for (const [userId, sessions] of byUser) {
      const overlapping = detectOverlaps(sessions);
      const userDoc = userMap.get(userId);
      for (const session of sessions) {
        const flags = detectFlags(session, userDoc?.hireDate, now);
        if (overlapping.has(session._id)) flags.push("overlapping");
        if (flags.length > 0) {
          results.push({
            attendance: session,
            userName: userDoc?.name ?? "(unknown)",
            flagReasons: flags,
          });
        }
      }
    }
    return results;
  },
});

/**
 * Task 2 STUB — Task 3 replaces this body with a call to
 * aggregateStaffPerformance(ctx, { startDate, endDate, userIdFilter: user._id }).
 * Returns a type-complete placeholder so consumers can wire types now; Plan 03
 * MyPerformance.tsx empty-state key is `!data?.staff`.
 */
export const getMyPerformance = query({
  args: {
    token: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen",
      "order_staff",
      "manager",
      "admin",
    ]);
    // Reference user to silence unused-variable linting; Task 3 wires for real.
    void user;
    return {
      startDate: args.startDate,
      endDate: args.endDate,
      totalRecords: 0,
      staff: null,
    };
  },
});
