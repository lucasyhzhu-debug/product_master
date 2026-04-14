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
