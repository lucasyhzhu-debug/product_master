# Phase 81: Domain Vocabulary Deepening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 81-domain-vocabulary-deepening
**Areas discussed:** C4 production-filter rule, C1 display-string rename, C1 ADR-0001 enforcement strategy, C3 canonical location + intra-phase sequencing, follow-up freeform (test strategy + Platform `Other` literal + v2.0 close + CONTEXT/CLAUDE edits scope)

---

## Pre-discussion analysis

Architecture review report (`docs/reviews/architecture-review-2026-05-08-graph-primed-deepening-candidates.md`) pre-formed 5 open questions. The README inside `.planning/phases/81-domain-vocabulary-deepening/` already enumerated them. Prior to gray-area selection, two reality shifts were surfaced:

1. Phase 76 had merged (commit `ca6bd8e3`, 2026-05-09) — sequencing-vs-76 question moot.
2. Phase 77 was deferred to v2.1 (commit `e708dc46`) — "must close before 77" urgency framing dropped.

User selected ALL 4 presented gray areas via multiSelect.

---

## C4 — Production-filter rule

| Option | Description | Selected |
|--------|-------------|----------|
| `category === "production"` (Recommended) | Simplest invariant. Treats ALL production-category components as countable units regardless of `unit` field. Future-proofs for non-`pcs` production components per CLAUDE.md rule 10's BOM unification trajectory. Used today in 2/5 files (lifetimeHelpers + staffAttendance). | ✓ |
| `category === "production" && unit === "pcs"` | Ball-shaped only. Excludes hypothetical gram-denominated production rows. Matches today's reality but breaks if a future component ships with `unit="g"`. Used today in 2/5 files (unitEconomics + menuProducts). | |
| `category === "production" && gramsPerUnit !== undefined` | Density-required. Most defensive but exclusive — a valid `pcs`-denominated component without weight metadata would silently disappear. Used today in 1/5 files (menuProducts/mutations). | |

**User's choice:** Recommended option (`category === "production"` alone).
**Notes:** Consistent with future BOM unification trajectory; predicate ships in `convex/reports/productionUnitHelpers.ts`.

---

## C1 — Display-string rename approval

| Option | Description | Selected |
|--------|-------------|----------|
| Rename to canonical: TikTok + K3Mart (Recommended) | `"Tokopedia"` → `"TikTok"` + `"K3 Mart"` → `"K3Mart"` everywhere. Matches CONTEXT.md line 102 canonical names. ~15 files. CHANGELOG entry. | ✓ |
| Keep current strings, type-only consolidation | Ship typed Platform union but `platformDisplay()` preserves today's strings. Loses half the value — UI ambiguity stays. | |
| Rename TikTok only, defer K3Mart space removal | Lower-blast-radius middle ground. | |

**User's choice:** Recommended option (full canonical rename).
**Notes:** Treated as bug fix (sourceToPlatform tiktok→Tokopedia is documented-wrong per 2023 merger note); ships under "Changed" in CHANGELOG; no PM gating.

---

## C1 — ADR-0001 enforcement strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Ship now with graceful fallback (Recommended) | `resolvePlatform({source:"bigseller"})` resolves via `linkedMenuProductId` lookup if available, else `"BigSeller"` transitional Platform literal. Forward-compatible. README-recommended. | ✓ |
| Block phase 81 on adding underlyingSource field first | Add `externalRevenue.underlyingSource` schema field + backfill as a prereq plan. Cleaner end-state but adds schema migration risk + scope. | |
| Ship without BigSeller path; phase 81 ignores BigSeller | `resolvePlatform({source:"bigseller"})` throws. Defer all ADR-0001 enforcement to a follow-on phase. | |

**User's choice:** Recommended option (ship now with graceful fallback).
**Notes:** Confidence downgrade to `"inferred"` accompanies fallback path; transitional `"BigSeller"` literal removed in a follow-on phase once schema field lands.

---

## C3 — Canonical location

