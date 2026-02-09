import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import { requireRole } from "../lib/auth";

/**
 * Get credential status for a platform (admin-only).
 * Returns metadata only — never exposes the password.
 */
export const getCredentialStatus = query({
  args: {
    token: v.string(),
    platformId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const cred = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();

    if (!cred) {
      return {
        hasCredentials: false,
        hasToken: false,
        hasRefreshToken: false,
        email: null,
        tokenExpiresAt: null,
        lastRefreshAt: null,
        lastRefreshStatus: null,
        lastRefreshError: null,
      };
    }

    return {
      hasCredentials: true,
      hasToken: !!cred.currentToken,
      hasRefreshToken: !!cred.refreshToken,
      email: cred.email ?? null,
      tokenExpiresAt: cred.tokenExpiresAt ?? null,
      lastRefreshAt: cred.lastRefreshAt ?? null,
      lastRefreshStatus: cred.lastRefreshStatus ?? null,
      lastRefreshError: cred.lastRefreshError ?? null,
    };
  },
});

/**
 * Internal: Get current token for a platform.
 * Used by adapter to read token without auth checks.
 */
export const getTokenInternal = internalQuery({
  args: {
    platformId: v.string(),
  },
  handler: async (ctx, args) => {
    const cred = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();

    if (!cred || !cred.currentToken) {
      return null;
    }

    return { currentToken: cred.currentToken };
  },
});

/**
 * Internal: Get full credentials for a platform.
 * Used by the refresh action.
 */
export const getCredentialsInternal = internalQuery({
  args: {
    platformId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();
  },
});

/**
 * Internal: Validate that a session token belongs to an admin.
 * Used by actions that need auth checks.
 */
export const validateAdminToken = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return true;
  },
});
