"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { GOBIZ_CONFIG, type GoBizDashboardResponse } from "./config";
import {
  wibDateToUtcRange,
  buildDashboardHeaders,
  extractDashboardMetrics,
} from "./helpers";

type ActionCtx = {
  runQuery: (...args: any[]) => Promise<any>;
  runMutation: (...args: any[]) => Promise<any>;
};

/**
 * Resolve GoBiz API token: DB first, then env var fallback.
 */
async function resolveGoBizToken(ctx: ActionCtx): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const dbCred = await ctx.runQuery(
    internal.platformCredentials.queries.getTokenInternal,
    { platformId: "gobiz" }
  );

  return {
    accessToken: dbCred?.currentToken ?? process.env.GOBIZ_API_TOKEN ?? null,
    refreshToken: dbCred?.refreshToken ?? process.env.GOBIZ_REFRESH_TOKEN ?? null,
  };
}

/**
 * Attempt 3-method token refresh cascade.
 * 1. Cookie refresh: GET /micro-app/auth with refresh_token cookie
 * 2. Token rotate: POST /analytics-backend/api/auth/token/rotate
 * 3. API refresh: POST api.gobiz.co.id/auth/token/refresh
 *
 * On success: updates DB via updateToken mutation + returns new access token.
 * On failure: marks token expired, returns null.
 */
async function attemptTokenRefresh(
  ctx: ActionCtx,
  refreshToken: string,
  oldAccessToken: string | null
): Promise<string | null> {
  console.log("  Attempting GoBiz token refresh...");

  const cookies: Record<string, string> = {
    refresh_token: refreshToken,
    auth_method: "goid",
    language: "en",
  };

  if (oldAccessToken) {
    const token = oldAccessToken.startsWith("Bearer ")
      ? oldAccessToken.substring(7)
      : oldAccessToken;
    cookies.access_token = token;
  }

  const headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  };

  // Method 1: Cookie refresh
  try {
    const resp = await fetch(GOBIZ_CONFIG.tokenRefresh.microAppUrl, {
      method: "GET",
      headers: {
        ...headers,
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
      redirect: "manual",
    });

    // Check Set-Cookie headers for new tokens
    const setCookie = resp.headers.get("set-cookie") ?? "";
    const accessMatch = setCookie.match(/access_token=([^;]+)/);
    const refreshMatch = setCookie.match(/refresh_token=([^;]+)/);

    if (accessMatch) {
      const newAccessToken = `Bearer ${accessMatch[1]}`;
      const newRefreshToken = refreshMatch ? refreshMatch[1] : refreshToken;

      await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
        platformId: "gobiz",
        currentToken: newAccessToken,
        refreshToken: newRefreshToken,
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "success",
      });

      console.log("  Token refresh successful (cookie method)");
      return newAccessToken;
    }
  } catch (err) {
    console.log("  Cookie refresh failed:", err instanceof Error ? err.message : String(err));
  }

  // Method 2: Token rotate
  try {
    const resp = await fetch(GOBIZ_CONFIG.tokenRefresh.rotateUrl, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "origin": GOBIZ_CONFIG.portalBaseUrl,
        "referer": `${GOBIZ_CONFIG.portalBaseUrl}/analytics/sales-gofood`,
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
    });

    const setCookie = resp.headers.get("set-cookie") ?? "";
    const accessMatch = setCookie.match(/access_token=([^;]+)/);

    if (accessMatch) {
      const newAccessToken = `Bearer ${accessMatch[1]}`;

      await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
        platformId: "gobiz",
        currentToken: newAccessToken,
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "success",
      });

      console.log("  Token refresh successful (rotate method)");
      return newAccessToken;
    }
  } catch (err) {
    console.log("  Token rotate failed:", err instanceof Error ? err.message : String(err));
  }

  // Method 3: API refresh
  try {
    const resp = await fetch(GOBIZ_CONFIG.tokenRefresh.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": GOBIZ_CONFIG.portalBaseUrl,
        "user-agent": headers["user-agent"],
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.access_token) {
        const newAccessToken = `Bearer ${data.access_token}`;
        const newRefreshToken = data.refresh_token ?? refreshToken;

        await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
          platformId: "gobiz",
          currentToken: newAccessToken,
          refreshToken: newRefreshToken,
          lastRefreshAt: Date.now(),
          lastRefreshStatus: "success",
        });

        console.log("  Token refresh successful (API method)");
        return newAccessToken;
      }
    }
  } catch (err) {
    console.log("  API refresh failed:", err instanceof Error ? err.message : String(err));
  }

  // All methods failed
  console.log("  All token refresh methods failed");
  await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
    platformId: "gobiz",
    lastRefreshAt: Date.now(),
    lastRefreshStatus: "error",
    lastRefreshError: "All refresh methods failed (cookie, rotate, API)",
  });

  return null;
}

