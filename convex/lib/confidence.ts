/**
 * Shared confidence classification for revenue and COGS data quality.
 * Used by income statement, dashboard summary, and analytics queries.
 */

export type Confidence = "exact" | "calculated" | "inferred" | "missing";

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  exact: 0,
  calculated: 1,
  inferred: 2,
  missing: 3,
};

/** Returns the worse (lowest-quality) confidence of two values. */
export function worstConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}
