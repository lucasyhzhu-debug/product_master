/**
 * Channel definitions for order sources.
 * Visual Inventory System: Phase 2 Utilities
 *
 * Each channel has:
 * - code: Short code for badges (2-5 chars)
 * - color: Brand color hex
 * - name: Full display name
 * - border: "double" for green channels, "single" for others
 */

export const CHANNELS = {
  whatsapp: {
    code: "WA",
    color: "#25D366",
    name: "WhatsApp",
    border: "double",
  },
  instagram: {
    code: "IG",
    color: "#E1306C",
    name: "Instagram",
    border: "single",
  },
  shopee: {
    code: "SHP",
    color: "#EE4D2D",
    name: "Shopee",
    border: "single",
  },
  tiktok: {
    code: "TT",
    color: "#000000",
    name: "TikTok Shop",
    border: "single",
  },
  tokopedia: {
    code: "TKP",
    color: "#42B549",
    name: "Tokopedia",
    border: "double",
  },
  grabfood: {
    code: "GRB",
    color: "#00B14F",
    name: "GrabFood",
    border: "double",
  },
  k3mart_gf: {
    code: "K3GF",
    color: "#8B5CF6",
    name: "K3Mart-GF",
    border: "single",
  },
  legato_tamtem: {
    code: "LegTT",
    color: "#F97316",
    name: "Legato TamTem",
    border: "single",
  },
  legato_goldfinch: {
    code: "LegGF",
    color: "#EF4444",
    name: "Legato GoldFinch",
    border: "single",
  },
  bazaar: {
    code: "Baz",
    color: "#EC4899",
    name: "Bazaar",
    border: "single",
  },
  other: {
    code: "...",
    color: "#6B7280",
    name: "Other",
    border: "single",
  },
} as const;

// Type for channel keys
export type ChannelKey = keyof typeof CHANNELS;

// Type for channel info
export type ChannelInfo = (typeof CHANNELS)[ChannelKey];

/**
 * Get channel info by key with fallback to "other"
 */
export function getChannelInfo(channel: string | null | undefined): ChannelInfo {
  if (!channel || !(channel in CHANNELS)) {
    return CHANNELS.other;
  }
  return CHANNELS[channel as ChannelKey];
}

/**
 * Get all channel options for selectors
 */
export function getChannelOptions(): Array<{ value: ChannelKey; label: string }> {
  return Object.entries(CHANNELS).map(([key, info]) => ({
    value: key as ChannelKey,
    label: info.name,
  }));
}
