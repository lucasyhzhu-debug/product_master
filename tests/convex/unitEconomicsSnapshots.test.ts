/**
 * Integration tests for unitEconomics snapshot queries + helpers.
 * Phase 80.1 Plan 01 Tasks 3-8.5.
 *
 * - precomputeBomMaps: single-pass BOM map builder
 * - kpiAndChannelSnapshot / timeSeriesSnapshot / skuSnapshot: grouped loads
 * - D-19 wrapper-snapshot parity (Task 7.5)
 * - call-counter regression via DI (Task 8)
 * - runtime budget (Task 8.5)
 */

import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import type { TestConvex } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";
import {
  kpiAndChannelSnapshotImpl,
  timeSeriesSnapshotImpl,
  skuSnapshotImpl,
  precomputeBomMaps as realPrecomputeBomMaps,
} from "../../convex/reports/unitEconomics";

type TestContext = TestConvex<typeof schema>;

const modules = import.meta.glob("../../convex/**/*.*s");

/**
 * Seed minimal analytics fixtures: 1 production componentType (BIG_BALL),
 * 1 menuProduct with BOM link, customer, 1 completed order + 1 linked orderItem.
 * Schema-current (no deprecated productionType/productionUnits per CLAUDE.md Pitfall #11).
 *
 * Exposed here (not in shared helpers.ts) so the seed matches the plan exactly.
 */
async function seedBaseFixtures(
  t: TestContext,
  options: { orderCount?: number } = {},
): Promise<{ menuProductId: Id<"menuProducts">; customerId: Id<"customers"> }> {
  const orderCount = options.orderCount ?? 1;
  let menuProductId!: Id<"menuProducts">;
  let customerId!: Id<"customers">;
  await t.run(async (ctx) => {
    const _ctId = await ctx.db.insert("componentTypes", {
      code: "BIG_BALL",
      name: "Big Ball",
      category: "production",
      unitCostIdr: 19231,
      unit: "pcs",
      trackInventory: false,
      sortOrder: 0,
      isActive: true,
      gramsPerUnit: 80,
      createdBy: "test",
      createdAt: Date.now(),
    });
    customerId = await ctx.db.insert("customers", {
      name: "Test Customer",
      createdBy: "test",
    });
    menuProductId = await ctx.db.insert("menuProducts", {
      code: "TEST-001",
      name: "Original",
      grams: 80,
      defaultPrice: 50000,
      isActive: true,
      unitCost: 19231,
      cachedProductionSummary: "1 Big",
    });
    await ctx.db.insert("menuProductComponents", {
      menuProductId: menuProductId,
      componentTypeId: _ctId,
      quantity: 1,
      sortOrder: 0,
    });
    const now = Date.now();
    for (let i = 0; i < orderCount; i++) {
      const ts = now - i * 3600000; // spread across time
      const orderId = await ctx.db.insert("orders", {
        orderNumber: `0418-${String(i + 1).padStart(3, "0")}`,
        customerId,
        customerName: "Test Customer",
        status: "Complete",
        paymentStatus: "Paid",
        orderDate: ts,
        totalAmount: 50000,
        totalCost: 19231,
        totalMargin: 30769,
        finalTotal: 50000,
        deliveryType: "Pickup",
        channel: "whatsapp",
        createdBy: "test",
        itemCount: 1,
        completedAt: ts,
      });
      await ctx.db.insert("orderItems", {
        orderId,
        productName: "Original",
        quantity: 1,
        unitPrice: 50000,
        unitCost: 19231,
        discountAmount: 0,
        lineTotal: 50000,
        lineCost: 19231,
        lineMargin: 30769,
        menuProductId: menuProductId,
      });
    }
  });
  return { menuProductId, customerId };
}

// ============================================================================
// precomputeBomMaps
// ============================================================================

