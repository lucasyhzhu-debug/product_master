/**
 * POS slot assignment validation tests.
 *
 * Guards the assignToSlot / assignToPackagingSlot contract: slots are 1-based,
 * and an invalid slot must surface as a ConvexError (not a masked "Server Error").
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");

type TestContext = ReturnType<typeof convexTest>;

async function createAdminToken(t: TestContext) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Test Admin",
      pinHash: "salt:hash1234",
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token: "test-token-admin",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
    });
    return "test-token-admin";
  });
}

async function createMenuProduct(
  t: TestContext,
  overrides: Record<string, unknown> = {}
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code: `MP-${Math.random().toString(36).substr(2, 6)}`,
      name: "Test Product",
      grams: 80,
      defaultPrice: 15000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
      productType: "food",
      ...overrides,
    } as any);
  });
}

describe("assignToSlot validation", () => {
  test("slot 0 rejected with a surfaced (ConvexError) message", async () => {
    const t = convexTest(schema, modules);
    const token = await createAdminToken(t);
    const product = await createMenuProduct(t);

    await expect(
      t.mutation(api.menuProducts.mutations.assignToSlot, {
        token,
        id: product,
        slot: 0,
      })
    ).rejects.toThrow("Slot must be a positive integer");
  });

  test("negative slot rejected", async () => {
    const t = convexTest(schema, modules);
    const token = await createAdminToken(t);
    const product = await createMenuProduct(t);

    await expect(
      t.mutation(api.menuProducts.mutations.assignToSlot, {
        token,
        id: product,
        slot: -1,
      })
    ).rejects.toThrow("Slot must be a positive integer");
  });

  test("non-integer slot rejected", async () => {
    const t = convexTest(schema, modules);
    const token = await createAdminToken(t);
    const product = await createMenuProduct(t);

    await expect(
      t.mutation(api.menuProducts.mutations.assignToSlot, {
        token,
        id: product,
        slot: 1.5,
      })
    ).rejects.toThrow("Slot must be a positive integer");
  });

  test("valid slot 1 accepted and persisted", async () => {
    const t = convexTest(schema, modules);
    const token = await createAdminToken(t);
    const product = await createMenuProduct(t);

    await t.mutation(api.menuProducts.mutations.assignToSlot, {
      token,
      id: product,
      slot: 1,
    });

    const updated = await t.run(async (ctx) => ctx.db.get(product));
    expect(updated?.posSlot).toBe(1);
  });
});
