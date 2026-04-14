import { v } from "convex/values";
import { query, internalQuery } from "../../_generated/server";
import { requireRole } from "../../lib/auth";
import { isExternalSource } from "../../lib/externalSource";
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
    if (!isExternalSource(args.source)) return null;
    const source = args.source;
    const mapping = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) =>
        q
          .eq("source", source)
          .eq("externalProductCode", args.externalProductCode)
      )
      .unique();
    return mapping
      ? { menuProductId: mapping.menuProductId ?? null }
      : null;
  },
});

/**
 * Phase 79: Load all Shopee+TikTok externalProductMappings hydrated with
 * the linked menuProduct's name + price. Used by fetchOrders to build the
 * `mappingBySku` and `menuProductById` lookup maps once per sync run before
 * iterating per-order to emit externalRevenueItems.
 */
export const getShopeeAndTikTokMappingsWithProducts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const shopee = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "shopee"))
      .collect();
    const tiktok = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "tiktok"))
      .collect();
    const all = [...shopee, ...tiktok];
    const out: Array<{
      externalProductCode: string;
      source: string;
      menuProductId: string | null;
      menuProductName: string | null;
      menuProductPrice: number | null;
    }> = [];
    for (const m of all) {
      let name: string | null = null;
      let price: number | null = null;
      if (m.menuProductId) {
        const mp = await ctx.db.get(m.menuProductId);
        if (mp) {
          name = mp.name;
          price = mp.price;
        }
      }
      out.push({
        externalProductCode: m.externalProductCode,
        source: m.source,
        menuProductId: m.menuProductId ? String(m.menuProductId) : null,
        menuProductName: name,
        menuProductPrice: price,
      });
    }
    return out;
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
