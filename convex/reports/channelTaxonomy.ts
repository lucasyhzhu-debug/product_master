/**
 * Maps raw orders.channel literals into display-channel groups used by analytics.
 * Keep in sync with orders.channel union in convex/schema.ts.
 */
export type DisplayChannel =
  | "Shopee"
  | "Tokopedia"
  | "GoFood"
  | "K3Mart"
  | "Direct"
  | "Consignment"
  | "TikTok"
  | "Other";

export const DISPLAY_CHANNELS: DisplayChannel[] = [
  "Shopee",
  "Tokopedia",
  "GoFood",
  "K3Mart",
  "Direct",
  "Consignment",
  "TikTok",
  "Other",
];

export function toDisplayChannel(raw: string | undefined): DisplayChannel {
  switch (raw) {
    case "shopee":
      return "Shopee";
    case "tokopedia":
      return "Tokopedia";
    case "grabfood":
      return "GoFood";
    case "k3mart_gf":
      return "K3Mart";
    case "whatsapp":
    case "instagram":
      return "Direct";
    case "legato_tamtem":
    case "legato_goldfinch":
    case "bazaar":
      return "Consignment";
    case "tiktok":
      return "TikTok";
    default:
      return "Other";
  }
}

/**
 * Maps raw `externalRevenue.source` literals into display-channel groups.
 * Keep in sync with `externalSource` union in convex/schema.ts.
 *
 * Sources unmapped to a specific display (gobiz/bigseller/internal) collapse
 * to the closest sensible bucket — gobiz is a merchant backend (treat as
 * GoFood traffic), bigseller aggregates marketplace data (treat as "Other"),
 * internal is manual entry (treat as Direct).
 */
export function sourceToDisplayChannel(raw: string | undefined): DisplayChannel {
  switch (raw) {
    case "shopee":
      return "Shopee";
    case "tokopedia":
      return "Tokopedia";
    case "grabfood":
    case "gobiz":
      return "GoFood";
    case "k3mart":
      return "K3Mart";
    case "tiktok":
      return "TikTok";
    case "consignment":
      return "Consignment";
    case "internal":
      return "Direct";
    case "bigseller":
    default:
      return "Other";
  }
}
