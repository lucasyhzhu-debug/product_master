import { describe, it } from "vitest";

// Wave 0 scaffold for Plan 04.
describe("clockOut", () => {
  it.todo("sets clockOut and durationMs = clockOut - clockIn on the open row");
  it.todo("rejects attempts to close another user's shift (non-manager)");
  it.todo("permits manager/admin to close another user's shift");
  it.todo("rejects staff self-closure of a prior-day shift (D-04 server enforcement)");
  it.todo("throws when the record is already closed");
  it.todo("throws when the record has been soft-deleted");
});