/**
 * Fetch dashboard data for a single day.
 * On 401: attempts token refresh and retries once.
 */
async function fetchDayDashboard(
  ctx: ActionCtx,
  dateStr: string,
  accessToken: string,
  refreshToken: string | null,
  retryOn401: boolean = true
): Promise<{ gross: number; net: number; commission: number; adBurn: number; promoBurn: number; transactionCount: number } | null> {
  const { from, to } = wibDateToUtcRange(dateStr);
  const headers = buildDashboardHeaders(accessToken, from, to);
  const url = `${GOBIZ_CONFIG.portalBaseUrl}/analytics-backend/api/datasources/proxy/${GOBIZ_CONFIG.dashboardApi.proxyId}/_msearch`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: "",
    });

    if (response.status === 401 && retryOn401 && refreshToken) {
      console.log(`  401 Unauthorized for ${dateStr}, attempting refresh...`);
      const newAccessToken = await attemptTokenRefresh(ctx, refreshToken, accessToken);

      if (newAccessToken) {
        console.log(`  Retrying ${dateStr} with new token...`);
        return await fetchDayDashboard(ctx, dateStr, newAccessToken, refreshToken, false);
      } else {
        throw new Error("Token refresh failed");
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as GoBizDashboardResponse;
    const metrics = extractDashboardMetrics(data);

    return metrics;
  } catch (error) {
    console.error(`  Error fetching ${dateStr}:`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Generate date strings for the sync range (WIB dates).
 */
function generateDateRange(daysBack: number): string[] {
  const dates: string[] = [];
  const now = new Date();

  for (let i = daysBack - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
    dates.push(dateStr);
  }

  return dates;
}

/**
 * Sync GoBiz (GoFood) revenue data using dashboard API.
 *
 * Flow:
 * 1. Resolve tokens (access + refresh)
 * 2. Calculate date range (WIB days)
 * 3. For each day: fetch 5 metrics from dashboard API
 * 4. On 401: attempt 3-method token refresh, retry once
 * 5. Save revenue records with all 5 metrics
 * 6. Update sync log
 */
export const syncGoBizRevenue = action({
  args: {
    daysBack: v.optional(v.number()),
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const daysBack = args.daysBack ?? GOBIZ_CONFIG.sync.defaultDaysBack;

    // Resolve tokens
    const { accessToken, refreshToken } = await resolveGoBizToken(ctx);
    if (!accessToken) {
      return {
        success: false,
        error: "GoBiz API token not found. Go to Settings > GoBiz > Configure to paste your token.",
        durationMs: Date.now() - startTime,
      };
    }

    // Create sync log
    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "gobiz",
        syncType: "manual",
        status: "started",
        triggeredBy: args.triggeredBy ?? "manual",
        timestamp: startTime,
      }
    );

    try {
      // Generate date range (WIB dates as YYYY-MM-DD strings)
      const dates = generateDateRange(daysBack);
      console.log(`Syncing ${dates.length} days: ${dates[0]} to ${dates[dates.length - 1]}`);

      let totalDays = 0;
      let totalGross = 0;
      let totalNet = 0;
      let totalTransactions = 0;

      // Fetch each day
      for (const dateStr of dates) {
        console.log(`  Fetching ${dateStr}...`);
        const metrics = await fetchDayDashboard(ctx, dateStr, accessToken, refreshToken);

        if (metrics) {
          // Save revenue record
          const { from, to } = wibDateToUtcRange(dateStr);
          await ctx.runMutation(internal.externalData.mutations.saveRevenue, {
            records: [
              {
                source: "gobiz" as const,
                periodStart: from,
                periodEnd: to,
                dataOrigin: "api_revenue" as const,
                confidence: "exact" as const,
                revenueGross: metrics.gross,
                revenueNet: metrics.net,
                commission: metrics.commission,
                adBurn: metrics.adBurn,
                promoBurn: metrics.promoBurn,
                transactionCount: metrics.transactionCount,
                syncLogId,
              },
            ],
          });

          totalDays++;
          totalGross += metrics.gross;
          totalNet += metrics.net;
          totalTransactions += metrics.transactionCount;

          console.log(
            `    OK - Gross: ${metrics.gross.toLocaleString()}, Net: ${metrics.net.toLocaleString()}, Commission: ${metrics.commission.toLocaleString()}`
          );
        }
      }

      // Update sync log
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "success",
        productsCount: totalTransactions,
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        syncLogId,
        daysProcessed: totalDays,
        totalGross,
        totalNet,
        totalTransactions,
        period: {
          from: dates[0],
          to: dates[dates.length - 1],
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "error",
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        syncLogId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  },
});
