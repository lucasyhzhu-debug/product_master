/**
 * Component Types Shared Helpers
 *
 * Pure helpers used across componentTypes mutations, queries, and dedupe utilities.
 */

/**
 * Normalize a display name for duplicate detection / matching:
 *   - trim
 *   - lowercase
 *   - collapse whitespace, underscores, and hyphens into single spaces
 *
 * Examples:
 *   normalizeName("Filling-Pistachio")   -> "filling pistachio"
 *   normalizeName("FILLING_PISTACHIO")   -> "filling pistachio"
 *   normalizeName("  Filling Pistachio ") -> "filling pistachio"
 */
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

/**
 * Canonical production componentType codes expected to exist after
 * `componentTypes/seed:seedLeafKitchenComponents` + `seedProductionComponents`
 * have been run. Kept in sync with the `leafComponents` array + BIG_BALL /
 * MID_BALL in seed.ts.
 *
 * Used by `reportDuplicatesByName` to show the user at a glance which
 * canonical codes are actually present in the DB vs missing.
 */
export const EXPECTED_CANONICAL_CODES = [
  // Tier-1 ball types
  "BIG_BALL",
  "MID_BALL",
  "HAZELNUT_REGULAR",
  // Tier-0 leaf ingredients (unit="g")
  "OUTER_MARSHMALLOW",
  "FILLING_PISTACHIO",
  "PISTACHIO_SPREAD",
  "SALT",
  "MARSHMALLOW",
  "CACAO_POWDER",
  "MILK_POWDER",
  "KUNAFA",
  "PISTACHIO_PASTE",
  "BUTTER",
  "NUTELLA_FILLING",
] as const;