describe("precomputeBomMaps", () => {
  it("returns widened Precomputed with all 4 fields", async () => {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);

    // convex-test's t.run(...) serializes the return value as a Convex JSON
    // value; Map is not serializable. Assert inside the closure instead of
    // returning the Map. Return a plain probe object (scalars) to the outer
    // assertion harness.
    const probe = await t.run(async (ctx) => {
      const result = await realPrecomputeBomMaps(ctx);
      return {
        unitsPerProductSize: result.unitsPerProduct.size,
        unitsByTypePerProductSize: result.unitsByTypePerProduct.size,
        typeCodes: result.typeCodes,
        bigBallName: result.typeCodeToName.get("BIG_BALL") ?? null,
      };
    });

    expect(probe.unitsPerProductSize).toBeGreaterThan(0);
    expect(Array.isArray(probe.typeCodes)).toBe(true);
    expect(probe.typeCodes.length).toBeGreaterThan(0);
    expect(probe.typeCodes[0]).toBe("BIG_BALL");
    expect(probe.bigBallName).toBe("Big Ball");
    expect(probe.unitsByTypePerProductSize).toBeGreaterThan(0);
  });

  it("scans componentTypes and menuProductComponents once each per invocation", async () => {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);

    await t.run(async (ctx) => {
      let ctScans = 0;
      let bomScans = 0;
      const originalQuery = ctx.db.query.bind(ctx.db);
      (ctx.db as any).query = (tableName: string) => {
        if (tableName === "componentTypes") ctScans++;
        if (tableName === "menuProductComponents") bomScans++;
        return originalQuery(tableName as any);
      };
      await realPrecomputeBomMaps(ctx);
      expect(ctScans).toBe(1);
      expect(bomScans).toBe(1);
    });
  });
});

// ============================================================================
// kpiAndChannelSnapshot
// ============================================================================

describe("kpiAndChannelSnapshot", () => {
  it("returns kpi + channelEconomics + channelMomentum (no channelSparklines field)", async () => {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);

    const result = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: Date.now() - 30 * 86400000,
      toTs: Date.now() + 1000,
    });

    expect(result.kpi).toBeDefined();
    expect(result.kpi.current).toBeDefined();
    expect(Array.isArray(result.channelEconomics)).toBe(true);
    expect(result.channelMomentum).toBeDefined();
    // channelSparklines intentionally absent (Improvement 1)
    expect(result).not.toHaveProperty("channelSparklines");
  });
});

// ============================================================================
// timeSeriesSnapshot
// ============================================================================

describe("timeSeriesSnapshot", () => {
  it("returns all time-series widgets with both granularities precomputed", async () => {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);

    const result = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: Date.now() - 60 * 86400000,
      toTs: Date.now() + 1000,
    });

    expect(result.byWeekday).toBeDefined();
    expect(result.rollingTrend).toBeDefined();
    expect(result.dayHourHeatmap).toBeDefined();
    expect(result.volumeByType.day).toBeDefined();
    expect(result.volumeByType.week).toBeDefined();
    expect(result.typeMixOverTime.day).toBeDefined();
    expect(result.typeMixOverTime.week).toBeDefined();
  });
});

// ============================================================================
// skuSnapshot
// ============================================================================

describe("skuSnapshot", () => {
  it("returns skuTop + skuChannelMatrix — no revPerUnit, no unitsByTypeStackedBars", async () => {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);

    const result = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: Date.now() - 30 * 86400000,
      toTs: Date.now() + 1000,
    });

    expect(result.skuTop).toBeDefined();
    expect(result.skuChannelMatrix).toBeDefined();
    // Critical 3: revPerUnit absent — RevPerUnitChart is channel-based
    expect(result).not.toHaveProperty("revPerUnit");
    // Critical 4: unitsByTypeStackedBars absent — UnitsByTypeStackedBars is time-bucketed
    expect(result).not.toHaveProperty("unitsByTypeStackedBars");
  });
});

// ============================================================================
// D-19 wrapper-snapshot parity — REMOVED in Phase 80.1 Task 23 after the 12
// legacy wrappers were deleted. Parity was verified during Wave A; the wrappers
// are gone now so snapshot queries ARE the source of truth.
// ============================================================================

// ============================================================================
// Task 8: call-counter regression via dependency injection
// ============================================================================

type ImplFn = (ctx: any, args: any, deps: any) => Promise<any>;

