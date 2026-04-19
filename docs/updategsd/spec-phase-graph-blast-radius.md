# updateGSD request: add blast-radius scout to spec-phase workflow

**Drafted:** 2026-04-19
**Target:** `~/.claude/get-shit-done/workflows/spec-phase.md`
**Feed this file to:** `/updateGSD`

---

Add an optional "blast radius scout" step to spec-phase.md so the Socratic interview is grounded in graph data, not just grep.

## Target file

`~/.claude/get-shit-done/workflows/spec-phase.md`

## Problem

spec-phase's Step 2 scouts the codebase via grep only. For phases that touch hot-path code (integration refactors, schema changes, cross-cutting mutations), this misses blast radius — the Researcher perspective asks "what exists today" but gets no structural signal on coupling or downstream fan-out. Result: acceptance criteria get locked before the author realizes the mutation has 20+ callers.

The project already has graphify installed (`.planning/graphs/graph.json`, queryable via `node <gsd-tools> graphify query <term>`). CLAUDE.md tells the assistant to consult `GRAPH_REPORT.md` manually, but the workflow doesn't actually invoke it. Bolt it into the workflow.

## Change

Insert a new "Step 2.5: Graph Blast Radius Scout" between the existing Step 2 (Scout Codebase) and Step 3 (First Ambiguity Assessment). Spec:

1. **Gate on graphify state.** Run `node <gsd-tools-path> graphify status`. If the status shows `exists: false` OR graphify is disabled in config (`graphify.enabled !== true`), SKIP the step entirely with one log line: `[spec-phase] graphify not available — using grep-only scout`. Continue to Step 3. Do NOT prompt the user to build the graph — spec-phase is interactive enough already; a missing graph is a degraded mode, not a blocker.

2. **Extract anchor symbols.** From the grep-based scout in Step 2, collect 3–6 names the assistant identified as "integration points where new code will connect." These are the anchors. If Step 2 surfaced fewer than 3 anchors, skip the step (not enough signal).

3. **Query the graph per anchor.** For each anchor symbol, run `node <gsd-tools-path> graphify query <anchor>` and parse the JSON output. Collect: incoming edge count, outgoing edge count, community membership, god-node flag if present.

4. **Compose blast radius synthesis.** Produce a short internal note — NOT shown to the user — summarizing the top-3 highest-fan-out anchors, the god nodes touched, and any anchors that belong to multiple communities (cross-community refactors carry the highest blast radius). The assistant keeps this note as grounding material for the Researcher and Boundary Keeper rounds.

5. **Use the synthesis to seed Round 1 questions.** Researcher-perspective questions in Round 1 should now reference specific high-fan-out symbols instead of generic "what exists today." Example: instead of "What triggers this work?", ask "Symbol X has 17 callers across 4 modules — the phase goal implies refactoring it. Which of those 17 call sites are in scope for this phase, and which should remain on the legacy path behind a flag?"

6. **Feed the synthesis into ambiguity scoring.** Boundary Clarity's minimum (0.70) should implicitly require the user has a position on each cross-community caller surfaced in step 4. If Boundary Clarity remains below 0.70 after Round 3 and the user has not addressed the graph-surfaced cross-community callers, Round 5/6 questions should target those specifically.

## Failure modes to handle

- Graph is stale (built days ago, code has moved): still use it — stale blast radius is better than no blast radius. Log `[spec-phase] warning: graph last built <date>; blast radius may be stale`.
- Anchor query returns no matches: log and continue, don't block.
- Graphify CLI errors: swallow and skip the step; never surface a stack trace to the user.

## Out of scope for this update

- Do NOT modify discuss-phase, plan-phase, or research-phase. If spec-phase's integration works well, extend later as a separate updateGSD pass.
- Do NOT add a "build the graph now" prompt — that adds interactive friction and spec-phase already has max 6 rounds of questions.
- Do NOT require the graph — it's an optional enrichment, not a gate.
- Do NOT change the ambiguity scoring formula or dimension weights. Only the *questions asked to lift scores* change; the math stays the same.
- Do NOT expose raw graph JSON to the user. The synthesis is internal scaffolding that shapes the interview; the user sees better questions, not graph dumps.

## Patch documentation

In the change note, record:
- Which workflow changed (spec-phase.md only)
- One-sentence motivation (blast radius grounding for refactor-heavy phases)
- Backward-compat confirmation (graphify disabled/absent → same behavior as before)
- Follow-up opportunity: extend to research-phase.md if spec-phase integration proves out

## Success criteria

- spec-phase.md gains a Step 2.5 block between existing Step 2 and Step 3
- Step 2.5 is gated on `graphify.enabled === true` AND graph file exists
- No existing step is modified or removed
- The `--auto` path still works: if Step 2.5 runs in --auto mode, it produces the internal synthesis without any user prompts
- If graphify is disabled in config, the workflow runs identically to today (verified by diff against pre-change behavior)
- Template files (`~/.claude/get-shit-done/templates/spec.md`) are NOT modified
- Critical rules list gains one new entry: "When graphify is available, Round 1 Researcher questions must reference at least one graph-surfaced anchor symbol"
