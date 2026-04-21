/**
 * Phase 74.5.1: Channel-sale audit detection (R6).
 *
 * Two-tier split per D74.5.1-L4 / RESEARCH §Pitfall 5:
 *  - `detectAuditIssuesForItem` — PURE inline-safe cheap checks (no ctx, no DB).
 *      Emits: unmapped_sku, malformed_item.
 *  - `runFullAudit` — internalAction that scans entire externalRevenueItems via
 *      500-chunk pagination; emits all 5 issue types, opens + closes a report row.
 *      Expensive checks: stale_mapping, duplicate_transaction, orphan_item.
 *
 * All helper queries are `internalQuery` — invoked via ctx.runQuery(internal.*, ...).
 * No public `query()` exports here (UI-facing lists live in channelAuditMutations.ts
 * behind requireRole gates).
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { externalSource } from "../schema";

export type AuditIssueType =
  | "unmapped_sku"
  | "stale_mapping"
  | "malformed_item"
  | "duplicate_transaction"
  | "orphan_item";

export interface DetectedIssue {
  source: Doc<"externalRevenue">["source"];
  revenueId?: Doc<"externalRevenue">["_id"];
  itemId?: Doc<"externalRevenueItems">["_id"];
  issueType: AuditIssueType;
  severity: "warn" | "block";
  detail: string;
}

/**
 * Pure function — cheap, inline-safe audit detection.
 * Returns ONLY unmapped_sku + malformed_item (no DB calls).
 * Per D74.5.1-L4 / RESEARCH §Pitfall 5.
 */
export function detectAuditIssuesForItem(
  revenue: Doc<"externalRevenue">,
  item:
    | Doc<"externalRevenueItems">
    | {
        _id?: Doc<"externalRevenueItems">["_id"];
        linkedMenuProductId?: Doc<"externalRevenueItems">["linkedMenuProductId"];
        quantity: number;
        totalPrice: number;
        productName: string;
      },
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const itemId = "_id" in item ? item._id : undefined;

  if (item.linkedMenuProductId == null) {
    issues.push({
      source: revenue.source,
      revenueId: revenue._id,
      itemId,
      issueType: "unmapped_sku",
      severity: "warn",
      detail: `Item "${item.productName}" has no linkedMenuProductId`,
    });
  }

  if (item.quantity <= 0 || item.totalPrice < 0) {
    issues.push({
      source: revenue.source,
      revenueId: revenue._id,
      itemId,
      issueType: "malformed_item",
      severity: "block",
      detail: `Item "${item.productName}" has invalid quantity=${item.quantity} or totalPrice=${item.totalPrice}`,
    });
  }

  return issues;
}

/**
 * Full-DB audit scan. internalAction (not mutation) — may exceed mutation time limit.
 *
 * Opens a channelAuditReports row, iterates externalRevenueItems in 500-chunk pages,
 * detects all 5 issue types, records issues via recordAuditIssues, closes the report.
 */
// Type lifted to module scope per review N-1 (previously declared inside handler).
type AuditPage = {
  items: Array<Doc<"externalRevenueItems"> & { _revenueRow: Doc<"externalRevenue"> | null }>;
  isDone: boolean;
  continueCursor: string;
};

