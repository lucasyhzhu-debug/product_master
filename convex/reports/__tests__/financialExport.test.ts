/**
 * Phase 76 Plan 02 Task 2.3 — Backend integration tests for the three financial
 * export Convex queries. Replaces Wave 0 it.todo stubs from plan 01 with real
 * convex-test bodies.
 *
 * Schema name corrections (per RESEARCH §"Schema name corrections"):
 *   - sourceType / date on journalEntries
 *   - debitAmount / creditAmount / journalEntryId / entryDate on journalEntryLines
 *   - accounts (not glAccounts)
 *
 * Coverage:
 *   - getRawTransactionsExport: role gate (D-13), range bounds (D-03), reversal
 *     lines (D-04), debit/credit mutex (D-01), ordering (D-02), empty range
 *   - getMultiPeriodPLExport: COGS override regression (D-07), rangeGap aggregation (D-08, M1)
 *   - getExportPreflight: stats (D-12), large-range warning (D-16, R4)
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

// Two-week range for rangeGap test: 2026-04-13 Mon → 2026-04-27 Mon (exclusive).
const WIB_2026_04_13 = Date.UTC(2026, 3, 12, 17, 0, 0);
const WIB_2026_04_20 = Date.UTC(2026, 3, 19, 17, 0, 0);
const WIB_2026_04_27 = Date.UTC(2026, 3, 26, 17, 0, 0);

// ── Seed helpers ──

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

async function seedSession(
  t: TestT,
  userId: Id<"users">,
): Promise<string> {
  const token = `test-token-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });
  });
  return token;
}

async function seedAccount(
  t: TestT,
  code: string = "5100",
  name: string = "Cost of Goods Sold",
): Promise<Id<"accounts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("accounts", {
      code,
      name,
      type: "cogs",
      category: "cost_of_sales",
      isActive: true,
      isSystem: true,
    }),
  );
}

/**
 * Insert a single journal entry + one debit line. The line.entryDate is what the
 * by_entryDate index ranges against (denormalized from journalEntries.date).
 */
async function seedJournalDebit(
  t: TestT,
  userId: Id<"users">,
  accountId: Id<"accounts">,
  amount: number,
  entryDate: number,
  sourceType:
    | "expense_approval"
    | "expense_void"
    | "manual"
    | "depreciation"
    | "reimbursement"
    | "reimbursement_void" = "expense_approval",
  entryNumber?: string,
): Promise<{
  jeId: Id<"journalEntries">;
  lineId: Id<"journalEntryLines">;
}> {
  return await t.run(async (ctx) => {
    const en =
      entryNumber ??
      `JE-TEST-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
    const jeId = await ctx.db.insert("journalEntries", {
      entryNumber: en,
      date: entryDate,
      description: `Test JE ${en}`,
      sourceType,
      isReversed: false,
      createdBy: userId,
      createdAt: Date.now(),
    });
    const lineId = await ctx.db.insert("journalEntryLines", {
      journalEntryId: jeId,
      accountId,
      entryDate,
      debitAmount: amount,
      creditAmount: 0,
    });
    return { jeId, lineId };
  });
}

/** Same as seedJournalDebit but emits a credit line (creditAmount > 0). */
async function seedJournalCredit(
  t: TestT,
  userId: Id<"users">,
  accountId: Id<"accounts">,
  amount: number,
  entryDate: number,
  sourceType: "expense_approval" | "manual" = "expense_approval",
  entryNumber?: string,
): Promise<Id<"journalEntries">> {
  return await t.run(async (ctx) => {
    const en =
      entryNumber ??
      `JE-TEST-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
    const jeId = await ctx.db.insert("journalEntries", {
      entryNumber: en,
      date: entryDate,
      description: `Test JE ${en}`,
      sourceType,
      isReversed: false,
      createdBy: userId,
      createdAt: Date.now(),
    });
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: jeId,
      accountId,
      entryDate,
      debitAmount: 0,
      creditAmount: amount,
    });
    return jeId;
  });
}

async function seedMenuProduct(
  t: TestT,
  name: string,
  price: number,
  cogsOverrideIdr: number,
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code: name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      name,
      grams: 80,
      defaultPrice: price,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
      cogsOverrideIdr,
    }),
  );
}

/**
 * Seed an externalRevenue row with N items. Items WITHOUT linkedMenuProductId
 * surface as gapAnalysis.unmappedProducts entries.
 */