| Option | Description | Selected |
|--------|-------------|----------|
| `convex/lib/periodRange.ts` (Recommended) | CLAUDE.md memory + `WIB_OFFSET_MS` constant already there. Generic-helper home. CONTEXT.md line 223's mention of `counter.ts` is incidental. | ✓ |
| `convex/lib/counter.ts` | Per CONTEXT.md line 223 literal text. Forces non-counter callers to import from a counter file. | |
| `convex/lib/wibTime.ts` (new dedicated module) | Cleanest cohesion; biggest churn. | |

**User's choice:** Recommended option (`periodRange.ts`).
**Notes:** CONTEXT.md line 223 to be corrected as part of phase 81's docs deliverable.

---

## C3 — Intra-phase plan ordering

| Option | Description | Selected |
|--------|-------------|----------|
| C4 → C3 → C1 (Recommended, README order) | Smallest/safest first. Each ships+merges independently. | ✓ |
| C1 first, then C3 + C4 in parallel | Highest-value first; risk: C1 type cascade may block C3+C4. | |
| All three ship in parallel as separate plans | Maximum parallelism; merge conflict risk on shared files. | |

**User's choice:** Recommended option (C4 → C3 → C1, plus a 4th docs plan after).
**Notes:** Single feature branch `feature/81-domain-vocabulary-deepening`; separate merges per plan.

---

## Follow-up freeform (test strategy + Platform `Other` + v2.0 close + CONTEXT/CLAUDE edits scope)

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for context (Recommended) | Write CONTEXT.md with 4 decisions captured. | |
| Discuss test strategy + ESLint guards | Open: table-driven vs golden-file? ESLint banning re-imports? Keep `Other` literal? | |
| Discuss v2.0 close + ROADMAP entry | Phase 81 not in ROADMAP yet; does 81 close v2.0? | |
| Discuss CONTEXT.md / CLAUDE.md edits in scope | Are doc edits part of phase 81 deliverables? | |
| Other (freeform) | User typed combined response. | ✓ |

**User's choice (freeform):** "run the best testing strategy you can that manages regressions well, remove other in the platform; v2.0 is not closed, just add phase 81 to the milestone, editing context and claude is part of the deliverables"

**Reflected back + confirmed (Claude resolved):**
- **Tests:** Table-driven for both `resolvePlatform` and `isProductionUnit` (exhaustive tuples per row); NaN-guard invariant + 1:1 parity tests for `getWibDateStr`. Plus ESLint `no-restricted-imports` rule banning the 6 deleted exports.
- **Platform literal:** `"Other"` removed. Union is exactly `Direct | GoFood | GrabFood | Shopee | TikTok | K3Mart | Consignment | BigSeller` (BigSeller transitional).
- **v2.0 status:** Phase 81 added to ROADMAP.md v2.0 milestone (during plan-phase, doc-only commit); 81 does not by itself close v2.0.
- **Doc edits in scope:** CONTEXT.md (root) + CLAUDE.md edits are part of phase 81's 4th plan (Docs), executed after C1 lands.

---

## Claude's Discretion

- Test file paths (match repo conventions): `convex/reports/__tests__/platform.test.ts`, `convex/reports/__tests__/productionUnitHelpers.test.ts`, `convex/lib/__tests__/periodRange.test.ts`.
- ESLint rule placement: existing `eslint.config.js` or `.eslintrc.cjs`; resolved at plan-phase based on actual repo state.
- Confidence-downgrade-on-BigSeller-fallback wiring: avoid double-downgrade for rows that were already `"inferred"` for unrelated reasons; tightest non-double-downgrading option chosen at implementation.
- `convex/reports/platform.ts` vs `convex/lib/platform.ts` for the resolver module: pick based on circular-import risk surfacing during planning.

---

## Deferred Ideas

- `externalRevenue.underlyingSource` schema field + backfill (BigSeller resolution finalization).
- Removal of transitional `"BigSeller"` Platform literal (paired with above).
- Period-comparison orchestrator extraction (Candidate 2; revisit after third clone appears).
- `useProtectedMutation` adoption sweep (Candidate 5; post-v2.0).
- `orders.channel` literal cleanup (`tokopedia` deprecated, `gofood` missing — schema-touching).
- Phase 77 Data Health Dashboard (already deferred to v2.1; will inherit phase 81's predicates).
