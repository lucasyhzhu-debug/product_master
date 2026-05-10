import type { ExternalSource } from "../lib/externalSource";
import type { Confidence } from "../lib/confidence";

/**
 * Phase 81 — Canonical Platform vocabulary.
 *
 * D-04: Union is exactly these 8 literals. NO "Other" — every Source must
 * resolve cleanly. "BigSeller" is transitional (D-03) — it disappears when
 * the externalRevenue.underlyingSource schema field lands and the fallback
 * branch in resolvePlatform is removed.
 *
 * Order: Direct first (CONTEXT.md convention), alphabetical within
 * marketplace cluster, transitional "BigSeller" last.
 */
export const PLATFORMS = [
  "Direct",
  "GoFood",
  "GrabFood",
  "Shopee",
  "TikTok",
  "K3Mart",
  "Consignment",
  "BigSeller",
] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Narrows a string to Platform if it matches a canonical literal. */
export function isPlatform(s: string): s is Platform {
  return (PLATFORMS as readonly string[]).includes(s);
}

/**
 * Identity-on-literal display helper.
 *
 * Phase 81 / PATTERNS.md finding #5: Platform literals are already
 * user-facing PascalCase strings. This helper exists as a forward-compat
 * chokepoint for future locale layers — if a translation layer is added,
 * this is its single insertion point.
 */
export function platformDisplay(p: Platform): string {
  return p;
}

/** Source → Platform map for the simple cases (D-05). */
const SOURCE_TO_PLATFORM: Record<Exclude<ExternalSource, "bigseller">, Platform> = {
  internal: "Direct",
  gobiz: "GoFood",
  grabfood: "GrabFood",
  shopee: "Shopee",
  tiktok: "TikTok",
  k3mart: "K3Mart",
  consignment: "Consignment",
};

/**
 * orders.channel literal → Platform (D-05 + CONTEXT.md ambiguity 137).
 *
 * "tokopedia" is a deprecated orders.channel literal; treated as a synonym
 * for "tiktok" → "TikTok" since the 2023 Tokopedia/TikTok-Shop merger.
 */
const ORDER_CHANNEL_TO_PLATFORM: Record<string, Platform> = {
  internal: "Direct",
  gobiz: "GoFood",
  grabfood: "GrabFood",
  shopee: "Shopee",
  tiktok: "TikTok",
  tokopedia: "TikTok", // deprecated, kept for legacy data
  k3mart: "K3Mart",
  consignment: "Consignment",
};

/** Row argument to resolvePlatform (composable across all C1 callsites). */
export type ResolvePlatformRow = {
  source: ExternalSource;
  /** D-03 forward-compat (schema field doesn't exist yet — returns null today). */
  underlyingSource?: ExternalSource;
  /** PATTERNS.md finding #6: unitEconomics.ts orderChannel-based callsites. */
  orderChannel?: string;
};

/**
 * Resolve a row to its canonical Platform.
 *
 * Priority order:
 *   1. orderChannel (if set) — used by unitEconomics order-channel branches
 *   2. source === "bigseller":
 *        a. underlyingSource (D-03 forward-compat — schema field pending)
 *        b. fallback "BigSeller" + confidence "inferred"
 *   3. source via SOURCE_TO_PLATFORM map
 *
 * Returns { platform, confidence } so callers compose with worstConfidence
 * to avoid double-downgrading rows already at "inferred".
 *
 * Sync-only (staffreview I1): the linkedMenuProductId lookup branch was
 * removed — menuProducts has no `source` field today (verified against
 * convex/schema.ts). Re-introduce as Promise-returning when the
 * ADR-0001 schema fields (externalRevenue.underlyingSource +
 * menuProducts.source) land. Until then, BigSeller without
 * underlyingSource resolves to the transitional literal.
 *
 * TODO(ADR-0001): un-skip Test 10 + add linkedMenuProductId.source lookup
 * when externalRevenue.underlyingSource + menuProducts.source schema
 * fields land.
 */
export function resolvePlatform(
  row: ResolvePlatformRow,
): { platform: Platform; confidence: Confidence } {
  // 1. orderChannel overload
  if (row.orderChannel) {
    const platform = ORDER_CHANNEL_TO_PLATFORM[row.orderChannel] ?? "Direct";
    return { platform, confidence: "exact" };
  }

  // 2. BigSeller branch
  if (row.source === "bigseller") {
    // 2a. underlyingSource (D-03 forward-compat)
    if (row.underlyingSource && row.underlyingSource !== "bigseller") {
      const platform =
        SOURCE_TO_PLATFORM[row.underlyingSource as Exclude<ExternalSource, "bigseller">];
      return { platform, confidence: "inferred" };
    }
    // 2b. transitional fallback (linkedMenuProductId lookup deferred — see staffreview I1)
    return { platform: "BigSeller", confidence: "inferred" };
  }

  // 3. Standard source map
  const platform = SOURCE_TO_PLATFORM[row.source];
  return { platform, confidence: "exact" };
}
