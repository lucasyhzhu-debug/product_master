import { v } from "convex/values";
import { query, internalQuery } from "../../_generated/server";
import { requireRole } from "../../lib/auth";
import { BIGSELLER_MAX_POLLS } from "./config";

// ─── Internal Queries (used by sync action) ──────────────────────────────────

/**
 * Get current sync state (internal -- no auth required).
 * Used by startSync to check if sync is already in progress.
 */
export const getSyncStateInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("bigsellerSyncState").first();
  },
});

/**
 * Get the end date of the last successful bigseller sync.
 * Used for incremental sync date calculation.
 */
export const getLastSuccessfulSyncDate = internalQuery({
  args: {},
  handler: async (ctx) => {
    const lastLog = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "bigseller"))
      .order("desc")
      .first();

    if (!lastLog || lastLog.status !== "success") return null;

    // Get the sync state to extract the endDate of the last successful sync
    const syncState = await ctx.db.query("bigsellerSyncState").first();
    if (syncState && syncState.stage === "complete") {
      return syncState.endDate;
    }

    // Fallback: use sync log timestamp to derive a date
    const date = new Date(lastLog.timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },
});

/**
 * Check if a product mapping exists and has a linked menu product.
 * Used by fetchOrders to count unmapped SKUs.
 */
export const checkProductMapping = internalQuery({
  args: {
    source: v.string(),
    externalProductCode: v.string(),
  },
  handler: async (ctx, args) => {
    const mapping = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) =>
        q
          .eq("source", args.source as any)
          .eq("externalProductCode", args.externalProductCode)
      )
      .unique();
    return mapping
      ? { menuProductId: mapping.menuProductId ?? null }
      : null;
  },
});

/**
 * Get an externalRevenue document by ID.
 * Used by fetchOrders to extract externalTransactionId for revenue-to-order linking.
 */
export const getRevenueById = internalQuery({
  args: {
    revenueId: v.id("externalRevenue"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.revenueId);
  },
});

// ─── Public Queries (auth-protected, for frontend) ───────────────────────────

/**
 * Get reactive sync state for frontend progress display.
 * Returns the singleton bigsellerSyncState document or a default idle state.
 */
export const getSyncState = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const state = await ctx.db.query("bigsellerSyncState").first();
    if (!state) {
      return {
        stage: "idle" as const,
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: 0,
        startDate: "",
        endDate: "",
        startedAt: 0,
      };
    }
    return state;
  },
});
