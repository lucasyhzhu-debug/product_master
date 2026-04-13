/**
 * Re-export of the canonical fuzzyMatch implementation from `convex/lib/`.
 *
 * Canonical location is `convex/lib/fuzzyMatch.ts` so that the Convex bundler
 * stays inside its directory boundary (per CLAUDE.md pitfall #8 — Convex
 * bundles only files in `convex/`, and cross-boundary imports from `convex/`
 * to `src/` can fail silently in production).
 *
 * Frontend code and tests should continue to import from
 * `src/lib/bankStatement/fuzzyMatch` for ergonomic locality.
 */

export { normalize, similarityScore } from "../../../convex/lib/fuzzyMatch";
