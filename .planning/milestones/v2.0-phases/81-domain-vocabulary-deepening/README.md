# Phase 81: Domain Vocabulary Deepening

**Status:** Pre-spec (architecture review report exists; phase ready for `/gsd-spec-phase` or `/gsd-discuss-phase`).

**Created:** 2026-05-08

**Type:** Tech-debt / architecture deepening. Inserted into v2.0 to derisk Phase 76 (Financial Data Export) and Phase 77 (Data Health Dashboard), both of which consume the platform-resolution and ball-counting rules being consolidated here.

**Sequencing:** `80.3 ✓ → 76 (planned, can run in parallel) → 81 (this phase) → 77 → 78 → v2.0 close`

The recommended sequence runs Phase 76 in parallel with the small mechanical parts of 81 (Candidates 3 & 4 below), then closes Candidate 1 before Phase 77 starts so the Data Health Dashboard reads through the consolidated resolver.

---

## Goal

Collapse three duplicated/inconsistent domain rule clusters into single sources of truth, per the 2026-05-08 graph-primed architecture review. Each cluster is a deepening opportunity that the project's `CONTEXT.md` and `CLAUDE.md` already name but does not yet enforce.

| # | Cluster | Today | Target |
|---|---------|-------|--------|
| **C1** | Platform resolution | 3 shallow mappers (`sourceToPlatform`, `toDisplayChannel`, `sourceToDisplayChannel`) with conflicting rules | Single deep `resolvePlatform(row)` module + typed `Platform` literal union |
| **C4** | BOM "is production component" predicate | 5 files filter `category === "production"` with 3 different rule shapes | Single `isProductionUnit(ct)` predicate exported from `convex/reports/productionUnitHelpers.ts` |
| **C3** | WIB date string conversion | 4 helpers (`getWibDateStr`, `utcToWibDateStr`, `getWibDateString`, `toWibDateString`) with drift on NaN guard and optional defaulting | One canonical helper at `convex/lib/periodRange.ts` (per `CONTEXT.md` line 220-223), NaN guard preserved as invariant |

---

## Load-bearing references

Read these before spec/discuss:

1. **Architecture review report:** [`docs/reviews/architecture-review-2026-05-08-graph-primed-deepening-candidates.md`](../../../docs/reviews/architecture-review-2026-05-08-graph-primed-deepening-candidates.md) — full investigation, scoring, prioritisation, deferred candidates, 5 open questions for the reviewer.
2. **Domain glossary:** `CONTEXT.md` (repo root)
   - § "Channel taxonomy" (lines 79-104) — names Source, Underlying source, Order channel, Platform.
   - Flagged ambiguities lines 134-141 — explicitly names this work.
   - § "WIB business date" line 220-223 — names the canonical helper.
3. **ADRs:**
   - `docs/adr/0001-bigseller-is-a-source-not-a-platform.md` — currently undelivered (no mapper consults `underlyingSource`); C1 enforces it.
4. **CLAUDE.md rules:**
   - Rules 10 and 13 — mandate BOM-derived ball counts; C4 makes the rule mechanically observable.
   - Pitfall #11 — names deprecated `productionType`/`productionUnits` fields; C4 reduces drift surface.
5. **Graph report (input to the review):** `graphify-out/GRAPH_REPORT.md` — Surprising Connections + Communities 0/3.
6. **Skill reference:** `.claude/skills/improve-codebase-architecture/LANGUAGE.md` and `DEEPENING.md` — vocabulary used throughout.

---

## Scope

### In scope

