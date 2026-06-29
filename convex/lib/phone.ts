/**
 * Phone number normalization helpers.
 *
 * Collapses Indonesian country-code variants and formatting noise into
 * a digits-only national form so that "+62 812-3456-7890", "0812-3456-7890",
 * and "081234567890" all compare equal.
 */

/**
 * Strips non-digit characters and normalises Indonesian country-code prefix.
 *
 * Examples:
 *   "+62 812-3456-7890" → "81234567890"
 *   "0812 3456 7890"    → "81234567890"
 *   "081234567890"      → "81234567890"
 */
export function normalizePhone(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("62")) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return d;
}

/**
 * True if `query` (when it looks like a phone number) matches `candidate`
 * after both are normalised to the same form.
 *
 * Returns false when `candidate` is absent or when `query` is shorter than
 * 4 digits (too short to be a meaningful phone lookup).
 */
export function phoneMatches(query: string, candidate?: string | null): boolean {
  if (!candidate) return false;
  const q = normalizePhone(query);
  if (q.length < 4) return false;
  return normalizePhone(candidate).includes(q);
}
