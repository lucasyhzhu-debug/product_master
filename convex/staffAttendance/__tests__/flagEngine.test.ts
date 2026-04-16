import { describe, it, expect } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  detectFlags,
  detectOverlaps,
  toWibDateString,
} from "../flagEngine";
import { OPEN_SHIFT_THRESHOLD_MS } from "../constants";

// ---------------------------------------------------------------------------
// Fixture helpers — pure functions don't need _creationTime etc., so we cast.
// ---------------------------------------------------------------------------

type Attendance = Doc<"staffAttendance">;

function mkSession(
  id: string,
  clockIn: number,
  clockOut: number | undefined,
  date = "2026-04-16",
  userId = "user-1",
): Attendance {
  return {
    _id: id as unknown as Id<"staffAttendance">,
    _creationTime: clockIn,
    userId: userId as unknown as Id<"users">,
    date,
    clockIn,
    clockOut,
    durationMs: clockOut !== undefined ? clockOut - clockIn : undefined,
  } as unknown as Attendance;
}

const HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// toWibDateString
// ---------------------------------------------------------------------------

describe("toWibDateString", () => {
  it("returns YYYY-MM-DD in WIB (UTC+7)", () => {
    // 2026-04-16T10:00:00Z UTC → 17:00 WIB → "2026-04-16"
    expect(toWibDateString(Date.UTC(2026, 3, 16, 10, 0, 0))).toBe("2026-04-16");
  });

  it("rolls over to next WIB day at UTC 17:00 (WIB midnight)", () => {
    // 2026-04-16T17:00:00Z UTC = 2026-04-17T00:00:00 WIB.
    expect(toWibDateString(Date.UTC(2026, 3, 16, 17, 0, 0))).toBe("2026-04-17");
  });

  it("keeps same WIB date for UTC 16:59:59Z", () => {
    // Last UTC second that still resolves to 2026-04-16 WIB.
    expect(toWibDateString(Date.UTC(2026, 3, 16, 16, 59, 59))).toBe("2026-04-16");
  });

  it("throws on NaN input (WR-02 regression)", () => {
    expect(() => toWibDateString(NaN)).toThrow(/non-finite/);
  });

  it("throws on Infinity input (WR-02 regression)", () => {
    expect(() => toWibDateString(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => toWibDateString(Number.NEGATIVE_INFINITY)).toThrow(/non-finite/);
  });
});

// ---------------------------------------------------------------------------
// detectOverlaps
// ---------------------------------------------------------------------------

describe("detectOverlaps", () => {
  it("returns empty set for empty input", () => {
    expect(detectOverlaps([]).size).toBe(0);
  });

  it("returns empty set for non-overlapping adjacent sessions", () => {
    // A: 10:00-12:00, B: 13:00-14:00 — clean break.
    const a = mkSession("a", 10 * HOUR, 12 * HOUR);
    const b = mkSession("b", 13 * HOUR, 14 * HOUR);
    expect(detectOverlaps([a, b]).size).toBe(0);
  });

  it("returns empty set for sessions that end exactly when next starts", () => {
    const a = mkSession("a", 10 * HOUR, 12 * HOUR);
    const b = mkSession("b", 12 * HOUR, 14 * HOUR);
    expect(detectOverlaps([a, b]).size).toBe(0);
  });

  it("flags both endpoints of a true time overlap", () => {
    // A: 10-14, B: 12-16 → overlap 12-14.
    const a = mkSession("a", 10 * HOUR, 14 * HOUR);
    const b = mkSession("b", 12 * HOUR, 16 * HOUR);
    const overlaps = detectOverlaps([a, b]);
    expect(overlaps.has(a._id)).toBe(true);
    expect(overlaps.has(b._id)).toBe(true);
  });

  it("flags open shift overlap with subsequent session within the 16h window (I1)", () => {
    // Open shift at 10:00; another session starts at 12:00 (within 16h of clockIn).
    const open = mkSession("open", 10 * HOUR, undefined);
    const later = mkSession("later", 12 * HOUR, 14 * HOUR);
    const overlaps = detectOverlaps([open, later]);
    expect(overlaps.has(open._id)).toBe(true);
    expect(overlaps.has(later._id)).toBe(true);
  });

  it("does NOT flag sessions past the 16h open-shift window as overlapping (I1 regression)", () => {
    // An abandoned open shift on day 0 should not taint a legitimate session
    // on day 1. Without the cap, the +Infinity end treatment would flag every
    // later session — inflating flaggedShiftCount across multi-day periods.
    const openDay0 = mkSession("open", 10 * HOUR, undefined, "2026-04-16");
    const nextDay = mkSession(
      "next",
      10 * HOUR + OPEN_SHIFT_THRESHOLD_MS + HOUR,
      10 * HOUR + OPEN_SHIFT_THRESHOLD_MS + 9 * HOUR,
      "2026-04-17",
    );
    const overlaps = detectOverlaps([openDay0, nextDay]);
    expect(overlaps.has(openDay0._id)).toBe(false);
    expect(overlaps.has(nextDay._id)).toBe(false);
  });

  it("handles unsorted input by sorting internally", () => {
    const a = mkSession("a", 10 * HOUR, 14 * HOUR);
    const b = mkSession("b", 12 * HOUR, 16 * HOUR);
    // Pass in reversed order — result must be identical.
    const overlaps = detectOverlaps([b, a]);
    expect(overlaps.has(a._id)).toBe(true);
    expect(overlaps.has(b._id)).toBe(true);
  });

  it("flags transitive overlaps when a long outer session envelops 2+ shorter sessions (WR-01)", () => {
    // Regression: naive pairwise scan would only compare each session to its
    // immediate predecessor after sort-by-clockIn and miss C's overlap with A.
    // A: 08:00–18:00 (10h), B: 09:00–10:00 (inside A), C: 11:00–12:00 (inside A).
    const a = mkSession("a", 8 * HOUR, 18 * HOUR);
    const b = mkSession("b", 9 * HOUR, 10 * HOUR);
    const c = mkSession("c", 11 * HOUR, 12 * HOUR);
    const overlaps = detectOverlaps([a, b, c]);
    expect(overlaps.has(a._id)).toBe(true);
    expect(overlaps.has(b._id)).toBe(true);
    expect(overlaps.has(c._id)).toBe(true);
  });

  it("flags transitive overlaps when the outer session is open (WR-01)", () => {
    // Open long-running session A envelops both B and C (within 16h cap).
    const a = mkSession("a", 8 * HOUR, undefined);
    const b = mkSession("b", 9 * HOUR, 10 * HOUR);
    const c = mkSession("c", 11 * HOUR, 12 * HOUR);
    const overlaps = detectOverlaps([a, b, c]);
    expect(overlaps.has(a._id)).toBe(true);
    expect(overlaps.has(b._id)).toBe(true);
    expect(overlaps.has(c._id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectFlags
// ---------------------------------------------------------------------------

describe("detectFlags", () => {
  const now = Date.UTC(2026, 3, 16, 10, 0, 0); // 2026-04-16T10:00Z → "2026-04-16" WIB

  it("returns [] for a closed same-day shift with no hireDate", () => {
    const s = mkSession("s", now - 2 * HOUR, now - 1 * HOUR, "2026-04-16");
    expect(detectFlags(s, undefined, now)).toEqual([]);
  });

  it("flags over_16h when an open shift exceeds OPEN_SHIFT_THRESHOLD_MS", () => {
    const s = mkSession("s", now - (OPEN_SHIFT_THRESHOLD_MS + HOUR), undefined, "2026-04-16");
    expect(detectFlags(s, undefined, now)).toContain("over_16h");
  });

  it("does NOT flag over_16h for an open shift still within the threshold", () => {
    const s = mkSession("s", now - 2 * HOUR, undefined, "2026-04-16");
    expect(detectFlags(s, undefined, now)).not.toContain("over_16h");
  });

  it("flags missing_clockout for an open shift whose date < todayWib", () => {
    // Shift opened yesterday, still open.
    const s = mkSession("s", now - 20 * HOUR, undefined, "2026-04-15");
    const flags = detectFlags(s, undefined, now);
    expect(flags).toContain("missing_clockout");
  });

  it("does NOT flag missing_clockout for a closed shift from a prior day", () => {
    const s = mkSession("s", now - 40 * HOUR, now - 30 * HOUR, "2026-04-14");
    expect(detectFlags(s, undefined, now)).not.toContain("missing_clockout");
  });

  it("never flags before_hire when hireDate is undefined (legacy users)", () => {
    const s = mkSession("s", Date.UTC(2020, 0, 1), Date.UTC(2020, 0, 1, 8), "2020-01-01");
    expect(detectFlags(s, undefined, now)).not.toContain("before_hire");
  });

  it("flags before_hire when clockIn < hireDate", () => {
    const hireDate = Date.UTC(2026, 3, 1);
    const s = mkSession("s", Date.UTC(2026, 2, 15, 9), Date.UTC(2026, 2, 15, 17), "2026-03-15");
    expect(detectFlags(s, hireDate, now)).toContain("before_hire");
  });

  it("does NOT flag before_hire when clockIn >= hireDate", () => {
    const hireDate = Date.UTC(2026, 3, 1);
    const s = mkSession("s", Date.UTC(2026, 3, 15, 9), Date.UTC(2026, 3, 15, 17), "2026-04-15");
    expect(detectFlags(s, hireDate, now)).not.toContain("before_hire");
  });

  it("can return multiple flags simultaneously (over_16h + missing_clockout + before_hire)", () => {
    const hireDate = now - 1 * HOUR; // user hired 1h ago but has a 20h-old open shift from yesterday
    const s = mkSession("s", now - 20 * HOUR, undefined, "2026-04-15");
    const flags = detectFlags(s, hireDate, now);
    expect(flags).toContain("over_16h");
    expect(flags).toContain("missing_clockout");
    expect(flags).toContain("before_hire");
  });
});