async function seedExternalRevenueWithItems(
  t: TestT,
  source: "shopee" | "tiktok",
  transactionDate: number,
  items: Array<{
    productName: string;
    quantity: number;
    totalPrice: number;
    menuProductId?: Id<"menuProducts">;
  }>,
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const total = items.reduce((s, it) => s + it.totalPrice, 0);
    const revenueId = await ctx.db.insert("externalRevenue", {
      source,
      revenueGross: total,
      revenueNet: total,
      periodStart: transactionDate,
      periodEnd: transactionDate,
      transactionDate,
      dataOrigin: "api_revenue",
      confidence: "exact",
    });
    for (const it of items) {
      await ctx.db.insert("externalRevenueItems", {
        revenueId,
        source,
        productName: it.productName,
        unitPrice:
          it.quantity > 0 ? it.totalPrice / it.quantity : it.totalPrice,
        quantity: it.quantity,
        totalPrice: it.totalPrice,
        linkedMenuProductId: it.menuProductId,
        isAutoMatched: Boolean(it.menuProductId),
        createdAt: transactionDate,
      });
    }
    return revenueId;
  });
}

// ─── Tests ───

describe("getRawTransactionsExport - role gate (D-13)", () => {
  it("rejects kitchen role", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "kitchen");
    const token = await seedSession(t, userId);
    await expect(
      t.query(api.reports.financialExport.getRawTransactionsExport, {
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        token,
      }),
    ).rejects.toThrow(/Not authorized|not authorized/i);
  });

  it("rejects order_staff role", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "order_staff");
    const token = await seedSession(t, userId);
    await expect(
      t.query(api.reports.financialExport.getRawTransactionsExport, {
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        token,
      }),
    ).rejects.toThrow(/Not authorized|not authorized/i);
  });

  it("accepts manager role", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "manager");
    const token = await seedSession(t, userId);
    const rows = await t.query(
      api.reports.financialExport.getRawTransactionsExport,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END, token },
    );
    expect(Array.isArray(rows)).toBe(true);
  });

  it("accepts admin role", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);
    const rows = await t.query(
      api.reports.financialExport.getRawTransactionsExport,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END, token },
    );
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("getRawTransactionsExport - range bounds (D-03)", () => {
  it("includes lines at periodStart and excludes at periodEnd (half-open)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);
    const accountId = await seedAccount(t);

    // 4 lines: at periodStart (in), mid-period (in), at periodEnd (OUT — exclusive),
    // and 1ms past end (OUT).
    await seedJournalDebit(t, userId, accountId, 1000, PERIOD_START);
    await seedJournalDebit(t, userId, accountId, 2000, IN_PERIOD);
    await seedJournalDebit(t, userId, accountId, 3000, PERIOD_END);
    await seedJournalDebit(t, userId, accountId, 4000, PERIOD_END + 1);

    const rows = await t.query(
      api.reports.financialExport.getRawTransactionsExport,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END, token },
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.debitAmount).sort((a, b) => a - b)).toEqual([
      1000, 2000,
    ]);
  });
});

describe("getRawTransactionsExport - empty range", () => {
  it("returns empty rows array, no crash", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);

    const rows = await t.query(
      api.reports.financialExport.getRawTransactionsExport,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END, token },
    );
    expect(rows).toEqual([]);
  });
});

describe("getRawTransactionsExport - reversal lines included (D-04)", () => {
  it("includes both expense_approval and expense_void JEs (sourceType emitted verbatim)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);
    const accountId = await seedAccount(t);

    await seedJournalDebit(
      t,
      userId,
      accountId,
      5000,
      IN_PERIOD,
      "expense_approval",
    );
    await seedJournalDebit(
      t,
      userId,
      accountId,
      5000,
      IN_PERIOD + 1,
      "expense_void",
    );

    const rows = await t.query(
      api.reports.financialExport.getRawTransactionsExport,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END, token },
    );

    expect(rows.length).toBe(2);
    const types = rows.map((r) => r.sourceType);
    expect(types).toContain("expense_approval");
    expect(types).toContain("expense_void");
  });
});

