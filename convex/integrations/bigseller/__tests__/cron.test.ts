/**
 * Phase 79 Wave 0 — Plan 01 Task 2
 *
 * Failing tests for the nightly BigSeller cron's skip-if-not-idle guard.
 *
 * Wave 1 (Plan 05) will create `convex/integrations/bigseller/cron.ts` and
 * register `internal.integrations.bigseller.cron.nightlySync`. Until then
 * these tests fail red because the internal action does not exist.
 *
 * Anchors:
 *  - T-79-08/T-79-09/T-79-10 threat register (cron overlap + retry flood)
 *  - DA-12 requirement (daily 03:00 WIB automatic refresh)
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

describe("nightlySync cron — skip-if-not-idle", () => {
  it("runs a 7-day sync when bigsellerSyncState.stage === 'idle'", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("bigsellerSyncState", {
        stage: "idle",
        pollAttempt: 0,
        maxPolls: 10,
        attempt: 0,
        startDate: "",
        endDate: "",
        startedAt: 0,
      });
    });

    await t.action(internal.integrations.bigseller.cron.nightlySync, {});

    const logs = await t.run(async (ctx) => ctx.db.query("externalSyncLogs").collect());
    expect(logs.length).toBeGreaterThanOrEqual(1);
    // The cron must NOT emit the skip signal when state is idle — that's the
    // contract under test here. Downstream sync-chain errors (e.g. missing
    // token) are covered by the "logs a full error row" case below.
    const skipLogs = logs.filter(
      (l: any) =>
        typeof l.errorMessage === "string" &&
        l.errorMessage.includes("skipped: manual sync in progress"),
    );
    expect(skipLogs.length).toBe(0);
  });

  it("skips and writes an error log when stage !== 'idle'", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("bigsellerSyncState", {
        stage: "fetching",
        pollAttempt: 2,
        maxPolls: 10,
        attempt: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-14",
        startedAt: Date.now(),
      });
    });

    const before = await t.run(async (ctx) => ({
      logs: (await ctx.db.query("externalSyncLogs").collect()).length,
      revenue: (await ctx.db.query("externalRevenue").collect()).length,
      items: (await ctx.db.query("externalRevenueItems").collect()).length,
      orders: (await ctx.db.query("bigsellerOrders").collect()).length,
    }));

    await t.action(internal.integrations.bigseller.cron.nightlySync, {});

    const after = await t.run(async (ctx) => ({
      logs: await ctx.db.query("externalSyncLogs").collect(),
      revenue: (await ctx.db.query("externalRevenue").collect()).length,
      items: (await ctx.db.query("externalRevenueItems").collect()).length,
      orders: (await ctx.db.query("bigsellerOrders").collect()).length,
    }));

    // Exactly one new log entry, status=error, with the skip signal.
    expect(after.logs.length).toBe(before.logs + 1);
    const skipLog = after.logs.find((l: any) =>
      typeof l.errorMessage === "string" && l.errorMessage.includes("skipped: manual sync in progress"),
    );
    expect(skipLog).toBeDefined();
    expect(skipLog!.status).toBe("error");

    // Zero new data rows — skip means skip.
    expect(after.revenue).toBe(before.revenue);
    expect(after.items).toBe(before.items);
    expect(after.orders).toBe(before.orders);
  });

  it("logs a full error row when runBigsellerSync throws", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("bigsellerSyncState", {
        stage: "idle",
        pollAttempt: 0,
        maxPolls: 10,
        attempt: 0,
        startDate: "",
        endDate: "",
        startedAt: 0,
      });
    });

    // Force failure by leaving no platformCredentials → sync should throw and
    // the cron must capture this into externalSyncLogs rather than crashing.
    await t.action(internal.integrations.bigseller.cron.nightlySync, {});

    const logs = await t.run(async (ctx) => ctx.db.query("externalSyncLogs").collect());
    const errorLog = logs.find((l: any) => l.status === "error");
    expect(errorLog).toBeDefined();
    expect(typeof errorLog!.errorMessage).toBe("string");
    expect(errorLog!.errorMessage!.length).toBeGreaterThan(0);
  });
});
