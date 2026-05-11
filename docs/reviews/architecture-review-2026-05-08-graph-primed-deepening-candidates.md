# Architecture Review — Graph-Primed Deepening Candidates

**Date:** 2026-05-08
**Method:** `/improve-codebase-architecture` (Pocock skill) primed with `graphify-out/GRAPH_REPORT.md` + `CONTEXT.md` + `docs/adr/`
**Active milestone:** v2.0 Financial Management & Data Quality (phases 70–80.3, 74.5.1/2, 76, 77 outstanding)
**Audience:** in-depth review (reviewer to challenge sequencing, scope, and ADR conflicts)

Vocabulary throughout follows `.claude/skills/improve-codebase-architecture/LANGUAGE.md` — **module**, **interface**, **seam**, **adapter**, **depth**, **leverage**, **locality** — and `CONTEXT.md` for domain terms (Source / Platform / Order channel; Period P&L / Revenue rollup; WIB business date).

---

## TL;DR

Five deepening candidates surfaced. Recommendation:

| # | Candidate | Verdict | Rationale |
|---|-----------|---------|-----------|
| **1** | **Platform resolver consolidation** | **DO — first** | Active bugs (TikTok→"Tokopedia", K3 Mart vs K3Mart, gobiz/grabfood collapsed wrong, ADR-0001 BigSeller rule unenforced). CONTEXT.md line 104 explicitly names this work. Likely blocks/derisks Phase 76 & 77. |
| **4** | **BOM `isProductionUnit` predicate** | **DO — second** | 5 files filter `category="production"` with 3 different rules. Latent bug class — same shape as the Phase 80.2 cascade-divergence incident. CLAUDE.md rules 10 and 13 mandate it. Small mechanical fix. |
| **3** | **WIB date-string consolidation** | **DO — third** | 4 functions doing the same conversion; only 1 has the NaN guard. Phase 73's "WIB helper consolidation" lesson never fully shipped. Cheap, mechanical, recovers a known lesson. |
| 2 | Period-comparison orchestrator | **DEFER** | Speculative; no current pain. Revisit after Phase 76 (Financial Export) lands — that work likely produces a third clone, at which point the abstraction earns its keep. |
| 5 | `useProtectedMutation` adoption | **DEFER** | ~70 callsites across 9 hook files. High effort, low payoff. Worth doing as a dedicated phase post-v2.0; not a priority while v2.0 is still landing. |

**Net:** three of five candidates are recommended. None contradict an existing ADR; #1 unblocks ADR-0001's BigSeller decision, which currently isn't honored by any of the three platform mappers.

---

## Methodology (1 paragraph)

Graph report flagged 5 "Surprising Connections" plus 5 low-cohesion communities. **Two of the 5 seam hypotheses were edge-direction misreads** (`useAuth → useRecalculateAllCosts` and `fetchInternalOrderDataMap → fetchAndAggregate` — both reversed). One was correct-but-fine (`bucketKey → utcToWibHourStr`). The strongest signals came from low-cohesion clusters and CONTEXT.md's flagged ambiguities — not from the seam hypotheses. Pocock's deletion test was applied to each candidate before recommending.

---

## Recommended sequence

```
Phase A (small, parallel-safe, ship anytime):
  ├── Candidate 4: BOM isProductionUnit predicate         (~1 day, 5 files)
  └── Candidate 3: WIB date-string consolidation          (~1 day, 4 files + tests)

Phase B (single phase, after v2.0 76/77 if not before):
  └── Candidate 1: Platform resolver consolidation        (~3-5 days, ~20 callsites + schema cascade for `Platform` literal type)

Deferred (re-evaluate trigger noted):
  ├── Candidate 2: Period-comparison orchestrator         (re-evaluate after Phase 76 ships)
  └── Candidate 5: useProtectedMutation adoption          (re-evaluate post-v2.0 milestone close)
```