describe("getRawTransactionsExport - debit/credit mutex (D-01)", () => {
  it("every row has exactly one of debitAmount/creditAmount > 0", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);
    const accountId = await seedAccount(t);

    await seedJournalDebit(t, userId, accountId, 7000, IN_PERIOD);
    await seedJournalCredit(t, userId, accountId, 4000, IN_PERIOD + 1);

    const rows = await t.query(
      api.reports.financialExport.getRawTransactionsExport,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END, token },
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) {
      // Strict XOR — one positive, the other zero.
      expect(r.debitAmount > 0 !== r.creditAmount > 0).toBe(true);
    }
  });
});

describe("getRawTransactionsExport - ordering (D-02)", () => {
  it("sorts by entryDate ASC, entryNumber ASC, _creationTime ASC", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);
    const accountId = await seedAccount(t);

    // Carefully chosen seed order: insert OUT-OF-ORDER on entryDate to verify sort.
    await seedJournalDebit(
      t,
      userId,
      accountId,
      300,
      IN_PERIOD + 2 * 60_000,
      "manual",
      "JE-C",
    );
    await seedJournalDebit(
      t,
      userId,
      accountId,
      100,
      IN_PERIOD,
      "manual",
      "JE-A",
    );
    await seedJournalDebit(
      t,
      userId,
      accountId,
      200,
      IN_PERIOD + 60_000,
      "manual",
      "JE-B",
    );

    const rows = await t.query(
      api.reports.financialExport.getRawTransactionsExport,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END, token },
    );

    expect(rows.map((r) => r.entryNumber)).toEqual(["JE-A", "JE-B", "JE-C"]);
  });
});

describe("getExportPreflight - stats (D-12)", () => {
  it("returns journalLineCount, revenueRowCount, periodCount", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);
    const accountId = await seedAccount(t);

    // 5 lines in range + 1 outside.
    for (let i = 0; i < 5; i++) {
      await seedJournalDebit(t, userId, accountId, 100, IN_PERIOD + i * 1000);
    }
    await seedJournalDebit(t, userId, accountId, 100, PERIOD_END + 1000);

    const preflight = await t.query(
      api.reports.financialExport.getExportPreflight,
      {
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        granularity: "weekly",
        token,
      },
    );

    expect(preflight.journalLineCount).toBe(5);
    expect(preflight.revenueRowCount).toBe(0);
    expect(preflight.periodCount).toBeGreaterThanOrEqual(1);
    expect(preflight.isLargeRange).toBe(false);
  });
});

describe("getExportPreflight - large range warning (D-16, R4)", () => {
  it("isLargeRange === true when journalLineCount > 10000", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);
    const accountId = await seedAccount(t);

    // Concrete >10k threshold per R4. Seed 10001 journal entry lines in-range.
    // Each line gets a unique entryDate within the period to avoid pathological
    // dedup. ~5s overhead is acceptable for D-16 coverage.
    for (let i = 0; i < 10_001; i++) {
      await seedJournalDebit(t, userId, accountId, 1, IN_PERIOD + i);
    }

    const preflight = await t.query(
      api.reports.financialExport.getExportPreflight,
      {
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        granularity: "weekly",
        token,
      },
    );

    expect(preflight.isLargeRange).toBe(true);
    expect(preflight.journalLineCount).toBeGreaterThan(10_000);
  }, 60_000);

  it("isLargeRange === false when journalLineCount <= 10000", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);
    const accountId = await seedAccount(t);

    for (let i = 0; i < 5; i++) {
      await seedJournalDebit(t, userId, accountId, 1, IN_PERIOD + i);
    }

    const preflight = await t.query(
      api.reports.financialExport.getExportPreflight,
      {
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        granularity: "weekly",
        token,
      },
    );
    expect(preflight.isLargeRange).toBe(false);
  });

  // Triple-review I4 — bucket-count guard for sequential P&L loop budget.
  it("isTooManyBuckets === true when weekly buckets > 26", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);

    // 7 months weekly ≈ 30 buckets > 26 threshold
    const sevenMonthsLater = PERIOD_END + 6 * 30 * 24 * 60 * 60 * 1000;
    const preflight = await t.query(
      api.reports.financialExport.getExportPreflight,
      {
        periodStart: PERIOD_START,
        periodEnd: sevenMonthsLater,
        granularity: "weekly",
        token,
      },
    );
    expect(preflight.isTooManyBuckets).toBe(true);
    expect(preflight.periodCount).toBeGreaterThan(26);
  });

  it("isTooManyBuckets === false for short ranges", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);

    const preflight = await t.query(
      api.reports.financialExport.getExportPreflight,
      {
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        granularity: "weekly",
        token,
      },
    );
    expect(preflight.isTooManyBuckets).toBe(false);
  });
});

