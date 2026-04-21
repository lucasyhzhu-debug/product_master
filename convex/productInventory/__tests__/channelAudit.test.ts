/// <reference types="vite/client" />
// Plan 01 Task 0 diagnostic:
//   diff channelSale.test.ts (green) channelAudit.test.ts (red)
//   Delta: red uses `t.action(internal.productInventory.channelAudit.runFullAudit, ...)`;
//   green uses `t.run(async (ctx) => ...)` with direct handler invocation.
//   The failing code path is convex-test's actionFromPath resolver, not our test shape.
//   Fix 4 (direct-handler via `_runFullAuditForTest` export) is the preferred fix.
/**
 * Phase 74.5.1 — Tests for channel audit detection (R6).
 *
 * Covers Req R6 from 74.5.1-SPEC.md:
 *   - Five issue types detectable: unmapped_sku, malformed_item,
 *     stale_mapping, duplicate_transaction, orphan_item.
 *   - Per D74.5.1-L4 (RESEARCH Pitfall 5): inline cheap checks only
 *     (unmapped_sku + malformed_item); expensive checks (stale_mapping,
 *     duplicate_transaction, orphan_item) run only in `runFullAudit`.
 *
 * REWRITTEN per post-execution quad-review (I1 consensus, 4/4 reviewers):
 * original plan 00 tests assumed `{type}` field + direct function call;
 * plan 04 impl uses `{issueType}` + internalAction. Tests now match impl.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";
import type { ExternalSource } from "../../lib/externalSource";
import { api, internal } from "../../_generated/api";
// Fixed 74.5.2 Plan 01: convex-test module resolution via Hypothesis 1
// (direct-handler invocation via `_runFullAuditForTest` export) — see
// RESEARCH §channelAudit.test.ts Failures. `t.action(internal.*)` triggers
// convex-test's actionFromPath resolver which throws
// "Could not find module for: \"productInventory/channelAudit\"" for this
// test file's glob + action-invocation combination. `channelSale.test.ts`
// uses direct-handler invocation (same directory, same glob) and is green.
import {
  detectAuditIssuesForItem,
  _runFullAuditForTest,
} from "../channelAudit";

const modules = import.meta.glob("../../**/*.ts");

type TestContext = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Helpers — minimal revenue parent + item seeders
// ---------------------------------------------------------------------------

async function seedRevenueParent(
  t: TestContext,
  overrides: Partial<{
    source: ExternalSource;
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
    source: ExternalSource;
    externalItemId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    linkedMenuProductId: Id<"menuProducts"> | undefined;
  }> = {},
): Promise<Id<"externalRevenueItems">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("externalRevenueItems", {
      revenueId,
      source: overrides.source ?? "shopee",
      externalItemId: overrides.externalItemId ?? "item-1",
      productName: overrides.productName ?? "Frollie Original",
      quantity: overrides.quantity ?? 1,
      unitPrice: overrides.unitPrice ?? 25000,
      totalPrice: overrides.totalPrice ?? 25000,
      linkedMenuProductId: overrides.linkedMenuProductId,
      isAutoMatched: overrides.linkedMenuProductId != null,
      matchConfidence: overrides.linkedMenuProductId ? "exact" : "none",
      createdAt: Date.now(),
    }),
  );
}

