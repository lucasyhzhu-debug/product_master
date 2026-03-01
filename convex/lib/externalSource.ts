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
