"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { K3MART_CONFIG } from "../integrations/k3mart/config";

/**
 * Decode a JWT payload without verification (we validate by test-fetching instead).
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  // Base64url -> base64 -> decode
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const json = atob(padded);
  return JSON.parse(json);
}

type ActionCtx = {
  runQuery: (...args: any[]) => Promise<any>;
  runMutation: (...args: any[]) => Promise<any>;
};

/**
 * Core refresh logic shared by public action and cron.
 */
async function performK3MartRefresh(
  ctx: ActionCtx
): Promise<{ success: boolean; tokenExpiresAt?: number; error?: string }> {
  let cred = await ctx.runQuery(
    internal.platformCredentials.queries.getCredentialsInternal,
    { platformId: "k3mart" }
  );

  if (!cred) {
    // Auto-seed default K3Mart credentials
    await ctx.runMutation(
      internal.platformCredentials.mutations.seedDefaultCredentials,
      { platformId: "k3mart" }
    );
    cred = await ctx.runQuery(
      internal.platformCredentials.queries.getCredentialsInternal,
      { platformId: "k3mart" }
    );
  }

  if (!cred) {
    return { success: false, error: "Failed to initialize K3Mart credentials." };
  }

  try {
    // Login to K3Mart via consapi backend
    const loginUrl = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.login}`;
    const loginResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...K3MART_CONFIG.headers,
      },
      body: JSON.stringify({
        email: cred.email,
        password: cred.password,
      }),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text().catch(() => "Unknown error");
      throw new Error(`Login failed (${loginResponse.status}): ${errorText}`);
    }

    // Guard against non-JSON responses (API down, Cloudflare challenge)
    const contentType = loginResponse.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const bodyPreview = await loginResponse.text().catch(() => "");
      throw new Error(
        `K3Mart returned non-JSON response (${contentType || "no content-type"}, ` +
        `status ${loginResponse.status}). The API may be temporarily unavailable. ` +
        `Preview: ${bodyPreview.substring(0, 150)}`
      );
    }

    let loginData: Record<string, unknown>;
    try {
      loginData = await loginResponse.json() as Record<string, unknown>;
    } catch {
      throw new Error(
        "Failed to parse K3Mart login response as JSON. The API may be temporarily unavailable."
      );
    }

    // Extract JWT - check common response shapes
    let k3Token: string | undefined;
    if (typeof loginData.token === "string") {
      k3Token = loginData.token;
    } else if (typeof loginData.access_token === "string") {
      k3Token = loginData.access_token;
    } else if (
      loginData.data &&
      typeof loginData.data === "object" &&
      typeof (loginData.data as Record<string, unknown>).token === "string"
    ) {
      k3Token = (loginData.data as Record<string, unknown>).token as string;
    }

    if (!k3Token) {
      throw new Error(
        `Could not extract token from login response. Keys: ${Object.keys(loginData).join(", ")}`
      );
    }

    // Decode JWT to get expiry
    let tokenExpiresAt: number | undefined;
    try {
      const payload = decodeJwtPayload(k3Token);
      if (typeof payload.exp === "number") {
        tokenExpiresAt = payload.exp * 1000; // seconds -> ms
      }
    } catch {
      // Non-fatal
    }

    // Validate token with a test API call
    const testUrl = new URL(
      `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.dashboard}`
    );
    testUrl.searchParams.set("outletId", "1");
    testUrl.searchParams.set("page", "1");
    testUrl.searchParams.set("pageSize", "1");
    testUrl.searchParams.set("order", "asc");

    const testResponse = await fetch(testUrl.toString(), {
      headers: {
        Authorization: `JWT ${k3Token}`,
        ...K3MART_CONFIG.headers,
      },
    });

    if (testResponse.status === 401) {
      throw new Error("Token validation failed: received 401 from K3Mart API");
    }

    // Store success
    await ctx.runMutation(
      internal.platformCredentials.mutations.updateToken,
      {
        platformId: "k3mart",
        currentToken: k3Token,
        tokenExpiresAt,
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "success" as const,
      }
    );

    return { success: true, tokenExpiresAt };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await ctx.runMutation(
      internal.platformCredentials.mutations.updateToken,
      {
        platformId: "k3mart",
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "error" as const,
        lastRefreshError: errorMsg,
      }
    );

    return { success: false, error: errorMsg };
  }
}

/**
 * Public action: Refresh K3Mart token (admin-only, triggered from UI).
 */
export const refreshK3MartToken = action({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate admin access via internal query
    await ctx.runQuery(
      internal.platformCredentials.queries.validateAdminToken,
      { token: args.token }
    );

    return await performK3MartRefresh(ctx);
  },
});

/**
 * Internal action: Refresh K3Mart token (called by cron).
 * No auth check needed since crons are system-level.
 */
export const refreshK3MartTokenCron = internalAction({
  args: {},
  handler: async (ctx) => {
    return await performK3MartRefresh(ctx);
  },
});
