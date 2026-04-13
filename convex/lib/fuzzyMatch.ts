/**
 * Fuzzy description matching for bank statement ↔ record linkage.
 *
 * Uses `fastest-levenshtein` for O(n) edit distance. Threshold tuning lives in
 * the match engine — this module only exposes deterministic scoring.
 *
 * Scoring strategy (asymmetric):
 *   - Full-string Levenshtein ratio: 1 − distance(na, nb) / max(|na|, |nb|)
 *   - Containment ratio: if nb occurs as a substring of na (or vice-versa),
 *     |shorter| / |longer|
 *   - Return the MAX of the two. This lets a short query ("reimburse Kevin
 *     Yosua") score well against a long BCA descriptor where the short phrase
 *     appears verbatim, while still penalizing completely disjoint strings.
 *
 * Canonical location: `convex/lib/` so Convex bundler stays inside its directory
 * boundary (per CLAUDE.md pitfall #8). Frontend / tests re-export from
 * `src/lib/bankStatement/fuzzyMatch.ts`.
 */

import { distance } from "fastest-levenshtein";

/**
 * Canonical form used for score comparison: lowercase, strip non-alphanumeric
 * (keeping spaces), collapse whitespace runs, trim.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns a similarity score in [0,1] between two strings. Returns 0 when
 * either normalized string is empty.
 */
export function similarityScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length === 0 || nb.length === 0) return 0;

  const maxLen = Math.max(na.length, nb.length);
  const minLen = Math.min(na.length, nb.length);

  const full = 1 - distance(na, nb) / maxLen;

  let contain = 0;
  if (na.includes(nb) || nb.includes(na)) {
    contain = minLen / maxLen;
  }

  const score = Math.max(full, contain);
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}
