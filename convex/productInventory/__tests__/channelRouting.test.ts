/// <reference types="vite/client" />
/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for resolveChannelRoute (R2).
 *
 * Covers Req R2 from 74.5.1-SPEC.md:
 *   - 5-tier precedence (source+outlet+product → source+outlet → source+product →
 *     source default → throw CHANNEL_ROUTING_NOT_CONFIGURED).
 *   - Tier 5 MUST throw, not silently fall back.
 *
 * RED STATE: This file imports from `../channelRouting`, which does NOT exist
 * until Wave 1 (74.5.1-01-schema-spine PLAN). `@ts-expect-error` comments keep
 * the file compiling so `npm run type-check` passes; `npx vitest run` fails
 * with "Cannot find module '../channelRouting'" — that is the TDD contract.
 *
 * DO NOT delete the @ts-expect-error comments until Wave 1 lands the module.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

// @ts-expect-error — module created in Wave 1 (74.5.1-01-schema-spine)
import { resolveChannelRoute, CHANNEL_ROUTING_NOT_CONFIGURED } from "../channelRouting";

// Convex glob for convex-test module resolution
const modules = import.meta.glob("../../**/*.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestContext = ReturnType<typeof convexTest>;

async function seedLocation(
  t: TestContext,
  name: string,
): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("storageLocations", {
      name,
      locationType: "office",
      isActive: true,
      isDefault: false,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function seedOutlet(
  t: TestContext,
  externalId: string,
): Promise<Id<"externalOutlets">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("externalOutlets", {
      source: "shopee",
      externalId,
      name: `Outlet ${externalId}`,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function seedProduct(
  t: TestContext,
  code: string,
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code,
      name: `Product ${code}`,
      grams: 80,
      defaultPrice: 25000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
    });
  });
}

async function seedChannelRoutingRow(
  t: TestContext,
  args: {
    source: "shopee" | "tiktok" | "gobiz" | "k3mart" | "grabfood" | "internal" | "bigseller" | "consignment";
    outletId?: Id<"externalOutlets">;
    menuProductId?: Id<"menuProducts">;
    storageLocationId: Id<"storageLocations">;
    isDefault?: boolean;
  },
) {
  await t.run(async (ctx) => {
    // Wave 1 adds the `channelRouting` table to schema.ts. This insert call will
    // fail at runtime until then (schema has no such table). That is the RED state.
    // @ts-expect-error — table added in Wave 1 (74.5.1-01-schema-spine)
    await ctx.db.insert("channelRouting", {
      source: args.source,
      outletId: args.outletId,
      menuProductId: args.menuProductId,
      storageLocationId: args.storageLocationId,
      isDefault: args.isDefault ?? false,
      updatedBy: "test",
      updatedAt: Date.now(),
    });
  });
}

// ---------------------------------------------------------------------------
// Req R2 — resolveChannelRoute 5-tier precedence
// ---------------------------------------------------------------------------

describe("Req R2 — resolveChannelRoute (TDD red; Wave 1 makes green)", () => {
  test("T-R2.1 Tier 1 (source + outlet + product) exact match returns row storageLocationId", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse A");
    const outletId = await seedOutlet(t, "out-1");
    const productId = await seedProduct(t, "PRD-R2-1");

    await seedChannelRoutingRow(t, {
      source: "shopee",
      outletId,
      menuProductId: productId,
      storageLocationId: locId,
    });

    const result = await t.run(async (ctx) =>
      resolveChannelRoute(ctx, {
        source: "shopee",
        outletId,
        menuProductId: productId,
      }),
    );

    expect(result).toBe(locId);
  });

  test("T-R2.2 Tier 2 (source + outlet, product unspecified) returns row storageLocationId", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse B");
    const outletId = await seedOutlet(t, "out-2");

    await seedChannelRoutingRow(t, {
      source: "shopee",
      outletId,
      menuProductId: undefined,
      storageLocationId: locId,
    });

    const result = await t.run(async (ctx) =>
      resolveChannelRoute(ctx, { source: "shopee", outletId }),
    );

    expect(result).toBe(locId);
  });

  test("T-R2.3 Tier 3 (source + product, outlet unspecified) returns row storageLocationId", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse C");
    const productId = await seedProduct(t, "PRD-R2-3");

    await seedChannelRoutingRow(t, {
      source: "shopee",
      outletId: undefined,
      menuProductId: productId,
      storageLocationId: locId,
    });

    const result = await t.run(async (ctx) =>
      resolveChannelRoute(ctx, { source: "shopee", menuProductId: productId }),
    );

    expect(result).toBe(locId);
  });

  test("T-R2.4 Tier 4 (source default, no outlet, no product) returns default row storageLocationId", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse Default");

    await seedChannelRoutingRow(t, {
      source: "shopee",
      outletId: undefined,
      menuProductId: undefined,
      storageLocationId: locId,
      isDefault: true,
    });

    const result = await t.run(async (ctx) =>
      resolveChannelRoute(ctx, { source: "shopee" }),
    );

    expect(result).toBe(locId);
  });

  test("T-R2.5 Tier 5 throws CHANNEL_ROUTING_NOT_CONFIGURED when no row exists (no silent fallback)", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.run(async (ctx) =>
        resolveChannelRoute(ctx, { source: "shopee" }),
      ),
    ).rejects.toThrow(/CHANNEL_ROUTING_NOT_CONFIGURED/);
  });

  test("T-R2.6 Tier 1 wins over Tier 4 when both rows exist (precedence enforcement)", async () => {
    const t = convexTest(schema, modules);
    const tier1Loc = await seedLocation(t, "Warehouse Tier1");
    const tier4Loc = await seedLocation(t, "Warehouse Tier4");
    const outletId = await seedOutlet(t, "out-6");
    const productId = await seedProduct(t, "PRD-R2-6");

    // Tier 4 default row
    await seedChannelRoutingRow(t, {
      source: "shopee",
      outletId: undefined,
      menuProductId: undefined,
      storageLocationId: tier4Loc,
      isDefault: true,
    });

    // Tier 1 exact match row (should win)
    await seedChannelRoutingRow(t, {
      source: "shopee",
      outletId,
      menuProductId: productId,
      storageLocationId: tier1Loc,
    });

    const result = await t.run(async (ctx) =>
      resolveChannelRoute(ctx, {
        source: "shopee",
        outletId,
        menuProductId: productId,
      }),
    );

    expect(result).toBe(tier1Loc);
    expect(result).not.toBe(tier4Loc);
  });

  test("T-R2.7 CHANNEL_ROUTING_NOT_CONFIGURED error string is exported as a named constant", () => {
    // Hedge against drift: Wave 1 must export the error-string constant so that
    // callers can match on it without hard-coding the literal.
    expect(typeof CHANNEL_ROUTING_NOT_CONFIGURED).toBe("string");
    expect(CHANNEL_ROUTING_NOT_CONFIGURED).toMatch(/CHANNEL_ROUTING_NOT_CONFIGURED/);
  });
});
