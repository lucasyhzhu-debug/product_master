import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import { requireRole } from "../lib/auth";
import {
  PLATFORMS,
  PLATFORM_IDS,
  type PlatformId,
  type AuthStrategy,
  type PlatformCategory,
} from "../integrations/registry";

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

    const tokenExpiresAt = cred.tokenExpiresAt ?? null;
    const tokenExpiresIn = tokenExpiresAt ? tokenExpiresAt - Date.now() : null;

    return {
      hasCredentials: true,
      hasToken: !!cred.currentToken,
      hasRefreshToken: !!cred.refreshToken,
      email: cred.email ?? null,
      tokenExpiresAt,
      tokenExpiresIn,
      lastRefreshAt: cred.lastRefreshAt ?? null,
      lastRefreshStatus: cred.lastRefreshStatus ?? null,
      lastRefreshError: cred.lastRefreshError ?? null,
    };
  },
});

/**
 * Get credential health status for managers.
 * Returns a subset of data (no token details) -- just health indicators.
 * Accessible to managers and admins.
 */
export const getCredentialStatusForManagers = query({
  args: {
    token: v.string(),
    platformId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    const cred = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();

    if (!cred) {
      return {
        hasToken: false,
        lastRefreshStatus: null,
        lastRefreshAt: null,
        isHealthy: false,
      };
    }

    const isHealthy = !!cred.currentToken &&
      cred.lastRefreshStatus !== "error" &&
      (!cred.tokenExpiresAt || cred.tokenExpiresAt > Date.now());

    return {
      hasToken: !!cred.currentToken,
      lastRefreshStatus: cred.lastRefreshStatus ?? null,
      lastRefreshAt: cred.lastRefreshAt ?? null,
      isHealthy,
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

// ============================================
// REGISTRY-DRIVEN HEALTH STATUS
// Phase 26: Single query for all platform health.
// ============================================

/**
 * A single entry from the externalSyncLogs table.
 * Included in PlatformHealthStatus for last_sync platforms (k3mart, gobiz).
 */
export type SyncLogEntry = {
  timestamp: number;
  status: "started" | "success" | "error";
  syncType: "manual" | "cron";
  productsCount?: number;
  durationMs?: number;
  errorMessage?: string;
};

/**
 * Health status shape for a single platform.
 * Consumed by Plan 03's IntegrationHealthCard component.
 * Replaces the old syncHealth + credentialStatus dual-prop pattern.
 */
export type PlatformHealthStatus = {
  platformId: PlatformId;
  platformName: string;       // from registry
  authStrategy: AuthStrategy; // from registry — determines action button in UI
  category: PlatformCategory; // from registry — for icon selection
  status: "green" | "yellow" | "red" | "disconnected";
  label: string;              // e.g., "Connected", "7 days remaining", "Not configured"
  lastActivity: number | null; // last sync timestamp (ms) or null
  daysRemaining: number | null; // for token_expiry platforms, null otherwise
  hasExpiry: boolean;          // from healthConfig
  reconnectSteps: string[];    // from registry — for help dialogs
  syncHistory: SyncLogEntry[]; // last 5 sync logs; empty for non-last_sync platforms
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get health status for ALL platforms in a single registry-driven query.
 * Requires manager or admin auth — exposes credential metadata.
 * Returns PlatformHealthStatus[] for use in IntegrationHealthCard (Plan 03).
 */
export const getHealthStatusAll = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<PlatformHealthStatus[]> => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    const now = Date.now();
    const results: PlatformHealthStatus[] = [];

    for (const platformId of PLATFORM_IDS) {
      const meta = PLATFORMS[platformId];
      const { healthConfig } = meta;

      let status: PlatformHealthStatus["status"] = "disconnected";
      let label = "Not configured";
      let lastActivity: number | null = null;
      let daysRemaining: number | null = null;
      let syncHistory: SyncLogEntry[] = [];

      if (healthConfig.healthCheckType === "always_green") {
        // Internal, consignment, grabfood (once creds exist) — always connected
        if (platformId === "grabfood") {
          // GrabFood: check if client credentials are configured
          const cred = await ctx.db
            .query("platformCredentials")
            .withIndex("by_platform", (q) => q.eq("platformId", platformId))
            .first();

          if (cred && cred.email) {
            // email field stores client_id for GrabFood
            status = "green";
            label = "Connected";
            lastActivity = cred.lastRefreshAt ?? null;
          } else {
            status = "disconnected";
            label = "Client credentials not configured";
          }
        } else {
          // Internal, consignment — always green (no external credentials needed)
          status = "green";
          label = "Connected";
        }
      } else if (healthConfig.healthCheckType === "last_sync") {
        // k3mart, gobiz — health determined by recency of last successful sync
        const lastSyncLog = await ctx.db
          .query("externalSyncLogs")
          .withIndex("by_source", (q) => q.eq("source", platformId))
          .order("desc")
          .first();

        // Also check credential record for token refresh failures
        const cred = await ctx.db
          .query("platformCredentials")
          .withIndex("by_platform", (q) => q.eq("platformId", platformId))
          .first();

        const tokenRefreshFailed = cred?.lastRefreshStatus === "error";

        if (!lastSyncLog) {
          status = "disconnected";
          label = "Never synced";
        } else {
          lastActivity = lastSyncLog.timestamp;
          const ageMs = now - lastSyncLog.timestamp;
          const ageDays = ageMs / MS_PER_DAY;

          if (ageDays <= 2) {
            // Recent sync — but warn if token refresh has failed
            if (tokenRefreshFailed) {
              status = "yellow";
              label = "Token refresh failed";
            } else {
              status = "green";
              label = "Connected";
            }
          } else if (ageDays <= 7) {
            status = "yellow";
            const daysAgo = Math.round(ageDays);
            label = `Last synced ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
          } else {
            status = "red";
            const daysAgo = Math.round(ageDays);
            label = `Last synced ${daysAgo} days ago`;
          }
        }

        // Fetch last 5 sync logs for this platform (for expandable history in UI)
        const recentLogs = await ctx.db
          .query("externalSyncLogs")
          .withIndex("by_source", (q) => q.eq("source", platformId))
          .order("desc")
          .take(5);

        syncHistory = recentLogs.map((log) => ({
          timestamp: log.timestamp,
          status: log.status,
          syncType: log.syncType,
          productsCount: log.productsCount,
          durationMs: log.durationMs,
          errorMessage: log.errorMessage,
        }));
      } else if (healthConfig.healthCheckType === "token_expiry") {
        // bigseller — health determined by token expiry
        const cred = await ctx.db
          .query("platformCredentials")
          .withIndex("by_platform", (q) => q.eq("platformId", platformId))
          .first();

        if (!cred || !cred.currentToken) {
          status = "disconnected";
          label = "Not configured";
        } else if (!cred.tokenExpiresAt) {
          // Token exists but no expiry info — treat as connected
          status = "green";
          label = "Connected";
          lastActivity = cred.lastRefreshAt ?? null;
        } else {
          const msRemaining = cred.tokenExpiresAt - now;
          daysRemaining = msRemaining / MS_PER_DAY;
          lastActivity = cred.lastRefreshAt ?? null;

          if (daysRemaining <= 0) {
            status = "red";
            label = "Token expired";
          } else if (daysRemaining < healthConfig.redThresholdDays) {
            status = "red";
            const days = Math.ceil(daysRemaining);
            label = `${days} day${days === 1 ? "" : "s"} remaining`;
          } else if (daysRemaining < healthConfig.yellowThresholdDays) {
            status = "yellow";
            const days = Math.ceil(daysRemaining);
            label = `${days} day${days === 1 ? "" : "s"} remaining`;
          } else {
            status = "green";
            const days = Math.ceil(daysRemaining);
            label = `${days} day${days === 1 ? "" : "s"} remaining`;
          }
        }
      }

      results.push({
        platformId,
        platformName: meta.name,
        authStrategy: meta.authStrategy,
        category: meta.category,
        status,
        label,
        lastActivity,
        daysRemaining,
        hasExpiry: healthConfig.hasExpiry,
        reconnectSteps: meta.reconnectSteps,
        syncHistory,
      });
    }

    return results;
  },
});
