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
 * Order: Direct first (CONTEXT.md convention), then food-delivery
 * (GoFood, GrabFood), then e-commerce marketplaces (Shopee, TikTok), then
 * physical-retail aggregates (K3Mart, Consignment), transitional
 * "BigSeller" last.
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
 * Mirror of `convex/schema.ts` orders.channel union literals.
 *
 * KEEP IN SYNC: when a new literal is added to the schema's `orders.channel`
 * `v.union(...)`, add it here AND extend `ORDER_CHANNEL_TO_PLATFORM` below.
 * Typing the map against this union forces TypeScript to fail when a literal
 * is added to the schema but not to the resolver — the previous fall-through
 * (`?? "Direct"`) silently inflated Direct revenue.
 *
 * Source: `convex/schema.ts` orders table, channel field (~lines 261-273).
 *
 * "tokopedia" is a legacy `orders.channel` literal kept in the schema for
 * historical data; resolves as a synonym for "tiktok" → "TikTok" since the
 * 2023 Tokopedia/TikTok-Shop merger (CONTEXT.md ambiguity 137).
 */
export type OrderChannel =
  | "whatsapp"
  | "instagram"
  | "shopee"
  | "tiktok"
  | "tokopedia"
  | "grabfood"
  | "k3mart_gf"
  | "legato_tamtem"
  | "legato_goldfinch"
  | "bazaar"
  | "other"
  // Not in schema's orders.channel union, but used by some legacy paths
  // to overload the resolver onto a Source-style key. Keep these here as
  // synonyms for the corresponding source mappings so callers passing
  // ExternalSource-shaped strings via orderChannel still resolve.
  | "internal"
  | "gobiz"
  | "k3mart"
  | "consignment";

/**
 * orders.channel literal → Platform (D-05 + CONTEXT.md ambiguity 137).
 *
 * Triple-review C1 fix: previously a permissive `Record<string, Platform>`
 * that allowed unknown channel literals to fall through `?? "Direct"`. This
 * silently routed `whatsapp`, `instagram`, `k3mart_gf`, `legato_tamtem`,
 * `legato_goldfinch`, `bazaar`, `other` (5+ schema-real literals) to the
 * Direct platform — inflating Direct revenue. Type is now constrained
 * against the OrderChannel union so future schema additions break TS.
 */
const ORDER_CHANNEL_TO_PLATFORM: Record<OrderChannel, Platform> = {
  // Schema literals (orders.channel union)
  whatsapp: "Direct",
  instagram: "Direct",
  shopee: "Shopee",
  tiktok: "TikTok",
  tokopedia: "TikTok", // deprecated, kept for legacy data
  grabfood: "GrabFood",
  k3mart_gf: "K3Mart",
  legato_tamtem: "Consignment",
  legato_goldfinch: "Consignment",
  bazaar: "Consignment",
  other: "Direct",
  // Legacy/Source-style synonyms used by some unitEconomics callsites that
  // pass ExternalSource-shaped strings via the orderChannel field.
  internal: "Direct",
  gobiz: "GoFood",
  k3mart: "K3Mart",
  consignment: "Consignment",
};

/** Row argument to resolvePlatform (composable across all C1 callsites). */
export type ResolvePlatformRow = {
  source: ExternalSource;
  /**
   * D-03 forward-compat (schema field doesn't exist yet — returns null today).
   * Triple-review Minor-1: typed against `Exclude<ExternalSource, "bigseller">`
   * so callers cannot pass "bigseller" as the underlyingSource (which would
   * recurse into the BigSeller branch). Runtime guard at line ~140 still
   * enforces the same invariant defensively.
   */
  underlyingSource?: Exclude<ExternalSource, "bigseller">;
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
    const platform = ORDER_CHANNEL_TO_PLATFORM[row.orderChannel as OrderChannel];
    if (platform === undefined) {
      // Triple-review I1: unknown orderChannel → defensive default but
      // confidence downgrade so Phase 77's data-health surface can grep
      // `confidence === "inferred"` to find drift between schema literals
      // and the resolver keyspace. After C1 fix the map is type-narrowed
      // against the schema union, so this path should be unreachable for
      // known literals — but if a new schema literal lands without a
      // resolver update, the fallback fires `"inferred"` instead of
      // silently inflating Direct revenue with `"exact"`.
      return { platform: "Direct", confidence: "inferred" };
    }
    return { platform, confidence: "exact" };
  }

  // 2. BigSeller branch
  if (row.source === "bigseller") {
    // 2a. underlyingSource (D-03 forward-compat)
    // Defensive runtime check: even though `underlyingSource` is typed
    // `Exclude<ExternalSource, "bigseller">` (Minor-1), callers using
    // `as Exclude<...>` casts can still bypass it at runtime.
    if (
      row.underlyingSource &&
      (row.underlyingSource as ExternalSource) !== "bigseller"
    ) {
      const platform = SOURCE_TO_PLATFORM[row.underlyingSource];
      return { platform, confidence: "inferred" };
    }
    // 2b. transitional fallback (linkedMenuProductId lookup deferred — see staffreview I1)
    return { platform: "BigSeller", confidence: "inferred" };
  }

  // 3. Standard source map
  const platform = SOURCE_TO_PLATFORM[row.source as Exclude<ExternalSource, "bigseller">];
  if (!platform) {
    // Triple-review C3: defensive fallback. TS narrows row.source to
    // ExternalSource at compile time, but callers using `as ExternalSource`
    // casts (6 sites in this phase) can pass unknown values at runtime.
    // Fall back to BigSeller transitional with inferred confidence —
    // matches deleted sourceToPlatform behavior. Phase 77 can grep this
    // path via `platform === "BigSeller" && confidence === "inferred"`.
    return { platform: "BigSeller", confidence: "inferred" };
  }
  return { platform, confidence: "exact" };
}
