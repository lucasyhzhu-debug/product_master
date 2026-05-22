import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { requireRole } from "../lib/auth";

// Default K3Mart credentials for auto-seeding
const K3MART_DEFAULTS = {
  email: "malostudio.id@gmail.com",
  password: "12345678",
} as const;

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
    lastRefreshStatus: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("auto-refreshed-from-response"),
    ),
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
      // I4 (quad-review): preserve the stored expiry when the caller does not
      // provide one. handleAuthFailure calls updateToken WITHOUT tokenExpiresAt;
      // unconditionally patching `args.tokenExpiresAt` (undefined) erased the
      // stored expiry and silently nulled the D-04 freshness banner. The
      // auto-refresh path passes a fresh tokenExpiresAt, so `??` keeps the new
      // value there.
      tokenExpiresAt: args.tokenExpiresAt ?? cred.tokenExpiresAt,
      lastRefreshAt: args.lastRefreshAt,
      lastRefreshStatus: args.lastRefreshStatus,
      lastRefreshError: args.lastRefreshError,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Save a bearer token directly.
 * Called by actions (GoBiz password grant, BigSeller paste flow) via internal.* path.
 * Accepts optional tokenExpiresAt — when provided, uses it instead of 6h estimate.
 */
export const saveDirectToken = internalMutation({
  args: {
    platformId: v.string(),
    bearerToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();

    const now = Date.now();
    // Use provided expiry if available; fall back to 6h conservative estimate
    const tokenExpiry = args.tokenExpiresAt ?? (now + 6 * 60 * 60 * 1000);

    const data = {
      currentToken: args.bearerToken,
      tokenExpiresAt: tokenExpiry,
      refreshToken: args.refreshToken,
      lastRefreshAt: now,
      lastRefreshStatus: "success" as const,
      lastRefreshError: undefined,
      updatedBy: "system",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }

    return await ctx.db.insert("platformCredentials", {
      platformId: args.platformId,
      ...data,
    });
  },
});

/**
 * Public wrapper: Save a pasted bearer token directly (admin-only).
 * Used by frontend (GoBizTokenDialog) for manual token paste flow.
 * Delegates to internal saveDirectToken after admin auth check.
 */
export const saveDirectTokenPublic = mutation({
  args: {
    token: v.string(),
    platformId: v.string(),
    bearerToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    const existing = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();

    const now = Date.now();
    // Use provided expiry if available; fall back to 6h conservative estimate
    const tokenExpiry = args.tokenExpiresAt ?? (now + 6 * 60 * 60 * 1000);

    const data = {
      currentToken: args.bearerToken,
      tokenExpiresAt: tokenExpiry,
      refreshToken: args.refreshToken,
      lastRefreshAt: now,
      lastRefreshStatus: "success" as const,
      lastRefreshError: undefined,
      updatedBy: user.name,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }

    return await ctx.db.insert("platformCredentials", {
      platformId: args.platformId,
      ...data,
    });
  },
});

/**
 * Save or update HMAC secret for a platform (admin-only).
 * Used to store the GrabFood webhook HMAC signing secret.
 */
export const saveHmacSecret = mutation({
  args: {
    token: v.string(),
    platformId: v.string(),
    hmacSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    const existing = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        hmacSecret: args.hmacSecret,
        updatedBy: user.name,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("platformCredentials", {
      platformId: args.platformId,
      hmacSecret: args.hmacSecret,
      updatedBy: user.name,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: Seed default credentials for a platform.
 * Used by K3Mart auto-seed when no credentials exist.
 */
export const seedDefaultCredentials = internalMutation({
  args: {
    platformId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();

    if (existing) return existing._id;

    if (args.platformId === "k3mart") {
      return await ctx.db.insert("platformCredentials", {
        platformId: args.platformId,
        email: K3MART_DEFAULTS.email,
        password: K3MART_DEFAULTS.password,
        updatedBy: "system",
        updatedAt: Date.now(),
      });
    }

    throw new Error(`No default credentials defined for platform: ${args.platformId}`);
  },
});
