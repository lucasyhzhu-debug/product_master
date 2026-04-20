/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for channel audit detection (R6).
 *
 * Covers Req R6 from 74.5.1-SPEC.md:
 *   - Five issue types detectable: unmapped_sku, malformed_item,
 *     stale_mapping, duplicate_transaction, orphan_item.
 *   - Per D74.5.1-L4 (RESEARCH Pitfall 5): inline cheap checks only
 *     (unmapped_sku + malformed_item); expensive checks (stale_mapping,
 *     duplicate_transaction, orphan_item) run only in `runFullAudit`.
 *
 * RED STATE: imports from `../channelAudit` which does NOT exist until Wave 2.
 * `@ts-expect-error` comments let the file compile; tests fail at runtime.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

// @ts-expect-error — module created in Wave 2 (74.5.1-04-channel-audit)
import { detectAuditIssuesForItem, runFullAudit } from "../channelAudit";

const modules = import.meta.glob("../../**/*.ts");

type TestContext = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Helpers — minimal revenue parent + item seeders
// ---------------------------------------------------------------------------

async function seedRevenueParent(
  t: TestContext,
  overrides: Partial<{
    source: "shopee" | "tiktok" | "k3mart" | "gobiz" | "grabfood" | "internal" | "bigseller" | "consignment";
    externalTransactionId: string;
    periodStart: number;
    periodEnd: number;
  }> = {},
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("externalRevenue", {
      source: overrides.source ?? "shopee",
      periodStart: overrides.periodStart ?? 1_700_000_000_000,
      periodEnd: overrides.periodEnd ?? 1_700_000_000_000,
      dataOrigin: "api_revenue",
      confidence: "exact",
      externalTransactionId: overrides.externalTransactionId ?? "txn-1",
    }),
  );
}

async function seedRevenueItem(
  t: TestContext,
  revenueId: Id<"externalRevenue">,
  overrides: Partial<{
    source: "shopee" | "tiktok" | "k3mart" | "gobiz" | "grabfood" | "internal" | "bigseller" | "consignment";
    externalItemId: string;
    productName: string;
    quantity: number;
    totalPrice: number;
    unitPrice: number;
    linkedMenuProductId: Id<"menuProducts"> | undefined;
  }> = {},
): Promise<Id<"externalRevenueItems">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("externalRevenueItems", {
      revenueId,
      source: overrides.source ?? "shopee",
      externalItemId: overrides.externalItemId ?? "item-1",
      productName: overrides.productName ?? "Test Product",
      quantity: overrides.quantity ?? 1,
      totalPrice: overrides.totalPrice ?? 25000,
      unitPrice: overrides.unitPrice ?? 25000,
      linkedMenuProductId: overrides.linkedMenuProductId,
      isAutoMatched: false,
      createdAt: Date.now(),
    }),
  );
}

async function seedProduct(t: TestContext, code: string): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code,
      name: `Product ${code}`,
      grams: 80,
      defaultPrice: 25000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
    }),
  );
}

// ---------------------------------------------------------------------------
// Req R6 — inline cheap checks (detectAuditIssuesForItem)
// ---------------------------------------------------------------------------

