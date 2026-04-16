/**
 * Phase 74 Staff Attendance — protected mutations.
 *
 *   clockIn            — caller clocks themselves in. userId is ALWAYS derived
 *                        from the session token (T-74-01 spoofing prevention).
 *   clockOut           — close an open shift. Staff can only close their own;
 *                        managers/admins can close any. D-04 server enforcement
 *                        blocks staff self-closure of a prior-day shift.
 *   correctAttendance  — manager/admin-only. Edit timestamps, add missed shifts,
 *                        reassign chef, or soft-delete — always with a required
 *                        correctionNote and a non-repudiable audit trail entry
 *                        appended to corrections[].
 */

import { mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireRole } from "../lib/auth";
import { toWibDateString } from "./flagEngine";

/**
 * D-04 blocker + T-74-01 spoofing prevention. `userId` is derived from
 * `requireRole`-resolved session user and never accepted as an arg.
 */
export const clockIn = mutation({
  args: {
    token: v.string(),
    // NO userId arg — target userId ALWAYS derived from session (T-74-01).
    // Future "manager clocks in for another staff" flow needs a dedicated
    // `managerClockInFor` mutation with a stricter role gate.
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen",
      "order_staff",
      "manager",
      "admin",
    ]);
    const targetUserId = user._id;
    const now = Date.now();
    const todayWib = toWibDateString(now);

    // D-04 blocker + same-day double-click prevention.
    const openShift = await ctx.db
      .query("staffAttendance")
      .withIndex("by_user_open", (q) =>
        q.eq("userId", targetUserId).eq("clockOut", undefined),
      )
      .first();

    if (openShift && !openShift.deletedAt) {
      if (openShift.date < todayWib) {
        throw new ConvexError(
          `You have an open shift from ${openShift.date}. Please ask a manager to correct it.`,
        );
      }
      throw new ConvexError("You're already clocked in.");
    }

    return await ctx.db.insert("staffAttendance", {
      userId: targetUserId,
      date: todayWib,
      clockIn: now,
      // clockOut, durationMs, corrections, deletedAt all omitted → undefined.
    });
  },
});

/**
 * Close an open shift. Owner-or-manager gate + no-prior-day self-closure (D-04).
 */
export const clockOut = mutation({
  args: {
    token: v.string(),
    attendanceId: v.id("staffAttendance"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen",
      "order_staff",
      "manager",
      "admin",
    ]);
    const record = await ctx.db.get(args.attendanceId);
    if (!record) throw new ConvexError("Attendance record not found");
    if (record.deletedAt) {
      throw new ConvexError("Cannot clock out a deleted shift");
    }
    const isManager = user.role === "manager" || user.role === "admin";
    if (record.userId !== user._id && !isManager) {
      throw new ConvexError("Cannot clock out another user's shift");
    }
    if (record.clockOut !== undefined) {
      throw new ConvexError("Shift already closed");
    }
    const now = Date.now();
    const todayWib = toWibDateString(now);
    // D-04 server enforcement: staff cannot self-close a prior-day shift;
    // forces the manager correction flow which writes an audit trail entry.
    if (record.date < todayWib && !isManager) {
      throw new ConvexError(
        "This shift is from a prior day. Ask a manager to correct it.",
      );
    }
    // Date anchored to clockIn: we intentionally do NOT update `record.date`
    // when clockOut lands on a later WIB day (midnight-spanning shifts like
    // 23:55→00:05). Aggregations bucket sessions by clockIn date, and moving
    // the date on close would produce a row whose date disagrees with its
    // clockIn timestamp — the exact inconsistency WR-03 rejects in corrections.
    await ctx.db.patch(args.attendanceId, {
      clockOut: now,
      durationMs: now - record.clockIn,
    });
  },
});

const actionValidator = v.union(
  v.literal("edit_timestamps"),
  v.literal("add_missed"),
  v.literal("reassign"),
  v.literal("delete"),
);

/**
 * Manager/admin-only correction. Each invocation appends ONE entry to
 * `corrections[]` with a previous-state snapshot so the full correction history
 * is preserved and non-repudiable (T-74-02).
 */
