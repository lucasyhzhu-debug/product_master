/// <reference types="vite/client" />
/**
 * Phase 74.5.2.1 — Vitest suite for `flipK3MartBundle` (CONTEXT D74.5.2-L14).
 *
 * Covers:
 *  - Admin-only auth gate (non-admin tokens rejected).
 *  - Atomic two-flag flip (both k3mart + consignment set in one patch).
 *  - Sibling flags preserved when a row already exists.
 *  - First-use insert path (no prior settings row).
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import { _flipK3MartBundleForTest } from "../channelFlags";

const modules = import.meta.glob("../../**/*.ts");

type TestContext = ReturnType<typeof convexTest>;

async function seedUserAndSession(
  t: TestContext,
  role: "admin" | "kitchen" | "manager" | "order_staff",
  token: string,
): Promise<void> {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: `Test ${role}`,
      role,
      pinHash: "dummy",
      failedAttempts: 0,
      isActive: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 86_400_000,
      createdAt: Date.now(),
    });
  });
}

describe("flipK3MartBundle (D74.5.2-L14 composite)", () => {
  test("T1 admin ON from no-prior-row → both flags true, other flags default", async () => {
    const t = convexTest(schema, modules);
    await seedUserAndSession(t, "admin", "admin-token");

    const result = await t.run(async (ctx) =>
      _flipK3MartBundleForTest(ctx, { token: "admin-token", enable: true }),
    );
    expect(result.k3mart).toBe(true);
    expect(result.consignment).toBe(true);

    const settings = await t.run(async (ctx) =>
      ctx.db.query("productInventorySettings").first(),
    );
    expect(settings?.channelDeductionEnabled?.k3mart).toBe(true);
    expect(settings?.channelDeductionEnabled?.consignment).toBe(true);
    // Default siblings: shopee/tiktok/etc remain false (except gobiz which is
    // default-ON per Phase 74.5.2.1 DEFAULT_FLAGS change).
    expect(settings?.channelDeductionEnabled?.shopee).toBe(false);
    expect(settings?.channelDeductionEnabled?.gobiz).toBe(true);
  });

  test("T2 admin OFF after prior ON → both flags false", async () => {
    const t = convexTest(schema, modules);
    await seedUserAndSession(t, "admin", "admin-token");

    // Seed row with both flags already ON.
    await t.run(async (ctx) =>
      ctx.db.insert("productInventorySettings", {
        globalLowStockThreshold: 5,
        autoAdvanceOnDrawdown: true,
        alertMode: "toast",
        channelDeductionEnabled: {
          bigseller: false,
          consignment: true,
          gobiz: true,
          grabfood: false,
          internal: false,
          k3mart: true,
          pos: false,
          shopee: false,
          tiktok: false,
        },
        updatedBy: "seed",
        updatedAt: Date.now(),
      }),
    );

    const result = await t.run(async (ctx) =>
      _flipK3MartBundleForTest(ctx, { token: "admin-token", enable: false }),
    );
    expect(result.k3mart).toBe(false);
    expect(result.consignment).toBe(false);

    const settings = await t.run(async (ctx) =>
      ctx.db.query("productInventorySettings").first(),
    );
    expect(settings?.channelDeductionEnabled?.k3mart).toBe(false);
    expect(settings?.channelDeductionEnabled?.consignment).toBe(false);
  });

  test("T3 non-admin token rejected", async () => {
    const t = convexTest(schema, modules);
    await seedUserAndSession(t, "admin", "admin-token");
    await seedUserAndSession(t, "kitchen", "kitchen-token");
    await seedUserAndSession(t, "manager", "manager-token");

    await expect(
      t.run(async (ctx) =>
        _flipK3MartBundleForTest(ctx, { token: "kitchen-token", enable: true }),
      ),
    ).rejects.toThrow();

    await expect(
      t.run(async (ctx) =>
        _flipK3MartBundleForTest(ctx, { token: "manager-token", enable: true }),
      ),
    ).rejects.toThrow();
  });

  test("T4 sibling flags preserved when admin flips bundle", async () => {
    const t = convexTest(schema, modules);
    await seedUserAndSession(t, "admin", "admin-token");

    // Seed with shopee + tiktok ON, k3mart + consignment OFF.
    await t.run(async (ctx) =>
      ctx.db.insert("productInventorySettings", {
        globalLowStockThreshold: 5,
        autoAdvanceOnDrawdown: true,
        alertMode: "toast",
        channelDeductionEnabled: {
          bigseller: false,
          consignment: false,
          gobiz: true,
          grabfood: false,
          internal: false,
          k3mart: false,
          pos: false,
          shopee: true,
          tiktok: true,
        },
        updatedBy: "seed",
        updatedAt: Date.now(),
      }),
    );

    await t.run(async (ctx) =>
      _flipK3MartBundleForTest(ctx, { token: "admin-token", enable: true }),
    );

    const settings = await t.run(async (ctx) =>
      ctx.db.query("productInventorySettings").first(),
    );
    const flags = settings?.channelDeductionEnabled;
    expect(flags?.shopee).toBe(true); // preserved
    expect(flags?.tiktok).toBe(true); // preserved
    expect(flags?.gobiz).toBe(true); // preserved
    expect(flags?.k3mart).toBe(true); // flipped
    expect(flags?.consignment).toBe(true); // flipped
  });
});
