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

import type { Doc } from "../_generated/dataModel";
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
export const runFullAudit = internalAction({
  args: { triggeredBy: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ reportId: string; issuesFound: number }> => {
    const reportId = await ctx.runMutation(
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
      const page = await ctx.runQuery(
        internal.productInventory.channelAudit.auditPageQuery,
        { paginationOpts: { numItems: 500, cursor } },
      );

      for (const entry of page.items) {
        totalScanned++;
        const { _revenueRow: revenue, ...item } = entry;

        // Orphan check first — if parent is missing we cannot build detail for other checks.
        if (!revenue) {
          issuesByType.orphan_item++;
          totalIssues++;
          await ctx.runMutation(
            internal.productInventory.channelAuditMutations.recordAuditIssues,
            {
              reportId,
              issues: [
                {
                  source: item.source,
                  itemId: item._id,
                  issueType: "orphan_item",
                  severity: "block",
                  detail: `Item revenueId ${item.revenueId} parent not found`,
                },
              ],
            },
          );
          continue;
        }

        // Cheap inline checks (unmapped_sku, malformed_item).
        const cheapIssues = detectAuditIssuesForItem(revenue, item);
        for (const issue of cheapIssues) {
          issuesByType[issue.issueType]++;
          totalIssues++;
        }
        if (cheapIssues.length > 0) {
          await ctx.runMutation(
            internal.productInventory.channelAuditMutations.recordAuditIssues,
            { reportId, issues: cheapIssues },
          );
        }

        // Expensive: stale_mapping.
        if (item.linkedMenuProductId) {
          const mp = await ctx.runQuery(
            internal.productInventory.channelAudit.getMenuProductStatusQuery,
            { menuProductId: item.linkedMenuProductId },
          );
          if (mp.missing || mp.inactive) {
            issuesByType.stale_mapping++;
            totalIssues++;
            await ctx.runMutation(
              internal.productInventory.channelAuditMutations.recordAuditIssues,
              {
                reportId,
                issues: [
                  {
                    source: item.source,
                    revenueId: revenue._id,
                    itemId: item._id,
                    issueType: "stale_mapping",
                    severity: "warn",
                    detail: mp.missing
                      ? `linkedMenuProductId ${item.linkedMenuProductId} not found (deleted)`
                      : `linkedMenuProductId ${item.linkedMenuProductId} marked inactive`,
                  },
                ],
              },
            );
          }
        }

        // Expensive: duplicate_transaction.
        if (item.externalItemId) {
          const externalRef = `${revenue.externalTransactionId ?? String(revenue._id)}${item.externalItemId}`;
          const dupes = await ctx.runQuery(
            internal.productInventory.channelAudit.findDuplicateTxQuery,
            { source: revenue.source, externalRef },
          );
          if (dupes.count > 1) {
            issuesByType.duplicate_transaction++;
            totalIssues++;
            await ctx.runMutation(
              internal.productInventory.channelAuditMutations.recordAuditIssues,
              {
                reportId,
                issues: [
                  {
                    source: revenue.source,
                    revenueId: revenue._id,
                    itemId: item._id,
                    issueType: "duplicate_transaction",
                    severity: "block",
                    detail: `${dupes.count} productInventoryTransactions rows for source=${revenue.source} externalRef=${externalRef}`,
                  },
                ],
              },
            );
          }
        }
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
    return { count: rows.length };
  },
});

/**
 * Read-only helper for per-source audit gate (consumed by 74.5.2 backfill logic, NOT UI).
 * UI-facing source-filtered lists live in channelAuditMutations.ts behind requireRole.
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
