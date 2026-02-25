/**
 * Platform Integration Registry
 *
 * Type definitions and metadata for external platform integrations.
 * Each platform has a standalone adapter in convex/integrations/{platform}/adapter.ts.
 *
 * Adding a new platform:
 * 1. Add entry to PLATFORMS below
 * 2. Add v.literal("newplatform") to externalSource union in convex/schema.ts
 * 3. Create convex/integrations/newplatform/adapter.ts + config.ts
 */

export type PlatformId = "k3mart" | "gobiz" | "internal" | "grabfood" | "bigseller" | "consignment";

export type AuthStrategy = "password_grant" | "paste_token" | "client_credentials" | "pos_login" | "session_auth";
export type PlatformCategory = "delivery" | "marketplace" | "pos" | "internal";
export type DataType = "stock" | "revenue" | "orders";
export type HealthCheckType = "token_expiry" | "last_sync" | "always_green";

export interface HealthConfig {
  hasExpiry: boolean;
  yellowThresholdDays: number;
  redThresholdDays: number;
  healthCheckType: HealthCheckType;
}

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  description: string;
  envVarName: string;
  dataTypes: DataType[];
  tokenLifespan: string;
  reconnectSteps: string[];
  authStrategy: AuthStrategy;
  category: PlatformCategory;
  healthConfig: HealthConfig;
}

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  k3mart: {
    id: "k3mart",
    name: "K3 Mart",
    description: "Consignment outlet stock & sales tracking",
    envVarName: "K3MART_API_TOKEN",
    dataTypes: ["stock", "revenue"],
    tokenLifespan: "~24h (auto-refreshed every 12h)",
    reconnectSteps: [
      "Click 'Sync Now' or 'Refresh Stores' — one-click refresh uses stored credentials",
      "To use different credentials, click 'Configure' and enter email/password",
      "Paste token is available as a fallback if one-click refresh fails",
    ],
    authStrategy: "pos_login",
    category: "pos",
    healthConfig: {
      hasExpiry: false,
      yellowThresholdDays: 0,
      redThresholdDays: 0,
      healthCheckType: "last_sync",
    },
  },
  gobiz: {
    id: "gobiz",
    name: "GoBiz (GoFood)",
    description: "GoFood 5-metric revenue tracking (gross, net, commission, ad burn, promo burn)",
    envVarName: "GOBIZ_API_TOKEN",
    dataTypes: ["revenue"],
    tokenLifespan: "~1h access token, days/weeks refresh token",
    reconnectSteps: [
      "Click 'Refresh Token' — one-click refresh uses stored password_grant credentials",
      "If one-click fails, open https://portal.gofoodmerchant.co.id and log in",
      "Open browser DevTools (F12) → Application tab → Cookies",
      "Copy BOTH 'access_token' and 'refresh_token' cookie values",
      "Paste both tokens in the dialog and click 'Save Token' (fallback method)",
      "Click 'Sync Now' to manually sync revenue data (manual sync only)",
    ],
    authStrategy: "password_grant",
    category: "delivery",
    healthConfig: {
      hasExpiry: false,
      yellowThresholdDays: 0,
      redThresholdDays: 0,
      healthCheckType: "last_sync",
    },
  },
  internal: {
    id: "internal",
    name: "Internal Orders",
    description: "Revenue from direct orders (WhatsApp, Instagram, etc.)",
    envVarName: "",
    dataTypes: ["revenue"],
    tokenLifespan: "N/A (own database)",
    reconnectSteps: [],
    authStrategy: "session_auth",
    category: "internal",
    healthConfig: {
      hasExpiry: false,
      yellowThresholdDays: 0,
      redThresholdDays: 0,
      healthCheckType: "always_green",
    },
  },
  grabfood: {
    id: "grabfood",
    name: "GrabFood",
    description: "GrabFood POS API order and revenue tracking",
    envVarName: "GRABFOOD_CLIENT_SECRET",
    dataTypes: ["revenue", "orders"],
    tokenLifespan: "Short-lived access token, resolved on-demand",
    reconnectSteps: [
      "Click 'Configure' to enter client_id and client_secret from GrabFood merchant portal",
      "Credentials are used to resolve access tokens on-demand (no manual refresh needed)",
      "Contact GrabFood support if credentials are expired or access is revoked",
    ],
    authStrategy: "client_credentials",
    category: "delivery",
    healthConfig: {
      hasExpiry: false,
      yellowThresholdDays: 0,
      redThresholdDays: 0,
      healthCheckType: "always_green",
    },
  },
  bigseller: {
    id: "bigseller",
    name: "BigSeller",
    description: "Multi-marketplace order tracking (Shopee, Tokopedia, etc.) via BigSeller",
    envVarName: "BIGSELLER_TOKEN",
    dataTypes: ["revenue", "orders"],
    tokenLifespan: "~30 days (paste-once, manual renewal)",
    reconnectSteps: [
      "Log in to BigSeller at https://www.bigseller.com",
      "Open browser DevTools (F12) → Application tab → Cookies",
      "Copy the 'Authorization' or session cookie value",
      "Paste the token in the 'Configure' dialog and click 'Save Token'",
      "Token valid for ~30 days — renew before expiry warning appears",
    ],
    authStrategy: "paste_token",
    category: "marketplace",
    healthConfig: {
      hasExpiry: true,
      yellowThresholdDays: 7,
      redThresholdDays: 3,
      healthCheckType: "token_expiry",
    },
  },
  consignment: {
    id: "consignment",
    name: "Consignment",
    description: "Manual consignment outlet revenue settlement tracking",
    envVarName: "",
    dataTypes: ["revenue"],
    tokenLifespan: "N/A (manual entry)",
    reconnectSteps: [],
    authStrategy: "session_auth",
    category: "pos",
    healthConfig: {
      hasExpiry: false,
      yellowThresholdDays: 0,
      redThresholdDays: 0,
      healthCheckType: "always_green",
    },
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];
