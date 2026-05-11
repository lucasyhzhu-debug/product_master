# Phase 82 — Locked Decisions (CONTEXT)

**Captured:** 2026-05-11 from inline scoping conversation post-v2.0 close. No `/gsd-discuss-phase` run — scope was clarified directly via `/gsd-progress` follow-up + AskUserQuestion ratification.

---

## D-01 — Two input streams only; architecture review candidates EXCLUDED

The tech-debt sweep consumes ONLY:
1. The 8 inefficiencies + 8 patterns documented in `.planning/RETROSPECTIVE.md` v2.0 section (commit `f70f50bb`, written 2026-05-11)
2. Fresh `/simplify` findings against the top-5 god nodes from a refreshed `graphify-out/GRAPH_REPORT.md`

**Explicit exclusion:** the 2 deferred candidates from `docs/reviews/architecture-review-2026-05-08-graph-primed-deepening-candidates.md`:
- Candidate 2 — Period-comparison orchestrator extraction
- Candidate 5 — `useProtectedMutation` adoption sweep

User decision (2026-05-11): "don't use the deepening one, just do the ones identified in the retrospective to start off with, but find new ones from the graph for simplify."

**Why this matters for execution:** when Wave 2 synthesizes findings, do NOT cross-reference or auto-import items from the architecture review. Those candidates remain on file but are out-of-scope this round. If a Wave 1 /simplify finding HAPPENS to overlap with one of those candidates, treat it as a /simplify finding (it independently surfaced).

**Re-evaluation trigger:** include the architecture review's deferred candidates in the next tech-debt sweep (v2.1 mid-milestone or v2.2 pre-kickoff). Add a note to PROJECT.md → "Future Roadmap" if dropping is final.

---

## D-02 — God-node selection: top-5 by in-degree, refreshed via Wave 0 graphify

For `/simplify` scope:
- Run `/gsd-graphify` first to refresh `graphify-out/GRAPH_REPORT.md` (current snapshot is pre-Phase 81)
- Identify top-5 god nodes by in-degree (number of files that import from this file)
- Run `/simplify` against those 5 files

User decision (2026-05-11): "Top 5 god nodes from graphify (recommended)" — chose this over the high-churn-files alternative.

**Open scoring tweak (defer to plan-phase):** if pure in-degree produces a stale or unrepresentative top-5 (e.g., utility files that are imported everywhere but have no real complexity), Wave 0 may add a secondary weight: `in_degree × cross_community_coupling × log(file_LOC)`. Decide based on what the refreshed graphify produces.

---

## D-03 — Phase 82 standalone, includes inline shipping (Wave 3)

User selected the recommended option: "Phase 82 standalone, includes Wave 3 (ship ≤2hr wins)."