Phases A and B can run independently. Phase A items can run as `gsd-quick` tasks; Phase B warrants `gsd-plan-phase` because of type-cascade risk and the schema-adjacent `Platform` literal union it introduces.

---

## Per-candidate scoring

| Candidate | Bug risk | Effort | v2.0 impact | CONTEXT/ADR alignment | Reversibility | Verdict |
|-----------|----------|--------|-------------|------------------------|---------------|---------|
| 1. Platform resolver | **HIGH** (active) | MEDIUM | HIGH (76, 77) | PERFECT (CONTEXT.md line 104; enables ADR-0001) | MEDIUM (type cascade) | **DO** |
| 2. Period-comparison | LOW | MEDIUM-HIGH | MEDIUM (post-76) | PARTIAL | MEDIUM | DEFER |
| 3. WIB helpers | MEDIUM (latent NaN) | LOW | None | GOOD (CONTEXT.md line 220-223; Phase 73 lesson) | HIGH | **DO** |
| 4. BOM predicate | **HIGH** (latent) | LOW | MEDIUM (77) | GOOD (CLAUDE.md rules 10, 13) | HIGH | **DO** |
| 5. useProtectedMutation | LOW-MEDIUM | HIGH | None | NONE (CLAUDE.md pitfall #10) | HIGH | DEFER |

---

## Detail — DO

### Candidate 1: Collapse three platform resolvers into one Platform module

**Files:**
- `convex/lib/externalSource.ts` (`sourceToPlatform`)
- `convex/reports/channelTaxonomy.ts` (`toDisplayChannel`, `sourceToDisplayChannel`)
- `convex/externalData/helpers/dashboardHelpers.ts` — caller
- ~20 sites across `convex/reports/`, `convex/externalData/`, `src/components/salesAnalytics/`, `src/lib/platformColors.ts`

**Active bugs being repaired:**
1. `sourceToPlatform("tiktok") = "Tokopedia"` while `sourceToDisplayChannel("tiktok") = "TikTok"`. Same input, different display string depending on which file imports which mapper.
2. `sourceToPlatform("k3mart") = "K3 Mart"` (with space) vs `sourceToDisplayChannel("k3mart") = "K3Mart"` (no space). Spreadsheet exports differ from dashboard labels.
3. `sourceToDisplayChannel` collapses both `gobiz` and `grabfood` to `"GoFood"`. CONTEXT.md flagged ambiguity 138 says this is wrong — they are different Platforms (Gojek vs Grab).
4. `sourceToDisplayChannel("bigseller") = "Other"`. ADR-0001 mandates resolution via `underlyingSource` to `Shopee`/`TikTok`. **No mapper today consults `underlyingSource`** — ADR-0001 is documented but unenforced.

**Solution shape:**
- Single deep module at `convex/reports/platform.ts` exporting:
  ```ts
  export type Platform = "Direct" | "GoFood" | "GrabFood" | "Shopee" | "TikTok" | "K3Mart" | "Consignment";
  export function resolvePlatform(row: { source: string; underlyingSource?: string; orderChannel?: string }): Platform;
  export function platformDisplay(p: Platform): string;
  ```
- `Platform` becomes a typed literal union; callers stop passing raw strings.
- Behind the seam: BigSeller fan-out via `underlyingSource`, gobiz/grabfood split, Direct/Consignment touchpoint dis-ambiguation.
- Delete `sourceToPlatform`, `toDisplayChannel`, `sourceToDisplayChannel`. Migrate callers.

**Benefits:**
- *Leverage:* one resolver, one display function. ADR-0001 becomes mechanically enforced.
- *Locality:* TikTok-vs-Tokopedia, GoFood-vs-GrabFood, BigSeller-via-underlying — four bug surfaces collapse into one place.
- *Tests:* one table-driven test exercises every `(source, underlyingSource, orderChannel)` tuple. Today the rules are scattered across three switches and the *interaction* between Order channel and Source can't be tested anywhere.

**Dependency category:** **In-process** (no I/O, pure computation).

**Risks for review to challenge:**
- The `Platform` literal type is schema-adjacent. Callers that currently pass `string` to React props or CSV exports will need typing tightened. Type cascade may be larger than estimated.
- `underlyingSource` schema field doesn't exist yet on `externalRevenue` per CONTEXT.md line 92. **This work either ships before `underlyingSource` lands (with a graceful "missing → inferred" fallback) or after.** Sequencing decision needed.
- Display-string changes (`"Tokopedia"` → `"TikTok"`, `"K3 Mart"` → `"K3Mart"`) are user-visible. Need to confirm with PM that the canonical names in CONTEXT.md (line 102) are the intended display strings.

**Contradicts:** Nothing. Enables ADR-0001 (`0001-bigseller-is-a-source-not-a-platform.md`).

---

### Candidate 4: Centralize the BOM "is production component" predicate

**Files:**
- `convex/reports/productionUnitHelpers.ts` (already deep — `getProductionUnitsPerProduct`, `unitsForOrderItem`, etc.)
- `convex/reports/unitEconomics.ts:458` — duplicates filter
- `convex/externalData/helpers/lifetimeHelpers.ts:26` — *different* filter (no `unit === "pcs"`)
- `convex/staffAttendance/aggregation.ts:186` — *different* filter
- `convex/menuProducts/mutations.ts:52` — *different* filter (`gramsPerUnit !== undefined`)

**Latent bug class:**
CLAUDE.md rules 10 and 13 mandate "All ball type/count information MUST come from BOM. Filter `category="production"`." Five files implement the filter independently with **three different definitions**:
- `category === "production" && unit === "pcs"` (2 files)
- `category === "production"` (2 files)
- `category === "production" && gramsPerUnit !== undefined` (1 file)

If a future production component type is added with `unit === "g"` (per CLAUDE.md rule 10's BOM unification trajectory) or without `gramsPerUnit`, the count of "balls sold" silently disagrees across reports. This is the same bug class as Phase 80.2's retroactive-mapping cascade divergence (per `lessons_phase_80_2_triple_review.md`).

**Solution shape:**
- Export `isProductionUnit(ct: ComponentTypeDoc): boolean` from `convex/reports/productionUnitHelpers.ts` (or `convex/lib/bom.ts`).
- Decide once: is the rule `category === "production"` alone, or `&& unit === "pcs"`? Document in CONTEXT.md under "Cost → COGS chain".
- Replace the 5 hand-rolled filters with the predicate.
- Adoption-only refactor: `productionUnitHelpers.ts` already covers downstream resolution.

**Benefits:**
- *Leverage:* `isProductionUnit(ct)` and `unitsForOrderItem(item, map)` cover the ball-counting need everywhere. No bespoke filter logic per feature.
- *Locality:* the rule "what counts as a production unit" lives in one place. New production types ship cleanly.
- *Tests:* one table-driven test asserts predicate behavior across every shape of `componentTypes` row.

**Dependency category:** **In-process** (pure predicate over typed Doc).

**Risks for review to challenge:**
- The "right" filter definition is a domain question. PM/operations decision: do non-`pcs` production components need to count? Today the 5 files implicitly disagree.

**Contradicts:** Nothing. Honors CLAUDE.md rules 10 and 13 (which today are enforced only by reviewer vigilance).

---

### Candidate 3: Consolidate WIB date-string helpers

**Files:**
- `convex/lib/counter.ts` — `getWibDateStr(ms)` (canonical per CONTEXT.md line 223)
- `convex/lib/periodRange.ts` — `utcToWibDateStr(ms)`
- `convex/gofoodDepot/helpers.ts:52` — `getWibDateString(ms?)` (optional default to `Date.now()`)
- `convex/staffAttendance/flagEngine.ts:31` — `toWibDateString(ms)` (with NaN guard)
- Test file `convex/kitchenShiftRecords/__tests__/summary.test.ts` imports `toWibDateString` directly (locks the duplicate into the test surface)

**Problem:**
Four functions, identical implementation (`new Date(ts + 7h).toISOString().slice(0, 10)`), with subtle behavioral drift:
- `toWibDateString` throws on non-finite input; the others silently return `"Invalid Date"`.
- `getWibDateString` accepts an optional argument with `Date.now()` fallback; the others require a number.
- Naming pattern differs: `get*` vs `to*` vs `utc*`.

CLAUDE.md memory `lessons_phase_73_triple_review.md` flagged this as "WIB helper consolidation" — not fully shipped.

**Solution shape:**
- Promote `toWibDateString`'s NaN-guard semantics into the canonical `getWibDateStr` in `convex/lib/periodRange.ts` (CLAUDE.md memory names this as authoritative).
- Delete the other three; redirect imports.
- Update `summary.test.ts` to import from the canonical location.

**Benefits:**
- *Leverage:* one name across backend.
- *Locality:* NaN guard becomes invariant of every WIB conversion. Offset relocates in one place if multi-tenancy ever lands.
- *Tests:* tests describe behavior at the canonical interface, not at a domain-specific copy.

**Dependency category:** **In-process** (pure computation).

**Risks for review to challenge:**
- Mechanical renames touching imports across ~10 files. Worth a quick `npm run type-check` after each batch.
- Canonical location: `convex/lib/periodRange.ts` (per CLAUDE.md memory) vs `convex/lib/counter.ts` (per CONTEXT.md line 223). These disagree. **CONTEXT.md should be the tiebreaker** — it's the domain-language source of truth.

**Contradicts:** Nothing.

---

## Detail — DEFER

### Candidate 2: Period-comparison orchestrator

**What it is:** Both `convex/reports/incomeStatement.ts:fetchAndAggregate` and `convex/externalData/queries.ts:getPeriodSummary` independently re-implement "fetch revenue current+previous → fetch internal-order data in parallel → run aggregator twice → emit deltas." Aggregators differ; orchestration is identical.

**Why defer:** Speculative — no current pain. The abstraction would help future period-compare features (Phase 76 Financial Export, Phase 77 Data Health Dashboard) but doesn't enable them. Two-implementations is a hypothetical seam. Three-implementations is a real one.

**Re-evaluation trigger:** After Phase 76 ships. If Phase 76 produces a third clone of the orchestration, this candidate becomes a real seam and should be promoted.

**Risk of deferring:** Phase 76 may copy-paste the orchestration once more. That's the cost of the deferral — one more clone, then a 3-way merge. Acceptable; the merge is mechanical.

---

### Candidate 5: `useProtectedMutation` adoption

**What it is:** The deep wrapper `useProtectedMutation` already exists, but ~70 mutation sites across 9 hook files duck around it with hand-rolled `useAuth() + useMutation() + token-check` patterns.

**Why defer:** High effort (~70 callsites), low payoff (no active bug; current code works). Auditing each site to confirm it's a mutation (not a query needing token in args) is labor-intensive.

**Re-evaluation trigger:** Post-v2.0 milestone close. Schedule as a dedicated cleanup phase. Pair with an ESLint rule forbidding direct `user.token` reads in `src/hooks/convex/*Mutation*.ts` files.

**Risk of deferring:** Each new mutation hook risks copying the hand-rolled pattern instead of using the wrapper. Mitigation: add a one-line note to CLAUDE.md pitfall #10 explicitly recommending `useProtectedMutation`.

---

## Investigated and rejected (graph false positives)

For reviewer confidence — these were investigated but did not survive the deletion test:

| Graph claim | Verdict | Reason |
|-------------|---------|--------|
| `useAuth → useRecalculateAllCosts` (seam violation) | **REJECTED** | Direction reversed. Edge is `useRecalculateAllCosts → useAuth`, the normal hook→auth pattern. |
| `fetchInternalOrderDataMap → fetchAndAggregate` (directional reversal) | **REJECTED** | Direction reversed. `incomeStatement.ts` consumes `externalData/queries.ts`, never the reverse. (Surfaced Candidate 2 instead.) |
| `bucketKey → utcToWibHourStr` (suspect seam) | **REJECTED** | Direction is fine; time-bucketing legitimately depends on TZ conversion. |
| God-node `buildArgs()` (16 edges, suspect pass-through) | **REJECTED** | False positive — `buildArgs` is a private helper inside `useAnalytics.ts` with one real invariant (empty array → undefined). The 16 edges were internal calls. |
| God-node `log()` (18 edges) | **REJECTED** | False positive — `log` is a local variable name in test files, not a shared logger. Variable shadowing inflated the edge count. |
| God-node `updateComponentStock()` (9 edges) | **REJECTED** | Already deep. Owns batch query + 3 aggregate computations + UPSERT + stock-existence decision. Small interface, large behavior — exactly the right shape. |
| Communities 0, 1, 2, 4, 9 (low cohesion) | **MOSTLY REJECTED** | Communities 1 and 2 are graph mis-clusterings (consignment hooks + manager override; attendance + auth + dialogs) — concerns are domain-separate. Community 0 surfaced WIB-helper duplication (became Candidate 3). Community 3 (NOT in the prompt's list, but visible in the report) co-located `sourceToDisplayChannel`/`toDisplayChannel` with depreciation/asset/invoice helpers — confirmed the platform-resolver mess (became Candidate 1). |

---

## Open questions for reviewer

1. **Candidate 1 sequencing vs `underlyingSource` schema field.** CONTEXT.md line 92 notes `underlyingSource` is "not yet a schema field; future addition." Do we ship Candidate 1 with a graceful fallback for the field's absence, or wait until the schema field lands? My read: ship now with fallback — the resolver's interface is forward-compatible, and adding the field later is purely additive.
2. **Candidate 1 display-string change.** CONTEXT.md says canonical Platform names are `"TikTok"` (not `"Tokopedia"`) and `"K3Mart"` (no space). These are user-visible. Confirm PM is aligned on the rename, or scope `platformDisplay(p)` to preserve current strings while typing the resolver.
3. **Candidate 4 production-filter rule.** Is the canonical rule `category === "production"` alone, or `&& unit === "pcs"`? Today 5 files implicitly disagree. Need a domain decision before consolidating.
4. **Candidate 3 canonical location.** CLAUDE.md memory says `convex/lib/periodRange.ts`. CONTEXT.md line 223 says `convex/lib/counter.ts`. CONTEXT.md should win (domain-language source of truth) — but worth a sanity check that `counter.ts` is the right place for a generic helper, given its name.
5. **Sequencing 1 vs 4.** Candidate 1 is more impactful but riskier (type cascade). Candidate 4 is smaller and safer. Recommend running 4 first as a warm-up; reviewer may disagree if there's a v2.0 phase that needs Candidate 1 sooner.

---

## What to do with this report

This document is a deepening-candidate audit, not a phase plan. To convert recommendations into work:

```bash
# For Candidates 3 & 4 (small, mechanical):
/gsd-quick "Centralize BOM isProductionUnit predicate per architecture-review-2026-05-08 §Candidate 4"
/gsd-quick "Consolidate WIB date-string helpers per architecture-review-2026-05-08 §Candidate 3"

# For Candidate 1 (warrants a phase):
/gsd-add-phase  # then route to discuss-phase → plan-phase → execute-phase
```

For deferred candidates (2, 5), no action — re-evaluation triggers are noted above.

If this review is rejected on a specific candidate with a load-bearing reason, ask for an ADR so future graph-primed reviews don't re-suggest it (per the skill's protocol).