describe("getMultiPeriodPLExport - COGS override regression (D-07)", () => {
  it("honors menuProducts.cogsOverrideIdr in extracted fetchAndAggregate (no duplicated math)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);

    // Seed a menuProduct with cogsOverrideIdr=5000 (Phase 70 feature).
    const mp = await seedMenuProduct(t, "Jumbo", 50_000, 5_000);

    // Seed shopee revenue inside the period: 4 units × 50k.
    await seedExternalRevenueWithItems(t, "shopee", IN_PERIOD, [
      {
        productName: "Jumbo",
        quantity: 4,
        totalPrice: 200_000,
        menuProductId: mp,
      },
    ]);

    const data = await t.query(
      api.reports.financialExport.getMultiPeriodPLExport,
      {
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        granularity: "custom",
        token,
      },
    );

    expect(data.periods).toHaveLength(1);
    // Override × qty = 5000 × 4 = 20_000. Must equal totalCogs (override flows
    // through buildProductCOGSMap inside fetchAndAggregate — no duplicated math).
    expect(data.periods[0].current.totalCogs).toBe(20_000);
  });
});

describe("getMultiPeriodPLExport - rangeGap aggregates real WeekData fields (D-08, M1)", () => {
  it("rangeGap unions unmappedProducts/missingChannels and sums totalProducts/totalMappedProducts across periods", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t, "admin");
    const token = await seedSession(t, userId);

    // Period 1 (2026-04-13 Mon → 2026-04-20 Mon): Widget A qty=2, revenue=10000.
    await seedExternalRevenueWithItems(
      t,
      "shopee",
      WIB_2026_04_13 + 24 * 60 * 60 * 1000, // mid-period 1
      [{ productName: "Widget A", quantity: 2, totalPrice: 10_000 }],
    );

    // Period 2 (2026-04-20 Mon → 2026-04-27 Mon): Widget A qty=3 + Widget B qty=1.
    await seedExternalRevenueWithItems(
      t,
      "shopee",
      WIB_2026_04_20 + 24 * 60 * 60 * 1000, // mid-period 2
      [
        { productName: "Widget A", quantity: 3, totalPrice: 15_000 },
        { productName: "Widget B", quantity: 1, totalPrice: 5_000 },
      ],
    );

    const data = await t.query(
      api.reports.financialExport.getMultiPeriodPLExport,
      {
        periodStart: WIB_2026_04_13,
        periodEnd: WIB_2026_04_27,
        granularity: "weekly",
        token,
      },
    );

    expect(data.periods).toHaveLength(2);

    // Critical 3 / M1: rangeGap must NOT silently emit zeros. It must walk
    // p.current.gapAnalysis.unmappedProducts/missingChannels/totalProducts/
    // totalMappedProducts from BOTH periods and union/sum.
    const widgetA = data.rangeGap.unmappedProducts.find(
      (u) => u.name === "Widget A",
    );
    expect(widgetA).toBeDefined();
    expect(widgetA!.count).toBe(5); // 2 + 3 summed across periods
    expect(widgetA!.revenue).toBe(25_000); // 10_000 + 15_000

    const widgetB = data.rangeGap.unmappedProducts.find(
      (u) => u.name === "Widget B",
    );
    expect(widgetB).toBeDefined();
    expect(widgetB!.count).toBe(1);
    expect(widgetB!.revenue).toBe(5_000);

    // missingChannels: KNOWN_MISSING_CHANNELS contains grabfood — both periods
    // will surface it. Aggregation MUST collapse via Map<source>, not duplicate.
    const grabfoodEntries = data.rangeGap.missingChannels.filter(
      (ch) => ch.source === "grabfood",
    );
    expect(grabfoodEntries).toHaveLength(1);

    // Sum across periods: totalProducts >= 0 and >= totalMappedProducts.
    expect(data.rangeGap.totalProducts).toBeGreaterThan(0);
    expect(data.rangeGap.totalMappedProducts).toBeGreaterThanOrEqual(0);
    expect(data.rangeGap.totalProducts).toBeGreaterThanOrEqual(
      data.rangeGap.totalMappedProducts,
    );
  });
});