describe("Req R6 — detectAuditIssuesForItem inline cheap checks (TDD red; Wave 2 makes green)", () => {
  test("T-R6.1 unmapped_sku: item with linkedMenuProductId=undefined yields unmapped_sku issue", async () => {
    const t = convexTest(schema, modules);
    const parentId = await seedRevenueParent(t);
    const itemId = await seedRevenueItem(t, parentId, { linkedMenuProductId: undefined });

    const issues = await t.run(async (ctx) => {
      const item = await ctx.db.get(itemId);
      return detectAuditIssuesForItem(ctx, item);
    });

    expect(Array.isArray(issues)).toBe(true);
    const types: string[] = issues.map((i: { type: string }) => i.type);
    expect(types).toContain("unmapped_sku");
  });

  test("T-R6.2 malformed_item: item with quantity=0 and totalPrice>0 yields malformed_item issue", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R6-2");
    const parentId = await seedRevenueParent(t);
    const itemId = await seedRevenueItem(t, parentId, {
      quantity: 0,
      totalPrice: 25000,
      linkedMenuProductId: productId,
    });

    const issues = await t.run(async (ctx) => {
      const item = await ctx.db.get(itemId);
      return detectAuditIssuesForItem(ctx, item);
    });

    const types: string[] = issues.map((i: { type: string }) => i.type);
    expect(types).toContain("malformed_item");
  });

  test("T-R6.6 inline checks return ONLY unmapped_sku and malformed_item (D74.5.1-L4 scope)", async () => {
    const t = convexTest(schema, modules);
    const parentId = await seedRevenueParent(t);
    const itemId = await seedRevenueItem(t, parentId, {
      quantity: 0,
      totalPrice: 25000,
      linkedMenuProductId: undefined,
    });

    const issues = await t.run(async (ctx) => {
      const item = await ctx.db.get(itemId);
      return detectAuditIssuesForItem(ctx, item);
    });

    const types: Set<string> = new Set(issues.map((i: { type: string }) => i.type));
    const allowedInline = new Set(["unmapped_sku", "malformed_item"]);
    for (const t of types) {
      expect(allowedInline.has(t)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Req R6 — full audit (expensive checks)
// ---------------------------------------------------------------------------

describe("Req R6 — runFullAudit expensive checks (TDD red; Wave 2 makes green)", () => {
  test("T-R6.3 stale_mapping: item mapped to archived menuProduct surfaces stale_mapping", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R6-3");
    // Archive the menu product (set isActive=false — the "stale" signal)
    await t.run(async (ctx) => {
      await ctx.db.patch(productId, { isActive: false });
    });

    const parentId = await seedRevenueParent(t);
    await seedRevenueItem(t, parentId, { linkedMenuProductId: productId });

    const report = await t.run(async (ctx) => runFullAudit(ctx));

    const issueTypes: string[] = report.issues.map((i: { type: string }) => i.type);
    expect(issueTypes).toContain("stale_mapping");
  });

  test("T-R6.4 duplicate_transaction: two items with same (source, externalTransactionId, externalItemId)", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R6-4");
    // Two revenue parents sharing the same externalTransactionId on same source
    const parent1 = await seedRevenueParent(t, { externalTransactionId: "DUP-1" });
    const parent2 = await seedRevenueParent(t, { externalTransactionId: "DUP-1" });

    await seedRevenueItem(t, parent1, { externalItemId: "ITEM-A", linkedMenuProductId: productId });
    await seedRevenueItem(t, parent2, { externalItemId: "ITEM-A", linkedMenuProductId: productId });

    const report = await t.run(async (ctx) => runFullAudit(ctx));

    const issueTypes: string[] = report.issues.map((i: { type: string }) => i.type);
    expect(issueTypes).toContain("duplicate_transaction");
  });

  test("T-R6.5 orphan_item: item referencing a deleted revenue parent", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R6-5");
    const parentId = await seedRevenueParent(t);
    const itemId = await seedRevenueItem(t, parentId, { linkedMenuProductId: productId });

    // Simulate orphan by deleting the parent row after item is written.
    await t.run(async (ctx) => {
      await ctx.db.delete(parentId);
    });

    const report = await t.run(async (ctx) => runFullAudit(ctx));

    const issueTypes: string[] = report.issues.map((i: { type: string }) => i.type);
    expect(issueTypes).toContain("orphan_item");
    // Sanity: the orphan issue references the surviving item
    const orphan = report.issues.find((i: { type: string; itemId?: string }) => i.type === "orphan_item");
    expect(orphan).toBeDefined();
    expect(orphan!.itemId).toBe(itemId);
  });

  test("T-R6.6b runFullAudit covers ALL 5 issue types (inline + expensive)", async () => {
    // Seed one row of each kind so runFullAudit must emit at least one of each.
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R6-6");
    const archivedId = await seedProduct(t, "PRD-R6-6-ARCH");
    await t.run(async (ctx) => ctx.db.patch(archivedId, { isActive: false }));

    // 1) unmapped_sku
    const p1 = await seedRevenueParent(t);
    await seedRevenueItem(t, p1, { linkedMenuProductId: undefined });
    // 2) malformed_item
    const p2 = await seedRevenueParent(t);
    await seedRevenueItem(t, p2, { quantity: 0, totalPrice: 25000, linkedMenuProductId: productId });
    // 3) stale_mapping
    const p3 = await seedRevenueParent(t);
    await seedRevenueItem(t, p3, { linkedMenuProductId: archivedId });
    // 4) duplicate_transaction
    const p4a = await seedRevenueParent(t, { externalTransactionId: "DUP-X" });
    const p4b = await seedRevenueParent(t, { externalTransactionId: "DUP-X" });
    await seedRevenueItem(t, p4a, { externalItemId: "I-X", linkedMenuProductId: productId });
    await seedRevenueItem(t, p4b, { externalItemId: "I-X", linkedMenuProductId: productId });
    // 5) orphan_item
    const p5 = await seedRevenueParent(t);
    await seedRevenueItem(t, p5, { linkedMenuProductId: productId });
    await t.run(async (ctx) => ctx.db.delete(p5));

    const report = await t.run(async (ctx) => runFullAudit(ctx));
    const types: Set<string> = new Set(report.issues.map((i: { type: string }) => i.type));

    const EXPECTED = ["unmapped_sku", "malformed_item", "stale_mapping", "duplicate_transaction", "orphan_item"];
    for (const expected of EXPECTED) {
      expect(types.has(expected)).toBe(true);
    }
  });
});
