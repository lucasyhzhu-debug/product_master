import { describe, it } from "vitest";

// Wave 0 scaffold for Plan 04 — exercises the additive extension of
// getStaffPerformanceSummary introduced in Phase 74 Plan 01 Task 3.
describe("getStaffPerformanceSummary attendance extension", () => {
  it.todo("totalHoursWorked sums closed durationMs across a user's sessions");
  it.todo("open shifts contribute 0 to totalHoursWorked (D-03 semantics)");
  it.todo("daysAttended counts distinct dates with at least one clock-in");
  it.todo("flaggedShiftCount counts sessions with any flag reason");
  it.todo("perDayBreakdown sorts dates descending");
  it.todo("staff with attendance but zero production still appear (D-07 retroactive)");
  it.todo("BOM-resolved ball counting preserved from the original aggregation");
});