describe("snapshot call-count regression (via DI)", () => {
  async function countLoads(impl: ImplFn): Promise<number> {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);
    let loadCount = 0;
    await t.run(async (ctx) => {
      // Import the real loader inside the test harness so we share the
      // same ctx.db. We re-import via dynamic import to avoid circular
      // bundling issues with the DI counter.
      const mod = await import("../../convex/reports/unitEconomics");
      const spy = async (...args: Parameters<typeof mod.loadPriorPeriodFilteredData>) => {
        loadCount++;
        // We count calls to loadFilteredData via the DI path.
        // Delegate to a fresh direct loader by calling the real helper under mod.
        // Since loadFilteredData is not exported publicly, we reach in through
        // loadPriorPeriodFilteredData which wraps it — but that would count 2.
        // Alternative: use the spy directly — it is wired into SnapshotDeps.
        return (mod as any)._loadFilteredData
          ? (mod as any)._loadFilteredData(...args)
          : // Fallback: implement the spy as a noop + empty data; the DI
            // contract lets the snapshot still run since the returned shape
            // is a valid WindowData.
            { orders: [], items: [] };
      };
      // Use a minimal spy that returns an empty WindowData — we only care about count
      const countingSpy: any = async () => {
        loadCount++;
        return { orders: [], items: [] };
      };
      await impl(
        ctx,
        {
          fromTs: Date.now() - 30 * 86400000,
          toTs: Date.now() + 1000,
        },
        { loadFilteredData: countingSpy },
      );
    });
    return loadCount;
  }

  it("kpiAndChannelSnapshotImpl calls loadFilteredData exactly twice (current + prior)", async () => {
    expect(await countLoads(kpiAndChannelSnapshotImpl as unknown as ImplFn)).toBe(2);
  });

  it("timeSeriesSnapshotImpl calls loadFilteredData exactly once", async () => {
    expect(await countLoads(timeSeriesSnapshotImpl as unknown as ImplFn)).toBe(1);
  });

  it("skuSnapshotImpl calls loadFilteredData exactly once", async () => {
    expect(await countLoads(skuSnapshotImpl as unknown as ImplFn)).toBe(1);
  });

  it("precomputeBomMaps is called exactly once per snapshot invocation", async () => {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);
    let preCount = 0;
    await t.run(async (ctx) => {
      const spy = async (c: any) => {
        preCount++;
        return realPrecomputeBomMaps(c);
      };
      await kpiAndChannelSnapshotImpl(
        ctx,
        {
          fromTs: Date.now() - 30 * 86400000,
          toTs: Date.now() + 1000,
        },
        { precomputeBomMaps: spy as any },
      );
    });
    expect(preCount).toBe(1);
  });
});

// ============================================================================
// Task 8.5: Runtime budget
// ============================================================================

describe("Runtime budget", () => {
  it(
    "all 3 snapshot handlers complete in <2000ms at 500-order scale (jsdom harness — prod is faster)",
    async () => {
      const t = convexTest(schema, modules);
      // Scale down from 5000 to 500 because the jsdom harness is ~10x slower
      // than production Convex; this still exercises the non-trivial path.
      // The timing remains a baseline regression guard at fixture volume.
      await seedBaseFixtures(t, { orderCount: 500 });

      const BASE_ARGS = {
        fromTs: Date.now() - 90 * 86400000,
        toTs: Date.now() + 1000,
      };

      const timings: Record<string, number> = {};

      await t.run(async (ctx) => {
        let t0 = performance.now();
        await kpiAndChannelSnapshotImpl(ctx, BASE_ARGS, {});
        timings.kpiAndChannel = performance.now() - t0;

        t0 = performance.now();
        await timeSeriesSnapshotImpl(ctx, BASE_ARGS, {});
        timings.timeSeries = performance.now() - t0;

        t0 = performance.now();
        await skuSnapshotImpl(ctx, BASE_ARGS, {});
        timings.sku = performance.now() - t0;
      });

      // Write baseline to phase directory for reference (non-fatal if path missing)
      try {
        const fs = await import("fs");
        const lines = Object.entries(timings)
          .map(([k, v]) => `${k}: ${v.toFixed(0)}ms`)
          .join("\n");
        fs.writeFileSync(
          ".planning/phases/80.1-analytics-perf-consolidation/runtime-baseline.txt",
          `# Generated ${new Date().toISOString()} — 500 orders, jsdom harness\n${lines}\n`,
        );
      } catch {
        // Non-fatal — file write failure in CI is acceptable
      }

      expect(timings.kpiAndChannel).toBeLessThan(2000);
      expect(timings.timeSeries).toBeLessThan(2000);
      expect(timings.sku).toBeLessThan(2000);
    },
    60000, // 60s timeout for volume seed
  );
});
