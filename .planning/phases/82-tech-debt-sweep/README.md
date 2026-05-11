# Phase 82: Tech-Debt Sweep & Simplification

**Status:** Pre-spec (CONTEXT scaffolded; ready for `/gsd-plan-phase` after Wave 0 graphify refresh).

**Created:** 2026-05-11

**Type:** Spike + targeted fixes — interregnum phase between v2.0 (closed 2026-05-11) and v2.1 (TBD). Runs on `main` independently of v2.1 milestone definition.

**Sequencing:** `v2.0 closed ✓ → 82 (this phase) → /gsd-new-milestone (v2.1 kickoff, informed by 82's findings)`

The findings document (`82-TECH-DEBT-PRIORITIZED.md`) is intended to feed v2.1's REQUIREMENTS.md and ROADMAP — items bucketed as "v2.1 phase" become candidate phase entries; items bucketed as "v2.2+ backlog" land in PROJECT.md's Future Roadmap section.

---

## Goal

Produce a prioritized tech-debt fix list by combining two input streams, then ship the no-brainer wins inline.

**Input streams:**
1. **Retrospective seeds** (known) — the 8 inefficiencies + 8 patterns documented in `.planning/RETROSPECTIVE.md` v2.0 section (just written 2026-05-11). These are the surfaced-but-not-yet-fixed items from v2.0 execution.
2. **Fresh `/simplify` findings** (new) — run `/simplify` against top-5 god nodes from a refreshed `graphify-out/GRAPH_REPORT.md`. Catalog code smells (duplication, dead code, unclear naming, missing reuse) without auto-fixing.

**NOT inputs:** the 2 deferred candidates from `docs/reviews/architecture-review-2026-05-08-graph-primed-deepening-candidates.md` (Candidate 2 period orchestrator, Candidate 5 useProtectedMutation sweep). User-decided exclusion 2026-05-11 — focus on retrospective + fresh sniffs only this round.

---

## Scope

### In scope

- **Wave 0 — Refresh inputs (15 min).** Re-run `/gsd-graphify` to regenerate `graphify-out/GRAPH_REPORT.md`. Identify top-5 god nodes from the updated report (highest in-degree + cross-community coupling).
- **Wave 1 — /simplify pass (45 min, parallel).** Run `/simplify` against the 5 god-node files identified in Wave 0. **Catalog only** — produce `82-SIMPLIFY-FINDINGS.md` with severity-tiered list per file. Do NOT auto-fix.
- **Wave 2 — Synthesize + score (60 min).** Combine Wave 1 sniffs with the 8 retrospective inefficiencies. Score each item by **Effort** (≤2hr / 1d / multi-day) × **Payoff** (Critical / High / Medium / Low) × **Risk** (low / medium / high). Output: `82-TECH-DEBT-PRIORITIZED.md` — table sorted by Payoff/Effort ratio with bucketing recommendation per item.
- **Wave 3 — Ship the obvious wins (4-8 hr).** Filter to items with **Effort ≤2hr AND Payoff ≥High AND Risk = Low**. These are no-brainer wins — spawn fix executors per item, atomic commits per fix, single PR at end.
- **Wave 4 — Handoff to v2.1 planning.** Larger items become **proposed v2.1 phase entries** in the prioritized doc. The doc is the input to `/gsd-new-milestone` for v2.1 scope.

### Out of scope (explicit)

- **Architecture review deferred candidates** (Candidates 2 + 5 from the 2026-05-08 graph-primed review). User-decided exclusion this round; revisit when next architectural review fires.
- **Per-phase lessons triage** (the `memory/lessons*.md` files). Lessons are guidance for FUTURE phases, not tech-debt items in their own right. Some lesson PATTERNS may surface as sniffs via /simplify, which is fine — but no separate lesson-mining task.
- **Code coverage improvements / new test additions.** Test debt is a separate concern; this sweep is about CODE quality, not TEST quality. If /simplify identifies an untested code path, log it for v2.1 backlog but do not fix in Wave 3.
- **Documentation drift.** The CHANGELOG/SCHEMA/API_REFERENCE updates from Phase 81-04 are recent. Doc drift is not in scope unless surfaced by a /simplify finding (e.g., comment that contradicts code).
- **Performance optimization.** Phase 80.1 already did the analytics perf consolidation. Performance debt is its own discipline; not in scope.

### Inputs to consume