async function seedProduct(
  t: TestContext,
  code: string,
): Promise<Id<"menuProducts">> {
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
// Signature: (revenue, item) → DetectedIssue[] with shape { issueType, ... }
// ---------------------------------------------------------------------------

describe("Req R6 — detectAuditIssuesForItem inline cheap checks", () => {
  test("T-R6.1 unmapped_sku: item with linkedMenuProductId=undefined yields unmapped_sku issue", async () => {
    const t = convexTest(schema, modules);
    const parentId = await seedRevenueParent(t);
    const itemId = await seedRevenueItem(t, parentId, { linkedMenuProductId: undefined });

    const issues = await t.run(async (ctx) => {
      const revenue = await ctx.db.get(parentId);
      const item = await ctx.db.get(itemId);
      if (!revenue || !item) throw new Error("seed failed");
      return detectAuditIssuesForItem(revenue, {
        _id: item._id,
        linkedMenuProductId: item.linkedMenuProductId,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        productName: item.productName,
      });
    });

    expect(Array.isArray(issues)).toBe(true);
    const types = issues.map((i) => i.issueType);
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
      const revenue = await ctx.db.get(parentId);
      const item = await ctx.db.get(itemId);
      if (!revenue || !item) throw new Error("seed failed");
      return detectAuditIssuesForItem(revenue, {
        _id: item._id,
        linkedMenuProductId: item.linkedMenuProductId,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        productName: item.productName,
      });
    });

    const types = issues.map((i) => i.issueType);
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
      const revenue = await ctx.db.get(parentId);
      const item = await ctx.db.get(itemId);
      if (!revenue || !item) throw new Error("seed failed");
      return detectAuditIssuesForItem(revenue, {
        _id: item._id,
        linkedMenuProductId: item.linkedMenuProductId,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        productName: item.productName,
      });
    });

    const types = new Set(issues.map((i) => i.issueType));
    const allowedInline = new Set(["unmapped_sku", "malformed_item"]);
    for (const type of types) {
      expect(allowedInline.has(type)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Req R6 — full audit (expensive checks)
// runFullAudit is an internalAction — invoked via t.action, returns
// { reportId, issuesFound }. Issues are fetched separately from the
// channelAuditIssues table keyed by reportId.
// ---------------------------------------------------------------------------

async function runFullAuditAndCollect(t: TestContext) {
  // Invoke _runFullAuditForTest directly inside t.run — same as the known-green
  // pattern in channelSale.test.ts. Bypasses convex-test's `t.action(internal.*)`
  // module resolver (Plan 01 Hypothesis 1 fix).
  const result = await t.run(async (ctx) =>
    _runFullAuditForTest(ctx, { triggeredBy: "test" }),
  );
  // Filter in JS rather than via withIndex — convex-test's ctx type can drop
  // custom-index knowledge depending on the schema wrapper; collect + filter
  // is correct for test scope (small data).
  const issues = await t.run(async (ctx) =>
    (await ctx.db.query("channelAuditIssues").collect()).filter(
      (i) => i.reportId === result.reportId,
    ),
  );
  return { reportId: result.reportId, issuesFound: result.issuesFound, issues };
}

describe("Req R6 — runFullAudit expensive checks", () => {
  test("T-R6.3 stale_mapping: item mapped to archived menuProduct surfaces stale_mapping", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R6-3");
    await t.run(async (ctx) => {
      await ctx.db.patch(productId, { isActive: false });
    });

    const parentId = await seedRevenueParent(t);
    await seedRevenueItem(t, parentId, { linkedMenuProductId: productId });

    const report = await runFullAuditAndCollect(t);

    const issueTypes = report.issues.map((i) => i.issueType);
    expect(issueTypes).toContain("stale_mapping");
  });

  test("T-R6.4 duplicate_transaction: two items with same (source, externalTransactionId, externalItemId) AND same menuProductId", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R6-4");
    // Two revenue parents sharing the same externalTransactionId on same source
    const parent1 = await seedRevenueParent(t, { externalTransactionId: "DUP-1" });
    const parent2 = await seedRevenueParent(t, { externalTransactionId: "DUP-1" });

    // Both items share externalItemId + linkedMenuProductId → same externalRef
    // + same menuProductId when deducted → real duplicate_transaction per the
    // post-review fix (distinct menuProductId = legit substitution, NOT dupe).
    await seedRevenueItem(t, parent1, { externalItemId: "ITEM-A", linkedMenuProductId: productId });
    await seedRevenueItem(t, parent2, { externalItemId: "ITEM-A", linkedMenuProductId: productId });

    // For duplicate_transaction to fire at audit, productInventoryTransactions
    // must contain 2 rows with same (source, externalRef) AND same menuProductId.
    // Seed those rows directly (simulates post-deduction state).
    await t.run(async (ctx) => {
      const locationId = await ctx.db.insert("storageLocations", {
        name: "dup-test-loc",
        locationType: "office",
        isActive: true,
        isDefault: false,
        createdBy: "test",
        createdAt: Date.now(),
      });
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("productInventoryTransactions", {
          menuProductId: productId,
          locationId,
          transactionType: "channel_sale",
          source: "shopee",
          quantity: -1,
          previousQuantity: 10 - i,
          newQuantity: 9 - i,
          externalRef: "DUP-1ITEM-A",
          performedBy: "system:test",
          createdAt: 1_700_000_000_000 + i,
        });
      }
    });

    const report = await runFullAuditAndCollect(t);

    const issueTypes = report.issues.map((i) => i.issueType);
    expect(issueTypes).toContain("duplicate_transaction");
  });

  test("T-R6.5 orphan_item: item referencing a deleted revenue parent", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R6-5");
    const parentId = await seedRevenueParent(t);
    const itemId = await seedRevenueItem(t, parentId, { linkedMenuProductId: productId });

    await t.run(async (ctx) => {
      await ctx.db.delete(parentId);
    });

    const report = await runFullAuditAndCollect(t);

    const issueTypes = report.issues.map((i) => i.issueType);
    expect(issueTypes).toContain("orphan_item");
    const orphan = report.issues.find((i) => i.issueType === "orphan_item");
    expect(orphan).toBeDefined();
    expect(orphan!.itemId).toBe(itemId);
  });

  test("T-R6.6b runFullAudit covers ALL 5 issue types (inline + expensive)", async () => {
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
    // 4) duplicate_transaction (needs seeded productInventoryTransactions rows)
    const p4a = await seedRevenueParent(t, { externalTransactionId: "DUP-X" });
    await seedRevenueItem(t, p4a, { externalItemId: "I-X", linkedMenuProductId: productId });
    await t.run(async (ctx) => {
      const locationId = await ctx.db.insert("storageLocations", {
        name: "dup-test-all",
        locationType: "office",
        isActive: true,
        isDefault: false,
        createdBy: "test",
        createdAt: Date.now(),
      });
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("productInventoryTransactions", {
          menuProductId: productId,
          locationId,
          transactionType: "channel_sale",
          source: "shopee",
          quantity: -1,
          previousQuantity: 10 - i,
          newQuantity: 9 - i,
          externalRef: "DUP-XI-X",
          performedBy: "system:test",
          createdAt: 1_700_000_000_000 + i,
        });
      }
    });
    // 5) orphan_item
    const p5 = await seedRevenueParent(t);
    await seedRevenueItem(t, p5, { linkedMenuProductId: productId });
    await t.run(async (ctx) => ctx.db.delete(p5));

    const report = await runFullAuditAndCollect(t);
    const types = new Set(report.issues.map((i) => i.issueType));

    const EXPECTED = ["unmapped_sku", "malformed_item", "stale_mapping", "duplicate_transaction", "orphan_item"];
    for (const expected of EXPECTED) {
      expect(types.has(expected)).toBe(true);
    }
  });
});

// Silence unused-import lint when api is referenced via internal.
void api;
