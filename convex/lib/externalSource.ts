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
  "pos",
] as const;

export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

/** Narrows a string to ExternalSource if it matches a known platform. */
export function isExternalSource(s: string): s is ExternalSource {
  return (EXTERNAL_SOURCES as readonly string[]).includes(s);
}

// Phase 81 Plan 03: `sourceToPlatform` deleted (D-10 — no shims).
// Use `platformDisplay(resolvePlatform({ source }).platform)` from
// `convex/reports/platform.ts` — the canonical Source → Platform resolver
// that fixes the legacy "tiktok" → "Tokopedia" inversion (D-02) and the
// "k3mart" → "K3 Mart" spacing inconsistency.
