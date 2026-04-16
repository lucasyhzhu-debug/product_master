import { describe, it } from "vitest";

// Wave 0 scaffold for Plan 04.
describe("correctAttendance", () => {
  it.todo("requires manager/admin role (rejects kitchen/order_staff)");
  it.todo("requires non-empty correctionNote trimmed server-side (D-19)");
  it.todo("edit_timestamps appends corrections[] entry with previousClockIn/previousClockOut");
  it.todo("edit_timestamps rejects clockOut < clockIn (I-1 guard)");
  it.todo("add_missed inserts a new row with a single correction entry");
  it.todo("add_missed rejects clockOut < clockIn (I-1 guard)");
  it.todo("reassign changes userId and captures previousUserId in the correction entry");
  it.todo("delete soft-deletes via deletedAt/deletedBy + corrections[action=delete]");
  it.todo("correctedBy and correctedByUserId snapshot the manager");
});
