/**
 * Runtime type guard for the externalSource union type.
 *
 * IMPORTANT: This array MUST match the literals in `externalSource`
 * validator defined in convex/schema.ts (line 18). If you add a new
 * platform to the schema, add it here too.
 *
 * @see convex/schema.ts — externalSource validator
 */
export const EXTERNAL_SOURCES = [
  "k3mart",
  "gobiz",
  "internal",
  "grabfood",
  "bigseller",
  "consignment",
  "shopee",
  "tiktok",
] as const;

export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

/** Narrows a string to ExternalSource if it matches a known platform. */
export function isExternalSource(s: string): s is ExternalSource {
  return (EXTERNAL_SOURCES as readonly string[]).includes(s);
}

/** Map source to platform display name */
export function sourceToPlatform(source: string): string {
  switch (source) {
    case "gobiz": return "GoFood";
    case "k3mart": return "K3 Mart";
    case "internal": return "Direct";
    case "grabfood": return "GrabFood";
    case "shopee": return "Shopee";
    // Tokopedia merged with TikTok Shop in Indonesia (2023). Source key "tiktok" represents the combined platform.
    case "tiktok": return "Tokopedia";
    case "consignment": return "Consignment";
    case "bigseller": return "BigSeller";
    default: return source;
  }
}