| Source | What it gives | Status |
|---|---|---|
| `.planning/RETROSPECTIVE.md` v2.0 § "What Was Inefficient" | 8 known inefficiencies | Already written (just landed in commit `f70f50bb`) |
| `.planning/RETROSPECTIVE.md` v2.0 § "Patterns Established" | 8 patterns to retroactively enforce | Already written |
| `graphify-out/GRAPH_REPORT.md` | God nodes + community structure | NEEDS REFRESH (Wave 0) — last run pre-Phase 81 |
| `/simplify` skill | Mechanical code smells per file | Run in Wave 1 against top-5 god nodes |

---

## Success criteria (what must be TRUE)

1. **`82-SIMPLIFY-FINDINGS.md` exists** with /simplify output for each of the 5 god-node files. Each finding has file:line, severity, brief description, suggested fix.
2. **`82-TECH-DEBT-PRIORITIZED.md` exists** with all retrospective inefficiencies + all Wave 1 sniffs scored. Table format: `| Item | Source | Effort | Payoff | Risk | Bucket | Notes |`. Bucket values: `ship-inline`, `v2.1-phase`, `v2.2+-backlog`, `drop-with-rationale`.
3. **At least 3 items shipped inline** (Wave 3) — items meeting Effort ≤2hr + Payoff ≥High + Risk=Low. Atomic commits, single PR.
4. **At least 2 items proposed as v2.1 phases** in the prioritized doc — clearly stated as phase candidates with goal + estimated plan count.
5. **No new bugs introduced.** `npm run type-check && npm run lint && npm run test && npm run build` all pass after Wave 3.
6. **Phase ships on `main` via PR** matching the v2.0 phase pattern (squash merge, tagged commit message).

---

## Recommended execution pipeline

```
1. /gsd-spec-phase 82           (optional — scope is already locked in CONTEXT)
2. /gsd-discuss-phase 82        (optional — decisions are pre-locked, see 82-CONTEXT.md)
3. /gsd-plan-phase 82            ← START HERE
   → Plans expected:
     - 82-00-PLAN.md — Wave 0: Refresh graphify, identify top-5 god nodes
     - 82-01-PLAN.md — Wave 1: /simplify pass against 5 god-node files
     - 82-02-PLAN.md — Wave 2: Synthesize + score combined findings
     - 82-03-PLAN.md — Wave 3: Ship the no-brainer wins (≤2hr each)
     - 82-04-PLAN.md — Wave 4: Handoff doc + v2.1 phase candidates
4. /gsd-execute-phase 82
5. /gsd-verify-work 82           (UAT on shipped wins; sanity check on prioritized doc)
```

Wave 0 + Wave 1 + Wave 2 are research-heavy (doc-only output). Wave 3 is the only code-touching wave — apply standard branch + PR rules per CLAUDE.md.

---

## Branch

Single feature branch: `feature/82-tech-debt-sweep` (≤50 chars; safe under Windows path budget).

---

## Open questions for plan-phase

These come from the inline scoping conversation 2026-05-11; resolve in `/gsd-plan-phase` if they remain:

1. **Wave 3 ship-inline filter strictness.** "Effort ≤2hr AND Payoff ≥High AND Risk=Low" — is this too strict? Consider relaxing Risk to `≤medium` if Wave 2 produces <3 items meeting the strict bar.
2. **God-node selection method in Wave 0.** Pure in-degree from graph report? Or in-degree × cross-community-coupling? Or also weight by file LOC?
3. **`/simplify` output format.** Single combined `82-SIMPLIFY-FINDINGS.md` or one file per god node? Recommendation: one combined doc — easier for Wave 2 synthesis.
4. **Should `82-TECH-DEBT-PRIORITIZED.md` be the input to `/gsd-new-milestone` for v2.1?** Or just an artifact that informs the milestone questioning. Recommendation: explicit input — pass the path to `/gsd-new-milestone`.

---

## Why this phase exists (one paragraph for posterity)

v2.0 closed 2026-05-11 with 17 phases shipped and a comprehensive retrospective documenting 8 inefficiencies that surfaced during execution (REQUIREMENTS.md drift, STATE.md staleness, CONTEXT-vs-PATTERNS scope drift, dual-ROADMAP duplication, no WIP limits, Phase 77 placeholder bumping, etc.). These are the kind of debt that compounds invisibly: each is a paper cut, but together they slow every subsequent phase. Combining the retrospective seeds with a fresh `/simplify` pass over the most-coupled files (god nodes from `graphify-out/GRAPH_REPORT.md`) produces a prioritized list that informs v2.1 scope BEFORE the milestone is defined — preventing v2.1 from starting on the same drift v2.0 ended with. The phase ships the obvious wins inline (≤2hr / High-payoff / Low-risk) and hands off the rest as v2.1 phase candidates.
