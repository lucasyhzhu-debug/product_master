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
    tokenLifespan: "~1 year (JWT)",
    reconnectSteps: [
      "Open https://umkm.k3mart.id and log in",
      "Open browser DevTools (F12) → Network tab",
      "Look for any API request to consapi.k3mart.id",
      "Copy the Authorization header value (after 'JWT ')",
      "Go to Convex Dashboard → Settings → Environment Variables",
      "Update K3MART_API_TOKEN with the new token",
      "Come back here and click 'Sync Now' to test",
    ],
  },
  gobiz: {
    id: "gobiz",
    name: "GoBiz (GoFood)",
    description: "GoFood gross & net revenue tracking",
    envVarName: "GOBIZ_API_TOKEN",
    dataTypes: ["revenue"],
    tokenLifespan: "~hours (session cookie)",
    reconnectSteps: [
      "Open https://app.gobiz.co.id and log in with your account",
      "Go to the Analytics/Dashboard page",
      "Open browser DevTools (F12) → Application tab → Cookies",
      "Find the 'access_token' cookie value",
      "Go to Convex Dashboard → Settings → Environment Variables",
      "Update GOBIZ_API_TOKEN with the new token",
      "Come back here and click 'Sync Now' to test",
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
