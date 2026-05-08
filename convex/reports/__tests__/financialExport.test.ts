/**
 * Phase 76 Wave 0 — Plan 01 Task 1.1
 *
 * Failing-loud stub test file for the financialExport backend.
 * Plans 02 + 03 will replace each `it.todo(...)` with a real test body.
 *
 * Schema name corrections (per RESEARCH §"Schema name corrections"):
 *   - Use sourceType on journalEntries
 *   - Use date on journalEntries (entryDate is denormalized on the lines table)
 *   - Use debitAmount / creditAmount on journalEntryLines
 *   - Use journalEntryId as the FK on journalEntryLines
 *   - The chart of accounts table is named accounts (not the legacy gl-prefixed name)
 *   - Use reversedByEntryId on journalEntries for reversal back-pointer
 *
 * Coverage:
 *   - getRawTransactionsExport: role gate, range bounds, reversal lines (D-04),
 *     debit/credit mutex (D-01), ordering (D-02), empty range
 *   - getMultiPeriodPLExport: COGS override regression (D-07), rangeGap aggregation (D-08, M1)
 *   - getExportPreflight: stats (D-12), large-range warning (D-16)
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

// Period: Monday 2026-03-23 00:00 WIB through Monday 2026-03-30 00:00 WIB (exclusive).
// WIB = UTC+7, so 00:00 WIB = 17:00 UTC previous day.
const PERIOD_START = Date.UTC(2026, 2, 22, 17, 0, 0); // 2026-03-23 00:00 WIB
const PERIOD_END = Date.UTC(2026, 2, 29, 17, 0, 0); // 2026-03-30 00:00 WIB (exclusive)
const IN_PERIOD = Date.UTC(2026, 2, 25, 17, 0, 0); // Thursday inside period

// Reference these constants in a no-op describe block to keep them used during stub phase.
// Plan 02 / 03 will consume them in real test bodies.
void PERIOD_START;
void PERIOD_END;
void IN_PERIOD;

// Reference the api / schema imports too so eslint doesn't strip them while bodies are TBD.
void api;
void schema;

async function seedUser(
  t: TestT,
  role: "kitchen" | "order_staff" | "manager" | "admin" = "admin",
): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: `Test ${role}`,
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    }),
  );
}

// Reference seedUser helper so it doesn't get tree-shaken / linted out.
void seedUser;

describe("getRawTransactionsExport - role gate", () => {
  it.todo("rejects kitchen role");
  it.todo("rejects order_staff role");
  it.todo("accepts manager role");
  it.todo("accepts admin role");
});

describe("getRawTransactionsExport - range bounds", () => {
  it.todo("includes lines at periodStart and excludes at periodEnd");
});

describe("getRawTransactionsExport - reversal lines included (D-04)", () => {
  it.todo(
    "includes both original and reversal/_void JEs (sourceType ends in _void)",
  );
});

describe("getRawTransactionsExport - debit/credit mutex (D-01)", () => {
  it.todo("every row has exactly one of debitAmount/creditAmount > 0");
});

describe("getRawTransactionsExport - ordering (D-02)", () => {
  it.todo(
    "sorts by entryDate ASC, entryNumber ASC, _creationTime ASC (stable journalEntryId tie-break)",
  );
});

describe("getRawTransactionsExport - empty range", () => {
  it.todo("returns empty rows array, no crash");
});

describe("getMultiPeriodPLExport - COGS override regression (D-07)", () => {
  it.todo(
    "honors menuProducts.cogsOverrideIdr in extracted fetchAndAggregate (no duplicated math)",
  );
});

describe("getExportPreflight - stats (D-12)", () => {
  it.todo("returns journalLineCount, revenueRowCount, periodCount");
});

describe("getExportPreflight - large range warning (D-16)", () => {
  it.todo("isLargeRange === true when journalLineCount > 10000");
});

describe("getMultiPeriodPLExport - rangeGap aggregates real WeekData fields (D-08)", () => {
  it.todo(
    "rangeGap.unmappedProducts unions across periods (walks current.gapAnalysis.unmappedProducts)",
  );
  it.todo(
    "rangeGap.missingChannels unions across periods (walks current.gapAnalysis.missingChannels)",
  );
  it.todo(
    "rangeGap.totalProducts/totalMappedProducts sum across periods (walks current.gapAnalysis.*)",
  );
});

// Sentinel assertion to remind plan 02/03 implementers — vitest reports skipped if file has only todos.
// Remove this `expect` once at least one real test body lands in plan 02.
describe("Phase 76 Wave 0 stub — meta", () => {
  it("file is registered with vitest (sanity check)", () => {
    expect(true).toBe(true);
  });
});