- **C1 — Platform resolver consolidation.** Create `convex/reports/platform.ts` exporting `Platform` literal union + `resolvePlatform(row)` + `platformDisplay(p)`. Migrate all callers (~20 sites) off `sourceToPlatform` / `toDisplayChannel` / `sourceToDisplayChannel`. Delete the three legacy mappers.
- **C4 — `isProductionUnit` predicate.** Export single predicate from `convex/reports/productionUnitHelpers.ts`. Replace the 5 hand-rolled filters in `unitEconomics.ts:458`, `lifetimeHelpers.ts:26`, `staffAttendance/aggregation.ts:186`, `menuProducts/mutations.ts:52`. Ensure all ball-count callers use `getProductionUnitsPerProduct` / `unitsForOrderItem` rather than walking BOM by hand.
- **C3 — WIB date-string consolidation.** Promote `toWibDateString`'s NaN-guard semantics into the canonical helper at `convex/lib/periodRange.ts`. Delete `getWibDateString`, `getWibDateStringDaysAgo`, `toWibDateString`, and `getWibDateStr` (collapsed into the canonical name). Migrate test imports.
- **CONTEXT.md updates.** Tighten "Cost → COGS chain" to name the production-component predicate; resolve the `counter.ts` vs `periodRange.ts` location ambiguity for the WIB helper; remove flagged ambiguity entries 134, 138, 139, 141 once C1 lands.

### Out of scope (deferred)

- **Period-comparison orchestrator extraction** (Candidate 2 from the review). Speculative; revisit after Phase 76 if it produces a third clone.
- **`useProtectedMutation` adoption sweep** (Candidate 5). High-effort, low-payoff; schedule post-v2.0 milestone close as a dedicated cleanup phase with an ESLint guard.
- **`underlyingSource` schema field on `externalRevenue`.** Required by ADR-0001 to fully resolve BigSeller rows. C1's `resolvePlatform` ships forward-compatible (graceful "missing → inferred" fallback). Adding the schema field is a follow-on phase.

---

## Dependencies

- Phase 80.3 — ✓ complete (no conflict on `loadExternalStream`)
- Phase 76 — planned but unstarted; can run in parallel. C1 changes types of values that Phase 76's CSV export consumes; if Phase 76 ships first, its export columns may need a touch-up to use `Platform` literals. Recommended: ship C3 + C4 in parallel with 76, run C1 after 76 merges to avoid type-cascade conflict.
- Phase 77 — planned but unstarted. **Recommended: 81 closes before 77 starts.** Data Health Dashboard's "platform consistency" check is exactly the rule C1 enforces; if 77 ships first, it will need rework once C1 lands.

---

## Success criteria (what must be TRUE)

1. **One Platform resolver.** `sourceToPlatform`, `toDisplayChannel`, `sourceToDisplayChannel` no longer exist. `resolvePlatform` is the only function returning a Platform value. `Platform` is a typed literal union; callers cannot pass arbitrary strings.
2. **ADR-0001 mechanically enforced.** Calling `resolvePlatform({ source: "bigseller", underlyingSource: "shopee" })` returns `"Shopee"`. With `underlyingSource` absent, returns a documented `"Inferred"` or sentinel handled by Confidence rules — does NOT silently collapse to `"Other"`.
3. **One BOM production predicate.** `isProductionUnit(ct)` is the only filter used to identify production components in queries that count balls. The 5 hand-rolled filters are deleted. CONTEXT.md documents the canonical rule (decision in discuss-phase).
4. **One WIB date helper.** Backend imports the canonical `getWibDateStr` (or renamed equivalent) from `convex/lib/periodRange.ts`. NaN-finite guard is exercised in test. The 3 duplicate helpers and their duplicate test-only imports are deleted.
5. **Display-string changes are PM-aligned.** TikTok/Tokopedia and K3Mart/K3 Mart label decisions are documented before the rename is shipped (open question 2 in the review report).
6. **No behavioral regression.** `npm run build` + full Vitest suite + Playwright E2E green. Rendering of dashboards, P&L, analytics, and CSV exports show identical numerics pre/post (allow display-string differences, but not numeric drift).
7. **CONTEXT.md and CLAUDE.md updated.** Flagged ambiguities 134, 138, 139, 141 closed. Pitfall #11 cross-references the new `isProductionUnit` predicate.

---

## Recommended execution pipeline