export const runFullAudit = internalAction({
  args: { triggeredBy: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ reportId: Id<"channelAuditReports">; issuesFound: number }> => {
    const reportId: Id<"channelAuditReports"> = await ctx.runMutation(
      internal.productInventory.channelAuditMutations.openAuditReport,
      { triggeredBy: args.triggeredBy },
    );

    const issuesByType: Record<AuditIssueType, number> = {
      unmapped_sku: 0,
      stale_mapping: 0,
      malformed_item: 0,
      duplicate_transaction: 0,
      orphan_item: 0,
    };
    let totalIssues = 0;
    let totalScanned = 0;
    let cursor: string | null = null;

    while (true) {
      const page: AuditPage = await ctx.runQuery(
        internal.productInventory.channelAudit.auditPageQuery,
        { paginationOpts: { numItems: 500, cursor } },
      );

      // Batch all issues for this page into a single recordAuditIssues call
      // at the end, rather than per-item (N² round-trips at 10K+ item scale).
      const pageIssues: DetectedIssue[] = [];

      for (const entry of page.items) {
        totalScanned++;
        const { _revenueRow: revenue, ...item } = entry;

        // Orphan check first — if parent is missing we cannot build detail
        // for other checks. Using `item.source` here is reliable because
        // `externalRevenueItems.source` is populated at insert time from the
        // parent's source (see saveRevenueItemsImpl) and is therefore known
        // even when the parent row has since been deleted (review M-1).
        if (!revenue) {
          issuesByType.orphan_item++;
          totalIssues++;
          pageIssues.push({
            source: item.source,
            itemId: item._id,
            issueType: "orphan_item",
            severity: "block",
            detail: `Item revenueId ${item.revenueId} parent not found`,
          });
          continue;
        }

        // Cheap inline checks (unmapped_sku, malformed_item).
        const cheapIssues = detectAuditIssuesForItem(revenue, item);
        for (const issue of cheapIssues) {
          issuesByType[issue.issueType]++;
          totalIssues++;
          pageIssues.push(issue);
        }

        // Expensive checks (stale_mapping + duplicate_transaction) run in
        // PARALLEL — independent reads, no shared mutable state between them.
        const externalRef = item.externalItemId
          ? `${revenue.externalTransactionId ?? String(revenue._id)}${item.externalItemId}`
          : null;
        const [mp, dupes] = await Promise.all([
          item.linkedMenuProductId
            ? ctx.runQuery(
                internal.productInventory.channelAudit.getMenuProductStatusQuery,
                { menuProductId: item.linkedMenuProductId },
              )
            : null,
          externalRef !== null
            ? ctx.runQuery(
                internal.productInventory.channelAudit.findDuplicateTxQuery,
                { source: revenue.source, externalRef },
              )
            : null,
        ]);

        // stale_mapping
        if (mp && (mp.missing || mp.inactive)) {
          issuesByType.stale_mapping++;
          totalIssues++;
          pageIssues.push({
            source: item.source,
            revenueId: revenue._id,
            itemId: item._id,
            issueType: "stale_mapping",
            severity: "warn",
            detail: mp.missing
              ? `linkedMenuProductId ${item.linkedMenuProductId} not found (deleted)`
              : `linkedMenuProductId ${item.linkedMenuProductId} marked inactive`,
          });
        }

        // duplicate_transaction — hasDuplicate means same (source,externalRef)
        // seen more than once with SAME menuProductId. Substitution rows with
        // different menuProductIds don't collide per findDuplicateTxQuery.
        if (dupes && dupes.hasDuplicate && externalRef !== null) {
          issuesByType.duplicate_transaction++;
          totalIssues++;
          pageIssues.push({
            source: revenue.source,
            revenueId: revenue._id,
            itemId: item._id,
            issueType: "duplicate_transaction",
            severity: "block",
            detail: `${dupes.count} productInventoryTransactions rows (same menuProductId collision) for source=${revenue.source} externalRef=${externalRef}`,
          });
        }
      }

      // Flush the whole page's issues in ONE round-trip.
      if (pageIssues.length > 0) {
        await ctx.runMutation(
          internal.productInventory.channelAuditMutations.recordAuditIssues,
          { reportId, issues: pageIssues },
        );
      }

      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    await ctx.runMutation(
      internal.productInventory.channelAuditMutations.closeAuditReport,
      {
        reportId,
        totalItemsScanned: totalScanned,
        issuesFound: totalIssues,
        issuesByType,
      },
    );

    return { reportId, issuesFound: totalIssues };
  },
});

// ============================================================================
// Internal helper queries used by runFullAudit.
// NOTE: All are internalQuery (not query) — invoked via ctx.runQuery(internal.*).
// Uses Convex paginate() (not post-scan .filter()) per CLAUDE.md + RESEARCH.
// ============================================================================

export const auditPageQuery = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("externalRevenueItems")
      .order("asc")
      .paginate(args.paginationOpts);

    const revenueIds = Array.from(new Set(page.page.map((i) => i.revenueId)));
    const revenues = await Promise.all(revenueIds.map((id) => ctx.db.get(id)));
    const revMap = new Map(
      revenues.filter((r): r is Doc<"externalRevenue"> => r !== null).map((r) => [r._id, r]),
    );

    const enriched = page.page.map((it) => ({
      ...it,
      _revenueRow: revMap.get(it.revenueId) ?? null,
    }));

    return {
      items: enriched,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const getMenuProductStatusQuery = internalQuery({
  args: { menuProductId: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const mp = await ctx.db.get(args.menuProductId);
    if (!mp) return { missing: true, inactive: false };
    return { missing: false, inactive: mp.isActive === false };
  },
});

export const findDuplicateTxQuery = internalQuery({
  args: { source: externalSource, externalRef: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("productInventoryTransactions")
      .withIndex("by_source_externalRef", (q) =>
        q.eq("source", args.source).eq("externalRef", args.externalRef),
      )
      .collect();
    // Legit Phase 78 substitution writes TWO ledger rows with the same
    // externalRef — one for the main product, one for the substitute source
    // product — distinguished by menuProductId. True duplicate_transaction =
    // same (source, externalRef, menuProductId) seen more than once.
    // Without this distinction, every substitution sale false-positives as
    // a duplicate and blocks backfills in 74.5.2.
    const uniqueProducts = new Set(rows.map((r) => r.menuProductId));
    const hasDuplicate = rows.length > uniqueProducts.size;
    return { count: rows.length, hasDuplicate };
  },
});

/**
 * Read-only helper for per-source audit gate (consumed by 74.5.2 backfill
 * logic, NOT UI).
 *
 * NOTE (do not remove in dead-code sweeps — review R-2): This export appears
 * unused in 74.5.1 diff because its only caller lands in 74.5.2's backfill
 * gate (per SPEC §Backfill Preconditions). It is the authoritative per-source
 * pre-cutover check: before flipping a flag ON, the backfill logic inspects
 * open issues for that source and aborts if any `severity: "block"` rows
 * exist. UI-facing source-filtered lists live in channelAuditMutations.ts
 * behind requireRole.
 */
export const listOpenIssuesBySource = internalQuery({
  args: { source: externalSource },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("channelAuditIssues")
      .withIndex("by_source_open", (q) =>
        q.eq("source", args.source).eq("resolvedAt", undefined),
      )
      .collect();
    return rows;
  },
});

// ============================================================================
// Test-only helper — direct-handler invocation for convex-test
//
// Plan 74.5.2-01 Task 1: the production `runFullAudit` internalAction fails
// module resolution under convex-test's `t.action(internal.*)` path resolver
// (see node_modules/convex-test/dist/index.js:1062 — actionFromPath throws
// `Could not find module for: "productInventory/channelAudit"`). The known-
// green pattern in `channelSale.test.ts` and the entire `tests/convex/` suite
// is direct-handler invocation inside `t.run(async (ctx) => ...)` — no
// `t.action` dependency.
//
// This helper replicates `runFullAudit`'s handler body verbatim but against a
// single MutationCtx (no cross-function ctx.runQuery/runMutation hops). Tests
// call `await t.run(async (ctx) => await _runFullAuditForTest(ctx, { ... }))`.
// Production behavior is unchanged — `runFullAudit` action continues to call
// the same internalQuery/internalMutation helpers it always has.
//
// DO NOT call this from production code. Exported only for test access.
// ============================================================================
export const _runFullAuditForTest = async (
  ctx: MutationCtx,
  args: { triggeredBy: string },
): Promise<{ reportId: Id<"channelAuditReports">; issuesFound: number }> => {
  // Mirror openAuditReport
  const reportId = await ctx.db.insert("channelAuditReports", {
    status: "pending",
    totalItemsScanned: 0,
    issuesFound: 0,
    issuesByType: {
      unmapped_sku: 0,
      stale_mapping: 0,
      malformed_item: 0,
      duplicate_transaction: 0,
      orphan_item: 0,
    },
    startedAt: Date.now(),
    triggeredBy: args.triggeredBy,
  });

  const issuesByType: Record<AuditIssueType, number> = {
    unmapped_sku: 0,
    stale_mapping: 0,
    malformed_item: 0,
    duplicate_transaction: 0,
    orphan_item: 0,
  };
  let totalIssues = 0;
  let totalScanned = 0;

  // Single-page scan — tests seed small datasets (<500 items), so paginate()
  // is unnecessary overhead. Production path still paginates via auditPageQuery.
  const allItems = await ctx.db.query("externalRevenueItems").collect();

  // Pre-fetch revenue parents (join equivalent to auditPageQuery's revMap).
  const revenueIds = Array.from(new Set(allItems.map((i) => i.revenueId)));
  const revenues = await Promise.all(revenueIds.map((id) => ctx.db.get(id)));
  const revMap = new Map(
    revenues.filter((r): r is Doc<"externalRevenue"> => r !== null).map((r) => [r._id, r]),
  );

  const pageIssues: DetectedIssue[] = [];

  for (const item of allItems) {
    totalScanned++;
    const revenue = revMap.get(item.revenueId) ?? null;

    // Orphan check first — parent deleted.
    if (!revenue) {
      issuesByType.orphan_item++;
      totalIssues++;
      pageIssues.push({
        source: item.source,
        itemId: item._id,
        issueType: "orphan_item",
        severity: "block",
        detail: `Item revenueId ${item.revenueId} parent not found`,
      });
      continue;
    }

    // Cheap inline checks (unmapped_sku, malformed_item).
    const cheapIssues = detectAuditIssuesForItem(revenue, item);
    for (const issue of cheapIssues) {
      issuesByType[issue.issueType]++;
      totalIssues++;
      pageIssues.push(issue);
    }

    // Expensive checks — mirror getMenuProductStatusQuery + findDuplicateTxQuery.
    const externalRef = item.externalItemId
      ? `${revenue.externalTransactionId ?? String(revenue._id)}${item.externalItemId}`
      : null;

    // stale_mapping — getMenuProductStatusQuery equivalent.
    if (item.linkedMenuProductId) {
      const mp = await ctx.db.get(item.linkedMenuProductId);
      const missing = !mp;
      const inactive = mp ? mp.isActive === false : false;
      if (missing || inactive) {
        issuesByType.stale_mapping++;
        totalIssues++;
        pageIssues.push({
          source: item.source,
          revenueId: revenue._id,
          itemId: item._id,
          issueType: "stale_mapping",
          severity: "warn",
          detail: missing
            ? `linkedMenuProductId ${item.linkedMenuProductId} not found (deleted)`
            : `linkedMenuProductId ${item.linkedMenuProductId} marked inactive`,
        });
      }
    }

    // duplicate_transaction — findDuplicateTxQuery equivalent.
    if (externalRef !== null) {
      const rows = await ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_source_externalRef", (q) =>
          q.eq("source", revenue.source).eq("externalRef", externalRef),
        )
        .collect();
      const uniqueProducts = new Set(rows.map((r) => r.menuProductId));
      const hasDuplicate = rows.length > uniqueProducts.size;
      if (hasDuplicate) {
        issuesByType.duplicate_transaction++;
        totalIssues++;
        pageIssues.push({
          source: revenue.source,
          revenueId: revenue._id,
          itemId: item._id,
          issueType: "duplicate_transaction",
          severity: "block",
          detail: `${rows.length} productInventoryTransactions rows (same menuProductId collision) for source=${revenue.source} externalRef=${externalRef}`,
        });
      }
    }
  }

  // recordAuditIssues equivalent — inline dedup on (itemId, issueType).
  for (const issue of pageIssues) {
    if (issue.itemId) {
      const existing = await ctx.db
        .query("channelAuditIssues")
        .withIndex("by_item", (q) => q.eq("itemId", issue.itemId))
        .collect();
      const alreadyOpen = existing.some(
        (e) => e.issueType === issue.issueType && e.resolvedAt === undefined,
      );
      if (alreadyOpen) continue;
    }
    await ctx.db.insert("channelAuditIssues", {
      reportId,
      source: issue.source,
      itemId: issue.itemId,
      revenueId: issue.revenueId,
      issueType: issue.issueType,
      severity: issue.severity,
      detail: issue.detail,
      detectedAt: Date.now(),
    });
  }

  // closeAuditReport equivalent.
  await ctx.db.patch(reportId, {
    status: "resolved",
    totalItemsScanned: totalScanned,
    issuesFound: totalIssues,
    issuesByType,
    completedAt: Date.now(),
  });

  return { reportId, issuesFound: totalIssues };
};
