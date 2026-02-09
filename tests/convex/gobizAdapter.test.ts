/**
 * Integration tests for GoBiz adapter.
 * Tests cron removal, registry updates, and new field support.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal } from "../../convex/_generated/api";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { readFileSync } from "fs";
import { join } from "path";
import { PLATFORMS } from "../../convex/integrations/registry";

// ============================================
// Cron Configuration Tests - 1 test
// ============================================
describe("Cron configuration", () => {
  test("crons file still has K3Mart cron, no GoBiz cron", () => {
    const cronsPath = join(__dirname, "../../convex/crons.ts");
    const cronsContent = readFileSync(cronsPath, "utf-8");

    // Should have K3Mart cron
    expect(cronsContent).toContain("refresh k3mart token");
    expect(cronsContent).toContain("platformCredentials.actions.refreshK3MartTokenCron");

    // Should NOT have GoBiz cron
    expect(cronsContent).not.toContain("sync gobiz revenue");
    expect(cronsContent).not.toContain("syncGoBizRevenueCron");
  });
});

// ============================================
// Registry Updates Tests - 1 test
// ============================================
describe("Platform registry", () => {
  test("GoBiz registry has updated description mentioning 5 metrics", () => {
    const gobizMeta = PLATFORMS.gobiz;

    expect(gobizMeta.description).toContain("5-metric");
    expect(gobizMeta.description).toContain("gross");
    expect(gobizMeta.description).toContain("net");
    expect(gobizMeta.description).toContain("commission");
    expect(gobizMeta.description).toContain("ad burn");
    expect(gobizMeta.description).toContain("promo burn");
  });
});

// ============================================
// saveRevenue New Fields Tests - 2 tests
// ============================================
describe("saveRevenue with new GoBiz fields", () => {
  test("accepts adBurn, promoBurn, gobizOrderNumber fields", async () => {
    const t = convexTest(schema);

    const ids = await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "gobiz",
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          revenueGross: 100000,
          revenueNet: 80000,
          commission: 5000,
          adBurn: 2000,
          promoBurn: 3000,
          gobizOrderNumber: "F-1234567890",
          transactionCount: 1,
        },
      ],
    });

    expect(ids).toHaveLength(1);

    const record = await t.run(async (ctx) => {
      return await ctx.db.get(ids[0]);
    });

    expect(record).toBeDefined();
    expect(record!.adBurn).toBe(2000);
    expect(record!.promoBurn).toBe(3000);
    expect(record!.gobizOrderNumber).toBe("F-1234567890");
    expect(record!.commission).toBe(5000);
  });

  test("saveRevenue handles optional adBurn/promoBurn gracefully", async () => {
    const t = convexTest(schema);

    const ids = await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "gobiz",
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          revenueGross: 100000,
          revenueNet: 80000,
          // No adBurn, promoBurn, gobizOrderNumber
        },
      ],
    });

    expect(ids).toHaveLength(1);

    const record = await t.run(async (ctx) => {
      return await ctx.db.get(ids[0]);
    });

    expect(record).toBeDefined();
    expect(record!.adBurn).toBeUndefined();
    expect(record!.promoBurn).toBeUndefined();
    expect(record!.gobizOrderNumber).toBeUndefined();
  });
});

// ============================================
// Token Refresh Tests - 1 test
// ============================================
describe("Token management", () => {
  test("platformCredentials stores refreshToken alongside currentToken", async () => {
    const t = convexTest(schema);

    // Create admin user and session
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Admin",
        pinHash: "salt:hash",
        role: "admin",
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      });
    });

    const token = await t.run(async (ctx) => {
      await ctx.db.insert("sessions", {
        userId,
        token: "test-token",
        expiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
      });
      return "test-token";
    });

    // Save GoBiz token with refresh token
    const credId = await t.mutation(api.platformCredentials.mutations.saveDirectToken, {
      token,
      platformId: "gobiz",
      bearerToken: "Bearer abc123",
      refreshToken: "refresh-xyz789",
    });

    const cred = await t.run(async (ctx) => {
      return await ctx.db.get(credId);
    });

    expect(cred).toBeDefined();
    expect(cred!.currentToken).toBe("Bearer abc123");
    expect(cred!.refreshToken).toBe("refresh-xyz789");
  });
});