This phase warrants the full GSD treatment because:
- C1 introduces a typed literal union that cascades through ~20 callers (Convex backend + React components + CSV exports).
- C4 requires a domain-rule decision (does `unit === "pcs"` belong in the predicate?) before extraction.
- C3 has a small CONTEXT-vs-CLAUDE.md location disagreement to resolve.

```
1. /gsd-spec-phase 81
   → Lock falsifiable success criteria. Resolve open questions 1, 2, 3, 4 from the review report.

2. /gsd-discuss-phase 81
   → Advisor on:
     - Sequencing C1 vs Phase 76 (parallel-safe? type cascade risk?)
     - PM display-string sign-off on TikTok/K3Mart rename
     - C4 production-filter rule decision
     - Whether to ship C1 forward-compatible or wait for `underlyingSource` schema field
     - Test strategy: golden-file or table-driven for `resolvePlatform`?

3. /gsd-plan-phase 81
   → Three plans expected:
     - 81-01-PLAN.md — C4 isProductionUnit predicate (smallest, ship first as warm-up)
     - 81-02-PLAN.md — C3 WIB date-string consolidation
     - 81-03-PLAN.md — C1 Platform resolver + caller migration (largest)
   → Run /triple-review on 81-03-PLAN.md (type cascade is the highest-risk piece).

4. /gsd-execute-phase 81
   → Execute waves; commit per plan; merge per plan if tests stay green.

5. /gsd-verify-work 81 + /gsd-validate-phase 81
   → UAT on platform-name display + BOM ball-count parity + WIB date correctness
```

Optional but recommended: run `/staffreview` against `81-03-PLAN.md` before plan execution. The Platform-literal type cascade is the kind of refactor where one missed callsite produces a compile failure that halts Vercel CI.

---

## Branch

Single feature branch: `feature/81-domain-vocabulary-deepening` (≤50 chars; safe under Windows path budget).

If sub-plans land in sequence with green tests, merge each to main individually rather than bundling — keeps history clean and lets Phase 76/77 work in parallel without conflicting on the same branch.

---

## Open questions for spec/discuss phase

These come straight from the architecture review report; resolve in `/gsd-spec-phase` or `/gsd-discuss-phase`:

1. **C1 sequencing vs `underlyingSource` schema field.** Ship `resolvePlatform` with graceful fallback now, or wait for the `externalRevenue.underlyingSource` field? My read: ship now with fallback. Reviewer to confirm.
2. **C1 display strings.** CONTEXT.md says canonical Platform names are `TikTok` (not `Tokopedia`) and `K3Mart` (no space). User-visible. PM sign-off needed before rename.
3. **C4 production-filter rule.** `category === "production"` alone, or `&& unit === "pcs"`? Five files implicitly disagree today.
4. **C3 canonical location.** CLAUDE.md memory says `convex/lib/periodRange.ts`. CONTEXT.md line 223 says `convex/lib/counter.ts`. CONTEXT.md should win, but worth a sanity check that `periodRange.ts` is the right place for a generic helper.
5. **Sequencing C1 vs C4 vs C3.** Recommended order is C4 → C3 → C1 (smallest → largest, safest → riskiest). Reviewer may have a stronger v2.0-phase-ordering reason to flip this.

---

## Why this phase exists (one paragraph for posterity)

The 2026-05-08 graph-primed architecture review surfaced five deepening candidates from `graphify-out/GRAPH_REPORT.md`. Three were strong: each represents a domain rule that `CONTEXT.md` or `CLAUDE.md` already names as canonical, but that the codebase implements with subtle drift across multiple files. The drift is invisible until it causes a bug — exactly the failure mode of Phase 80.2's retroactive-mapping cascade divergence (per `lessons_phase_80_2_triple_review.md`). This phase preempts the next instance of that bug class by making the canonical rules mechanically observable rather than reviewer-vigilance-enforced.

Two further candidates (period-comparison orchestrator extraction and `useProtectedMutation` adoption sweep) were deferred — they are speculative or post-milestone work, respectively. See the architecture review report for re-evaluation triggers.
