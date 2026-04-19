/**
 * Phase 80.2 Wave 3 — Task 3.1
 *
 * Unit tests for the K3Mart branch of `applyRetroactiveProductMappingImpl`.
 * Mirrors `convex/externalData/__tests__/retroactive-mapping-shopee.test.ts`
 * with source="k3mart": K3Mart parents are patched by externalProductCode,
 * the cascade is idempotent on re-run, and remap-to-undefined un-links.
 *
 * The Shopee shape-assertion test locks the additive return-shape contract
 * introduced in Wave 1 Task 1.3 (`externalRevenueUpdated: number`). Any
 * future narrowing of the return shape will break this assertion loudly.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

// Admin-token harness — copied verbatim from
// convex/externalData/__tests__/retroactive-mapping-shopee.test.ts:26-36.
async function seedAdminToken(t: TestT): Promise<string> {
  const tok = `admin-${Date.now()}-${Math.random()}`;
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Admin",
      pinHash: "salt:hash",
      role: "admin" as const,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId,
      token: tok,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
  });
  return tok;
}

async function seedMenuProduct(
  t: TestT,
  name: string,
  price: number,
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code: name.replace(/\s+/g, "_").toUpperCase(),
      name,
      grams: 80,
      defaultPrice: price,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
    } as never);
  });
}

async function seedK3MartMapping(
  t: TestT,
  args: {
    externalProductCode: string;
    externalProductName: string;
    menuProductId?: Id<"menuProducts">;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("externalProductMappings", {
      source: "k3mart" as const,
      externalProductCode: args.externalProductCode,
      externalProductName: args.externalProductName,
      menuProductId: args.menuProductId,
      isAutoMapped: false,
      createdAt: Date.now(),
    } as never);
  });
}

async function seedK3MartParent(
  t: TestT,
  args: {
    externalProductCode: string;
    productName: string;
    quantity: number;
    total: number;
  },
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("externalRevenue", {
      source: "k3mart" as const,
      externalProductCode: args.externalProductCode,
      productName: args.productName,
      quantitySold: args.quantity,
      revenueGross: args.total,
      revenueNet: args.total,
      periodStart: now,
      periodEnd: now,
      transactionDate: now,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
    } as never);
  });
}

describe("K3Mart retroactive mapping cascade", () => {
  it("patches matching parents by externalProductCode, leaves non-matching untouched", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mpA = await seedMenuProduct(t, "Original 80g", 23000);
    await seedK3MartMapping(t, {
      externalProductCode: "K3-001",
      externalProductName: "Original 80g",
      menuProductId: mpA,
    });
    const parent1 = await seedK3MartParent(t, {
      externalProductCode: "K3-001",
      productName: "Original 80g",
      quantity: 5,
      total: 115000,
    });
    const parent2 = await seedK3MartParent(t, {
      externalProductCode: "K3-001",
      productName: "Original 80g",
      quantity: 3,
      total: 69000,
    });
    const parent3 = await seedK3MartParent(t, {
      externalProductCode: "K3-999",
      productName: "Unrelated",
      quantity: 1,
      total: 10000,
    });

    const result = await t.mutation(
      api.externalData.mutations.applyRetroactiveProductMapping,
      {
        token,
        source: "k3mart",
        externalProductCode: "K3-001",
        menuProductId: mpA,
      },
    );

    expect(result.externalRevenueUpdated).toBe(2);

    const p1 = await t.run(async (ctx) => ctx.db.get(parent1));
    const p2 = await t.run(async (ctx) => ctx.db.get(parent2));
    const p3 = await t.run(async (ctx) => ctx.db.get(parent3));
    expect(p1?.linkedMenuProductId).toBe(mpA);
    expect(p2?.linkedMenuProductId).toBe(mpA);
    expect(p3?.linkedMenuProductId).toBeUndefined();
  });

  it("is idempotent — second run reports 0 updates", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mpA = await seedMenuProduct(t, "Original 80g", 23000);
    await seedK3MartMapping(t, {
      externalProductCode: "K3-001",
      externalProductName: "Original 80g",
      menuProductId: mpA,
    });
    await seedK3MartParent(t, {
      externalProductCode: "K3-001",
      productName: "Original 80g",
      quantity: 5,
      total: 115000,
    });

    const r1 = await t.mutation(
      api.externalData.mutations.applyRetroactiveProductMapping,
      {
        token,
        source: "k3mart",
        externalProductCode: "K3-001",
        menuProductId: mpA,
      },
    );
    expect(r1.externalRevenueUpdated).toBe(1);

    const r2 = await t.mutation(
      api.externalData.mutations.applyRetroactiveProductMapping,
      {
        token,
        source: "k3mart",
        externalProductCode: "K3-001",
        menuProductId: mpA,
      },
    );
    expect(r2.externalRevenueUpdated).toBe(0);
  });

  it("supports remap-to-undefined (un-link)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mpA = await seedMenuProduct(t, "Original 80g", 23000);
    await seedK3MartMapping(t, {
      externalProductCode: "K3-001",
      externalProductName: "Original 80g",
      menuProductId: mpA,
    });
    const pid = await seedK3MartParent(t, {
      externalProductCode: "K3-001",
      productName: "Original 80g",
      quantity: 5,
      total: 115000,
    });

    await t.mutation(
      api.externalData.mutations.applyRetroactiveProductMapping,
      {
        token,
        source: "k3mart",
        externalProductCode: "K3-001",
        menuProductId: mpA,
      },
    );
    const linked = await t.run(async (ctx) => ctx.db.get(pid));
    expect(linked?.linkedMenuProductId).toBe(mpA);

    const r = await t.mutation(
      api.externalData.mutations.applyRetroactiveProductMapping,
      {
        token,
        source: "k3mart",
        externalProductCode: "K3-001",
        menuProductId: undefined,
      },
    );
    expect(r.externalRevenueUpdated).toBe(1);
    const unlinked = await t.run(async (ctx) => ctx.db.get(pid));
    expect(unlinked?.linkedMenuProductId).toBeUndefined();
  });

  it("does not regress Shopee cascade — additive return-shape fields all present for shopee source", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mpA = await seedMenuProduct(t, "Jumbo 80g", 30000);
    await seedK3MartMapping(t, {
      externalProductCode: "SHOPEE-SKU-X",
      externalProductName: "Jumbo 80g",
      menuProductId: mpA,
    });
    const result = await t.mutation(
      api.externalData.mutations.applyRetroactiveProductMapping,
      {
        token,
        source: "shopee",
        externalProductCode: "SHOPEE-SKU-X",
        menuProductId: mpA,
      },
    );
    // Shape check: the new additive field exists and equals 0 for non-k3mart sources,
    // and the existing fields are still numeric. Locks the additive contract.
    expect(result.externalRevenueUpdated).toBe(0);
    expect(typeof result.updatedItems).toBe("number");
    expect(typeof result.bigsellerUpdated).toBe("number");
  });
});
