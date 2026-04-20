/**
 * Phase 74.5.1: Channel-sale audit report + issue mutations.
 *
 * Internal mutations (called by runFullAudit action):
 *   - openAuditReport / closeAuditReport
 *   - recordAuditIssues
 *
 * Admin-gated mutations (consumed by ChannelAuditWorkbench):
 *   - resolveAuditIssue / dismissAuditIssue
 *   - triggerFullAudit (schedules runFullAudit)
 *
 * Admin-gated queries:
 *   - listAuditReports / listAuditIssues
 *
 * All admin-facing entry points go through requireRole(ctx, args.token, ["admin"]).
 */

import { internalMutation, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { externalSource } from "../schema";
import { requireRole } from "../lib/auth";

const issueTypeValidator = v.union(
  v.literal("unmapped_sku"),
  v.literal("stale_mapping"),
  v.literal("malformed_item"),
  v.literal("duplicate_transaction"),
  v.literal("orphan_item"),
);

const severityValidator = v.union(v.literal("warn"), v.literal("block"));

// ============================================================================
// Internal mutations (called by runFullAudit)
// ============================================================================

export const openAuditReport = internalMutation({
  args: { triggeredBy: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("channelAuditReports", {
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
  },
});

export const closeAuditReport = internalMutation({
  args: {
    reportId: v.id("channelAuditReports"),
    totalItemsScanned: v.number(),
    issuesFound: v.number(),
    issuesByType: v.object({
      unmapped_sku: v.number(),
      stale_mapping: v.number(),
      malformed_item: v.number(),
      duplicate_transaction: v.number(),
      orphan_item: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      // "resolved" = run completed. Individual issues may still be open/unresolved.
      status: "resolved",
      totalItemsScanned: args.totalItemsScanned,
      issuesFound: args.issuesFound,
      issuesByType: args.issuesByType,
      completedAt: Date.now(),
    });
  },
});

export const recordAuditIssues = internalMutation({
  args: {
    reportId: v.optional(v.id("channelAuditReports")),
    issues: v.array(
      v.object({
        source: externalSource,
        itemId: v.optional(v.id("externalRevenueItems")),
        revenueId: v.optional(v.id("externalRevenue")),
        issueType: issueTypeValidator,
        severity: severityValidator,
        detail: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const ids: string[] = [];
    for (const issue of args.issues) {
      const id = await ctx.db.insert("channelAuditIssues", {
        reportId: args.reportId,
        source: issue.source,
        itemId: issue.itemId,
        revenueId: issue.revenueId,
        issueType: issue.issueType,
        severity: issue.severity,
        detail: issue.detail,
        detectedAt: Date.now(),
      });
      ids.push(id);
    }
    return { ids };
  },
});

// ============================================================================
// Admin-gated mutations (ChannelAuditWorkbench)
// ============================================================================

export const resolveAuditIssue = mutation({
  args: {
    token: v.string(),
    issueId: v.id("channelAuditIssues"),
    resolution: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Audit issue not found");
    if (issue.resolvedAt) throw new Error("Audit issue already resolved");
    await ctx.db.patch(args.issueId, {
      resolvedAt: Date.now(),
      resolvedBy: user.name,
      resolution: args.resolution,
    });
    return { issueId: args.issueId };
  },
});

export const dismissAuditIssue = mutation({
  args: {
    token: v.string(),
    issueId: v.id("channelAuditIssues"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Audit issue not found");
    await ctx.db.patch(args.issueId, {
      resolvedAt: Date.now(),
      resolvedBy: user.name,
      resolution: `Dismissed — ${args.reason}`,
    });
    return { issueId: args.issueId };
  },
});

/**
 * Trigger the full-DB audit scan. Admin-only. Uses STATIC internal import
 * per CLAUDE.md Pitfall #8 — no dynamic import().
 */
export const triggerFullAudit = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    await ctx.scheduler.runAfter(
      0,
      internal.productInventory.channelAudit.runFullAudit,
      { triggeredBy: user.name },
    );
    return { scheduled: true };
  },
});

// ============================================================================
// Admin-gated queries (UI read)
// ============================================================================

export const listAuditReports = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return await ctx.db
      .query("channelAuditReports")
      .withIndex("by_startedAt")
      .order("desc")
      .take(args.limit ?? 10);
  },
});

export const listAuditIssues = query({
  args: {
    token: v.string(),
    issueType: v.optional(issueTypeValidator),
    source: v.optional(externalSource),
    includeResolved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    let rows;
    if (args.issueType) {
      rows = await ctx.db
        .query("channelAuditIssues")
        .withIndex("by_type_open", (q) => q.eq("issueType", args.issueType!))
        .collect();
    } else if (args.source) {
      rows = await ctx.db
        .query("channelAuditIssues")
        .withIndex("by_source_open", (q) => q.eq("source", args.source!))
        .collect();
    } else {
      rows = await ctx.db.query("channelAuditIssues").order("desc").take(200);
    }

    if (!args.includeResolved) {
      rows = rows.filter((r) => r.resolvedAt === undefined);
    }
    return rows;
  },
});