This means:
- Phase 82 numbers continue from Phase 81 (NOT renamed as v2.1's first phase)
- Phase 82 ships on `main` independently of v2.1 milestone definition
- Wave 3 IS in scope — items meeting Effort ≤2hr + Payoff ≥High + Risk=Low ship inline as atomic commits in a single PR
- Larger items become **proposed v2.1 phases** in `82-TECH-DEBT-PRIORITIZED.md`, NOT shipped here

**Why standalone (not v2.1 phase 1):** preserves separation between "fix the immediate paper cuts" (Phase 82) and "define v2.1 scope" (`/gsd-new-milestone`). v2.1 can absorb Phase 82's findings document as its initial REQUIREMENTS input.

---

## D-04 — Wave 3 ship-inline strict filter

Items qualify for Wave 3 inline shipping ONLY if ALL three conditions hold:
- **Effort ≤ 2 hours** (single-shot fix; no multi-file coordination)
- **Payoff ≥ High** (Critical or High; not Medium or Low)
- **Risk = Low** (no behavior change; mechanical refactor; well-tested area)

Items failing ANY of these gates land in `82-TECH-DEBT-PRIORITIZED.md` as either:
- `v2.1-phase` — large enough to need its own phase
- `v2.2+-backlog` — known but not currently worth scheduling
- `drop-with-rationale` — surfaced but explicitly decided not to fix

**Relaxation safety valve:** if Wave 2 produces fewer than 3 items meeting the strict bar, Wave 3 may relax to **Risk ≤ Medium** (still Effort ≤ 2hr + Payoff ≥ High). Document the relaxation in the SUMMARY.

---

## D-05 — Output documents are the value (find + report > fix this round)

The two artifacts produced — `82-SIMPLIFY-FINDINGS.md` (raw /simplify output) and `82-TECH-DEBT-PRIORITIZED.md` (synthesized + scored + bucketed list) — are the **primary deliverables** of this phase. Wave 3's inline shipping is a bonus that proves the find-report-fix loop works end-to-end.

**Implication for plan-phase:** Wave 2's synthesis quality matters more than Wave 3's commit count. Don't over-optimize for "ship lots of fixes." A well-scored prioritized list with 1 inline fix is BETTER than 5 inline fixes with no prioritized list.

**Implication for verify-work:** UAT focuses on:
- Does `82-TECH-DEBT-PRIORITIZED.md` cover all retrospective inefficiencies + all Wave 1 sniffs? (no orphans)
- Are the bucket recommendations defensible? (sanity check the scoring)
- Did Wave 3 ship items that match D-04 criteria? (no creep)

---

## D-06 — Handoff format: `/gsd-new-milestone` consumes the prioritized doc

When v2.1 kickoff runs `/gsd-new-milestone`, the prioritized doc is an explicit input. The new-milestone questioning should reference items bucketed `v2.1-phase` and ask: "include all of these? subset? rank-order?"

**Concrete handoff path:**
- Phase 82 PR squash-merges with `82-TECH-DEBT-PRIORITIZED.md` landed on main
- User runs `/gsd-new-milestone --input .planning/phases/82-tech-debt-sweep/82-TECH-DEBT-PRIORITIZED.md` (or just references it during questioning)
- v2.1's REQUIREMENTS.md absorbs items as REQ-IDs

If `/gsd-new-milestone` doesn't accept an explicit input flag, add a manual step: paste the v2.1-phase items into the questioning thread.

---

## D-07 — Branch + commit conventions

Per CLAUDE.md:
- **Branch:** `feature/82-tech-debt-sweep` (≤50 chars)
- **Fork from:** `origin/main` (post-`f70f50bb`)
- **Commits:** atomic per fix in Wave 3; conventional prefixes `fix(82):` / `refactor(82):` / `chore(82):` / `docs(82):` / `test(82):`
- **Co-author trailer:** `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- **PR:** squash merge after CI green (matches v2.0 phase pattern)
- **Stage explicit files only** — never `git add -A` (untracked screenshots, prompts/, bigseller-logs.txt etc. exist on the working tree and must NOT enter commits)

Wave 0 + 1 + 2 produce doc-only output (`.planning/` paths) — per CLAUDE.md these CAN go direct to main, BUT for clean phase grouping all Phase 82 commits stay on `feature/82-tech-debt-sweep` until merge.

---

## D-08 — Triple-review opt-in only

`triple_review: false` by default for all Phase 82 plans. The phase is mostly research + small mechanical fixes; type-cascade risk is near zero.

**Override:** if Wave 2 surfaces any item that touches >5 callsites or changes a typed literal union, that item's plan flips to `triple_review: true` per the standard rule from Phase 81's playbook.

---

## D-09 — Phase 82 does NOT close v2.0; v2.0 is already closed

For posterity: v2.0 closed 2026-05-11 via commit `f70f50bb` + tag `v2.0`. Phase 82 is an **interregnum phase** between v2.0 and v2.1, not a late addition to v2.0. ROADMAP.md should reflect this — Phase 82 lands in a new section or under "v2.0 closeout" with a clear "Post-v2.0 interregnum" header.

**Why this matters:** if anyone retroactively asks "was v2.0 16 phases or 17 phases?" the answer is 17 (70-81). Phase 82 is separately accounted for.

---

## D-10 — Memory updates after phase close

After Phase 82 ships:
- Append a Phase 82 lessons file at `memory/lessons_phase_82_tech_debt_sweep.md` if any new patterns surface (especially around /simplify usage discipline or god-node selection methodology)
- Update `MEMORY.md` index pointer to lessons file
- Note any DROPPED items (bucketed `drop-with-rationale`) so they don't resurface in future tech-debt sweeps as "newly discovered"

---

## Handoff to plan-phase

When `/gsd-plan-phase 82` runs:
- This CONTEXT is the source of truth for D-01 through D-10
- No additional questioning needed — proceed directly to PLAN.md generation
- 5 plans expected (one per Wave 0/1/2/3/4)
- The plan-checker should verify Wave 3's atomic-commit discipline + verify Wave 2's scoring rubric is internally consistent
