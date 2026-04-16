import { describe, it } from "vitest";

// Wave 0 scaffold for Plan 04. Behavior implementation lives in
// convex/staffAttendance/mutations.ts::clockIn and is exercised via the Convex
// test harness (convex-test). These it.todo() calls are surfaced by Vitest as
// "pending" (not failing) and give Plan 04 a ready-made checklist.
describe("clockIn", () => {
  it.todo("creates an open attendance row (clockOut undefined) with date=todayWib");
  it.todo("derives userId from requireRole session (never from args)");
  it.todo("blocks clock-in when user has a prior-day open shift (D-04)");
  it.todo("prevents same-day double clock-in with friendly error");
  it.todo("ignores deletedAt rows when checking for open shifts");
});