export const correctAttendance = mutation({
  args: {
    token: v.string(),
    action: actionValidator,
    correctionNote: v.string(),
    attendanceId: v.optional(v.id("staffAttendance")),
    userId: v.optional(v.id("users")),
    date: v.optional(v.string()),
    clockIn: v.optional(v.number()),
    clockOut: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const manager = await requireRole(ctx, args.token, ["manager", "admin"]);

    // D-19 belt-and-suspenders: validator is v.string() (not optional) so
    // empty-string can still sneak through; we trim and reject here.
    const note = args.correctionNote.trim();
    if (note.length === 0) {
      throw new ConvexError("Correction note is required");
    }
    const correctedAt = Date.now();

    // --- action: add_missed (inserts a brand-new row) ---
    if (args.action === "add_missed") {
      if (!args.userId || !args.date || args.clockIn === undefined) {
        throw new ConvexError("add_missed requires userId, date, clockIn");
      }
      // I-1 guard: reject nonsensical clockOut < clockIn (negative hours).
      if (args.clockOut !== undefined && args.clockOut < args.clockIn) {
        throw new ConvexError("Clock-out must be after clock-in");
      }
      // WR-03: ensure the client-computed `date` field matches the WIB date
      // derived from `clockIn`. Prevents drift when a manager picks a clock-in
      // time that crosses WIB midnight relative to the date input.
      const derivedDate = toWibDateString(args.clockIn);
      if (derivedDate !== args.date) {
        throw new ConvexError(
          `Date field (${args.date}) does not match clock-in WIB date (${derivedDate})`,
        );
      }
      const durationMs =
        args.clockOut !== undefined ? args.clockOut - args.clockIn : undefined;
      const newId = await ctx.db.insert("staffAttendance", {
        userId: args.userId,
        date: args.date,
        clockIn: args.clockIn,
        clockOut: args.clockOut,
        durationMs,
        corrections: [
          {
            correctedAt,
            correctedBy: manager.name,
            correctedByUserId: manager._id,
            correctionNote: note,
            action: "add_missed",
          },
        ],
      });
      return newId;
    }

    // All other actions mutate an existing row.
    if (!args.attendanceId) {
      throw new ConvexError(`${args.action} requires attendanceId`);
    }
    const existing = await ctx.db.get(args.attendanceId);
    if (!existing) {
      throw new ConvexError("Attendance record not found");
    }
    // Triple-review C1: block mutations on soft-deleted rows. Without this,
    // a manager could append corrections[] entries or overwrite deletedAt/By
    // on an already-deleted record, corrupting the audit trail (T-74-02).
    if (existing.deletedAt) {
      throw new ConvexError(
        "Cannot correct a deleted attendance record. Use add_missed to create a replacement.",
      );
    }
    const corrections = existing.corrections ? [...existing.corrections] : [];

    // --- action: delete (soft-delete) ---
    if (args.action === "delete") {
      corrections.push({
        correctedAt,
        correctedBy: manager.name,
        correctedByUserId: manager._id,
        correctionNote: note,
        action: "delete",
      });
      await ctx.db.patch(args.attendanceId, {
        deletedAt: correctedAt,
        deletedBy: manager.name,
        corrections,
      });
      return;
    }

    // --- action: reassign (chef swap) ---
    if (args.action === "reassign") {
      if (!args.userId) {
        throw new ConvexError("reassign requires userId");
      }
      corrections.push({
        correctedAt,
        correctedBy: manager.name,
        correctedByUserId: manager._id,
        correctionNote: note,
        previousUserId: existing.userId,
        action: "reassign",
      });
      await ctx.db.patch(args.attendanceId, {
        userId: args.userId,
        corrections,
      });
      return;
    }

    // --- action: edit_timestamps ---
    const newClockIn = args.clockIn ?? existing.clockIn;
    const newClockOut =
      args.clockOut !== undefined ? args.clockOut : existing.clockOut;
    // I-1 guard: reject nonsensical clockOut < clockIn.
    if (newClockOut !== undefined && newClockOut < newClockIn) {
      throw new ConvexError("Clock-out must be after clock-in");
    }
    // WR-03: if clockIn changed, ensure the existing `date` still matches the
    // WIB-derived date of the new clockIn. Prevents a WIB-midnight crossing
    // correction from producing a row whose date field is inconsistent with
    // its clockIn timestamp.
    if (args.clockIn !== undefined) {
      const derivedDate = toWibDateString(newClockIn);
      if (derivedDate !== existing.date) {
        throw new ConvexError(
          `Existing date (${existing.date}) does not match new clock-in WIB date (${derivedDate}). Use add_missed + delete to move a shift across dates.`,
        );
      }
    }
    corrections.push({
      correctedAt,
      correctedBy: manager.name,
      correctedByUserId: manager._id,
      correctionNote: note,
      previousClockIn: existing.clockIn,
      previousClockOut: existing.clockOut,
      action: "edit_timestamps",
    });
    await ctx.db.patch(args.attendanceId, {
      clockIn: newClockIn,
      clockOut: newClockOut,
      durationMs:
        newClockOut !== undefined ? newClockOut - newClockIn : undefined,
      corrections,
    });
  },
});
