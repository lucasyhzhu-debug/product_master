/**
 * Phase 74 Staff Attendance — pure-function flag engine.
 *
 * Implements D-18 auto-flag rules:
 *   - missing_clockout: open shift from a prior WIB date
 *   - over_16h:        open shift exceeding OPEN_SHIFT_THRESHOLD_MS
 *   - overlapping:     two or more sessions for the same user overlap in time
 *   - before_hire:     clockIn earlier than the user's hireDate
 *
 * No Convex ctx. No side effects. 100% testable via unit tests without
 * a Convex runtime, which is why the bulk of Plan 04 verification lives here.
 */

import type { Doc, Id } from "../_generated/dataModel";
import { OPEN_SHIFT_THRESHOLD_MS, WIB_OFFSET_MS } from "./constants";

export type FlagReason =
  | "missing_clockout"
  | "over_16h"
  | "overlapping"
  | "before_hire";

/**
 * Convert a UTC epoch-ms timestamp to the WIB (UTC+7) calendar date string
 * (YYYY-MM-DD). Used to compute the `date` field when a staff member clocks in.
 */
export function toWibDateString(utcMs: number): string {
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Detect true time-range overlaps across the given sessions.
 * Open shifts (clockOut undefined) are treated as having end = +Infinity —
 * any subsequent session overlaps them by definition.
 *
 * Note: this function is pure; callers must pass only active (non-deleted)
 * sessions. Returns the set of session ids that participate in any overlap.
 */
export function detectOverlaps(
  sessions: Array<Doc<"staffAttendance">>,
): Set<Id<"staffAttendance">> {
  const flagged = new Set<Id<"staffAttendance">>();
  const sorted = [...sessions].sort((a, b) => a.clockIn - b.clockIn);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const prevEnd = prev.clockOut ?? Number.POSITIVE_INFINITY;
    if (prevEnd > cur.clockIn) {
      flagged.add(prev._id);
      flagged.add(cur._id);
    }
  }
  return flagged;
}

/**
 * Compute single-record flags: missing_clockout, over_16h, before_hire.
 * `overlapping` is NOT computed here — callers merge in ids from
 * detectOverlaps() because it requires the full sibling session set.
 *
 * - `hireDate` undefined → skip `before_hire` (legacy users seeded before DA-04).
 */
export function detectFlags(
  record: Doc<"staffAttendance">,
  hireDate: number | undefined,
  now: number,
): FlagReason[] {
  const flags: FlagReason[] = [];
  if (record.clockOut === undefined) {
    if (now - record.clockIn > OPEN_SHIFT_THRESHOLD_MS) {
      flags.push("over_16h");
    }
    const todayWib = toWibDateString(now);
    if (record.date < todayWib) {
      flags.push("missing_clockout");
    }
  }
  if (hireDate !== undefined && record.clockIn < hireDate) {
    flags.push("before_hire");
  }
  return flags;
}
