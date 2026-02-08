import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { requireRole } from "../lib/auth";

/**
 * Save or update platform credentials (admin-only).
 * Upserts: creates if not found, updates if exists.
 */
export const saveCredentials = mutation({
  args: {
    token: v.string(),
    platformId: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    const existing = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        password: args.password,
        updatedBy: user.name,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("platformCredentials", {
      platformId: args.platformId,
      email: args.email,
      password: args.password,
      updatedBy: user.name,
      updatedAt: now,
    });
  },
});

/**
 * Internal: Update token after refresh.
 * Called by the refresh action after successful/failed login.
 */
export const updateToken = internalMutation({
  args: {
    platformId: v.string(),
    currentToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastRefreshAt: v.number(),
    lastRefreshStatus: v.union(v.literal("success"), v.literal("error")),
    lastRefreshError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cred = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();

    if (!cred) {
      throw new Error(`No credentials found for platform: ${args.platformId}`);
    }

    await ctx.db.patch(cred._id, {
      currentToken: args.currentToken ?? cred.currentToken,
      tokenExpiresAt: args.tokenExpiresAt,
      lastRefreshAt: args.lastRefreshAt,
      lastRefreshStatus: args.lastRefreshStatus,
      lastRefreshError: args.lastRefreshError,
      updatedAt: Date.now(),
    });
  },
});
