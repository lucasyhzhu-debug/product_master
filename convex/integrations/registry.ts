/**
 * Platform Integration Registry
 *
 * Type definitions and metadata for external platform integrations.
 * Each platform has a standalone adapter in convex/integrations/{platform}/adapter.ts.
 *
 * Adding a new platform:
 * 1. Add entry to PLATFORMS below
 * 2. Add v.literal("newplatform") to schema union types in convex/schema.ts
 * 3. Create convex/integrations/newplatform/adapter.ts + config.ts
 */

export type PlatformId = "k3mart" | "gobiz" | "internal";

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  description: string;
  envVarName: string;
  dataTypes: ("stock" | "revenue")[];
  tokenLifespan: string;
  reconnectSteps: string[];
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
      "Credentials are pre-configured — just click 'Sync Now' or 'Refresh Stores'",
      "Token auto-refreshes every 12 hours via cron",
      "To use different credentials, click 'Configure' and enter email/password",
    ],
  },
  gobiz: {
    id: "gobiz",
    name: "GoBiz (GoFood)",
    description: "GoFood gross & net revenue tracking",
    envVarName: "GOBIZ_API_TOKEN",
    dataTypes: ["revenue"],
    tokenLifespan: "~4-8h (browser session cookie)",
    reconnectSteps: [
      "Click 'Configure' below to open the token input dialog",
      "Open https://app.gobiz.co.id and log in with your account",
      "Open browser DevTools (F12) → Application tab → Cookies",
      "Copy the 'access_token' cookie value",
      "Paste the token in the dialog and click 'Save Token'",
      "Revenue auto-syncs every 3 hours while the token is valid",
    ],
  },
  internal: {
    id: "internal",
    name: "Internal Orders",
    description: "Revenue from direct orders (WhatsApp, Instagram, etc.)",
    envVarName: "",
    dataTypes: ["revenue"],
    tokenLifespan: "N/A (own database)",
    reconnectSteps: [],
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];
