# updateGSD request: add blast-radius scout to discuss-phase and research-phase workflows

**Drafted:** 2026-04-19
**Targets:**
- `~/.claude/get-shit-done/workflows/discuss-phase.md`
- `~/.claude/get-shit-done/workflows/research-phase.md`

**Feed this file to:** `/updateGSD`

**Companion patch (already applied):** [spec-phase-graph-blast-radius.md](./spec-phase-graph-blast-radius.md) — PATCHES.md Patch 1. Re-use its CLI contract, gate semantics, and failure-mode policy verbatim. This request extends the same pattern downstream.

---

Extend the graph blast-radius scout pattern — already wired into `spec-phase.md` — to the two downstream workflows where it has the highest marginal value: `discuss-phase.md` (implementation-choice interview) and `research-phase.md` (how-to-implement research that feeds `plan-phase`). Keep `plan-phase.md` untouched because it consumes RESEARCH.md + PATTERNS.md transitively; adding a third scout there would duplicate `gsd-pattern-mapper`'s structural analysis.

## Targets

- `~/.claude/get-shit-done/workflows/discuss-phase.md`
- `~/.claude/get-shit-done/workflows/research-phase.md`

**Explicitly NOT touched by this request:**
- `~/.claude/get-shit-done/workflows/plan-phase.md`
- `~/.claude/get-shit-done/workflows/spec-phase.md` (already patched)
- Any file under `~/.claude/agents/` (no agent definition changes — all integration is via Task prompt context blocks)
- Any file under `~/.claude/get-shit-done/templates/`

## Problem

spec-phase's blast-radius scout surfaces fan-in/fan-out and cross-community coupling BEFORE requirements lock. That signal has to be recomputed in each downstream session because spec-phase's synthesis is deliberately internal-to-session (per PATCHES.md Patch 1: "NOT shown to the user"). Concretely:

1. **discuss-phase** interviews the user about implementation choices (cutover vs flag-gate, rename vs deprecate, where seams live). Its `scout_codebase` step uses grep to find "Integration points — where new code would connect (routes, nav, providers)." Grep tells you *what exists*. It does not tell you *how far it reaches*. The user answers "cutover is fine" without seeing that the touched symbol has 34 callers in 3 communities — and locks a decision that should have been flag-gated.

2. **research-phase** spawns `gsd-phase-researcher` to write RESEARCH.md (consumed by `plan-phase`). The agent gets phase context, requirements, state, and optional CONTEXT.md — but no structural coupling signal. Its recommendations on "how to implement" miss the blast radius entirely. Downstream planning inherits the gap.

Both workflows should persist (not just use internally) the blast-radius synthesis. Unlike spec-phase — whose SPEC.md is intentionally minimal and carries only falsifiable requirements — CONTEXT.md and RESEARCH.md both already carry supporting implementation context (code_context section, research findings), so there is a natural home for the synthesis. Downstream agents (planner, researcher-from-research-phase) benefit without re-querying.

## Change 1 — discuss-phase.md

Insert a new step `scout_graph_blast_radius` between the existing `scout_codebase` step and the existing `analyze_phase` step.

**Exact insertion anchor:**
- After the closing `</step>` of `<step name="scout_codebase">` (which ends around the "Store as internal `<codebase_context>` for use in analyze_phase" line)
- Before the opening `<step name="analyze_phase">`

**Step content:**

1. **Gate on graphify state.** Same gate as spec-phase Patch 1: run `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify status`. Skip this entire step if:
   - `disabled: true`
   - `exists: false`
   - CLI error / non-zero exit

   On skip: log ONE line — `[discuss-phase] graphify not available — skipping blast radius scout` — and jump straight to `analyze_phase`. Do NOT prompt the user to build the graph. discuss-phase is already interactive (6+ rounds possible).

   If `stale: true`: proceed anyway. Log once — `[discuss-phase] warning: graph last built {last_build}; blast radius may be stale`.

2. **Extract anchor symbols.** Pull 3–8 anchors from the `<codebase_context>` accumulated in `scout_codebase`:
   - "Integration points" names (highest priority — these are where new code lands)
   - "Reusable assets" names (medium priority — high-reuse components are structural hubs)
   - Grep-hit file names that map to exported symbols

   If fewer than 3 anchors surface, skip the step (log `[discuss-phase] fewer than 3 anchors — skipping graph scout`).

3. **Query the graph per anchor.** For each anchor: `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify query "${anchor}"`. Collect `incoming_edge_count`, `outgoing_edge_count`, distinct `community` values, god-node flag. Swallow errors and no-matches; never surface stack traces.

4. **Compose blast radius synthesis.** Unlike spec-phase, this synthesis IS shown to the user AND persisted. Build a small markdown table:

   ```
   ## Blast Radius (from graphify)

   | Anchor | Fan-in | Fan-out | Communities | God-node |
   |--------|--------|---------|-------------|----------|
   | {symbol} | {n} | {n} | {comma-separated community IDs or 1} | {yes/no} |
   ```

   Sort by fan-in descending. Keep to the top 5 rows (noise suppression).

5. **Use synthesis to shape `analyze_phase` and `discuss_areas`.**
   - In `analyze_phase` step, when generating gray areas: any anchor with fan-in ≥ 10 OR cross-community (communities > 1) MUST produce a gray area with label pattern "How do we touch {symbol} — cutover, flag-gate, or split?" This becomes a non-negotiable discussion item.
   - In `discuss_areas` step, when formulating options: annotate options that touch high-blast-radius anchors with `(touches {symbol}: {fan-in} callers across {n} modules)`.

6. **Persist into CONTEXT.md.** In the `write_context` step, extend the `<code_context>` section template with a new `### Blast Radius` subsection that contains the table from step 4. Downstream (planner, researcher) reads CONTEXT.md and inherits the data without re-querying.

   The `write_context` step template currently has:
   ```
   <code_context>
   ## Existing Code Insights

   ### Reusable Assets
   ### Established Patterns
   ### Integration Points

   </code_context>
   ```

   Add a fourth subsection after Integration Points:
   ```
   ### Blast Radius (from graphify)
   [The markdown table from scout_graph_blast_radius, or "Not computed — graphify unavailable at discussion time" if step was skipped]
   ```

**`--auto`, `--all`, `--power`, `--chain` compatibility:** The step runs identically under all modes. No user prompts introduced — it's silent data collection. `--auto` does NOT bypass the gate; if graphify is disabled, the step skips in `--auto` just like interactive.

**`--power` note:** In power mode (questions pre-generated), the blast radius scout runs during question generation and its data enriches the generated questions file. No separate interactive hook needed.

## Change 2 — research-phase.md

Insert a new step `## Step 3.5: Graph Blast Radius Scout (optional)` between the existing `## Step 3: Gather Phase Context` and `## Step 4: Spawn Researcher`, AND modify the Step 4 Task prompt to include the synthesis.

**Exact insertion anchors:**
- Insert new step after the closing of Step 3 (after the `AGENT_SKILLS_RESEARCHER=...` bash block)
- Before `## Step 4: Spawn Researcher`
- Modify the Task prompt inside Step 4 to include a new `<graph_blast_radius>` block in its `<additional_context>` section

**Step 3.5 content:**

1. **Prefer inheritance from CONTEXT.md.** If a CONTEXT.md exists at `.planning/phases/${PHASE}-*/CONTEXT.md` AND it contains a `### Blast Radius` subsection (written by discuss-phase Change 1 above), read that subsection verbatim. Skip steps 2–4 below and jump to step 5 with the inherited data. Log: `[research-phase] reusing blast radius from CONTEXT.md`.

   This is the primary path — typical workflow runs discuss-phase before research-phase, so the data is already computed. Zero duplication.

2. **Standalone gate (fallback).** If no CONTEXT.md exists or its `### Blast Radius` subsection is absent, fall back to a standalone scout. Same gate as spec-phase Patch 1 (`disabled` / `exists: false` / CLI error → skip with one log line). Same stale handling.

3. **Anchor extraction (fallback path).** In standalone mode, anchors come from:
   - Phase goal description (ROADMAP.md)
   - Noun phrases in REQUIREMENTS.md for this phase
   - Recent work symbols in STATE.md

   This is coarser than discuss-phase's anchors because there's no `scout_codebase` run — acceptable because the CONTEXT.md path is preferred.

4. **Query + synthesize (fallback path).** Same as spec-phase Patch 1: `graphify query <anchor>` per anchor, collect fan-in/fan-out/communities/god-node, compose markdown table (top 5 by fan-in).

5. **Pass synthesis into the researcher Task prompt.** In Step 4's existing Task prompt, add a new block inside `<additional_context>`:

   ```
   <graph_blast_radius>
   {The markdown table — either inherited from CONTEXT.md or computed standalone}

   INSTRUCTIONS FOR RESEARCHER:
   - If any anchor has fan-in ≥ 10 OR spans multiple communities, your RESEARCH.md
     MUST include a "Blast Radius" section that names the anchor, cites the fan-in
     count, and proposes at least one risk-mitigation approach (flag-gate, incremental
     migration, adapter pattern, or equivalent) for each high-blast-radius touch.
   - If graphify was unavailable, note it and proceed without this section.
   </graph_blast_radius>
   ```

   This turns the synthesis into an actionable directive for the agent — not just context.

**`--auto` compatibility:** Step 3.5 has no user-facing prompts. `--auto` runs it identically.

## Failure modes to handle

Reuse spec-phase Patch 1's failure-mode policy verbatim for both workflows:

- Graph is stale: use it, log stale warning, do not block.
- Anchor query returns no matches: log per anchor, continue.
- Graphify CLI errors: swallow, skip the step, never surface a stack trace.
- CONTEXT.md exists but has no `### Blast Radius` subsection (phase predates this patch): research-phase falls through to standalone scout — do not error.
- CONTEXT.md is malformed or unreadable: research-phase falls through to standalone scout.

Additional discuss-phase-specific failure modes:
- User runs `--power` mode: step runs during question generation; data enriches generated questions file. Do not attempt interactive prompts.
- User resumes from `*-DISCUSS-CHECKPOINT.json`: if the checkpoint was written before this patch landed, CONTEXT.md on resume will just get `Not computed — graphify unavailable at discussion time` in the Blast Radius subsection. Do NOT try to backfill — the discussion is mid-flight.

## Out of scope for this update

- Do NOT modify `plan-phase.md`. Planner inherits blast radius via RESEARCH.md / CONTEXT.md transitively; a third scout would duplicate `gsd-pattern-mapper`.
- Do NOT modify `spec-phase.md` again — Patch 1 already shipped.
- Do NOT modify any agent definition file under `~/.claude/agents/`. All integration happens via the Task prompt `<graph_blast_radius>` block.
- Do NOT modify templates under `~/.claude/get-shit-done/templates/`.
- Do NOT change `<ambiguity_model>` or scoring math in any workflow — same no-math-changes rule as Patch 1.
- Do NOT add a "build the graph now" prompt in either workflow.
- Do NOT require the graph — optional enrichment only, same as Patch 1.
- Do NOT expose raw graph JSON to the user in either workflow. For discuss-phase the markdown table IS shown (it's useful for the interview); for research-phase the synthesis flows to the agent and lands in RESEARCH.md, not as a conversational aside.

## Patch documentation

Update `~/.claude/gsd-local-patches/PATCHES.md` to add two new entries (Patch 2 and Patch 3), following the same structure established by Patch 1:

- **Patch 2:** `discuss-phase.md — insert scout_graph_blast_radius step + extend CONTEXT.md template`
  - Motivation (1 sentence): grep scout surfaces what exists; graph scout surfaces how far it reaches — implementation-choice interviews lock safer decisions when fan-in is visible.
  - Backward-compat: graphify disabled/absent → same behavior as before (one log line, skip step).
  - Follow-up opportunity: if pattern holds, consider exposing the table back to the user as a "before we start, here's the terrain" read-out before the first round of questions.

- **Patch 3:** `research-phase.md — insert Step 3.5 + enrich Task prompt with <graph_blast_radius>`
  - Motivation (1 sentence): gsd-phase-researcher had no coupling signal; inheriting discuss-phase's blast radius (or computing standalone) gives its recommendations blast-radius-aware mitigations.
  - Backward-compat: if no CONTEXT.md blast radius AND graphify disabled → step skips, Task prompt omits the block, agent behavior identical to pre-patch.
  - Follow-up opportunity: if blast-radius citations start showing up consistently in RESEARCH.md, consider asking `gsd-phase-researcher` agent definition to formalize the "Blast Radius" section — right now it's prompt-driven.

Both patches share Patch 1's CLI dependency (`graphify status`, `graphify query`) and config dependency (`.planning/config.json` → `graphify.enabled === true`).

## Success criteria

### discuss-phase.md

- New `<step name="scout_graph_blast_radius">` inserted between `scout_codebase` and `analyze_phase`
- Gate on `graphify status` (disabled / exists:false / CLI error → skip with single log line)
- Stale graph → proceed + warning log
- Requires ≥3 anchors from `<codebase_context>`, else skip
- Per-anchor `graphify query` collects fan-in, fan-out, communities, god-node flag
- Synthesis is a markdown table (top 5 by fan-in)
- `analyze_phase` promotes any anchor with fan-in ≥ 10 OR cross-community into a mandatory gray area
- `discuss_areas` annotates option descriptions with per-anchor fan-in counts when relevant
- `write_context` step's CONTEXT.md template gains `### Blast Radius (from graphify)` subsection inside `<code_context>`
- `--auto` / `--all` / `--chain` / `--power` / `--text` all respect the gate and run the step silently
- When graphify is disabled or not built, behavior is byte-identical to pre-patch EXCEPT for one log line and a placeholder `Not computed` line in CONTEXT.md
- Zero modifications to `<ambiguity_model>`, `<interview_perspectives>`, or scoring math (this workflow has none, but no other logic changes either)
- No template file modifications (`~/.claude/get-shit-done/templates/*` untouched)

### research-phase.md

- New `## Step 3.5: Graph Blast Radius Scout (optional)` inserted between Step 3 and Step 4
- Primary path: read `### Blast Radius` from existing CONTEXT.md (zero re-query)
- Fallback path: standalone scout with same gate/anchor/query/synthesis behavior as spec-phase Patch 1
- Step 4 Task prompt gains `<graph_blast_radius>` block inside `<additional_context>` with: (a) the markdown table and (b) explicit instructions telling the researcher to write a "Blast Radius" section in RESEARCH.md when any anchor has fan-in ≥ 10 or spans multiple communities
- `--auto` path behaves identically (no prompts introduced)
- When graphify is disabled AND no CONTEXT.md blast radius exists, the Task prompt omits the `<graph_blast_radius>` block entirely — researcher behavior identical to pre-patch
- Zero agent definition changes (`~/.claude/agents/gsd-phase-researcher.md` untouched)
- Zero template changes

### PATCHES.md

- Gains Patch 2 (discuss-phase) and Patch 3 (research-phase), each with file / purpose / anchor / dependencies / content / verification blocks matching Patch 1's format
- Total patch count: 3 entries

### Global

- No files outside the GSD scope listed in the `/updateGSD` objective are modified
- No agent files touched
- No template files touched
- Critical-rules lists in each workflow gain one new entry each:
  - **discuss-phase.md** `<critical_rules>` (if present; discuss-phase does not currently have a critical_rules block — if absent, do NOT invent one; instead make the blast-radius rule the first item of the existing `<scope_guardrail>` section's "CRITICAL" bullet list)
  - **research-phase.md**: this file has no `<critical_rules>` or equivalent section — the directive lives in the Task prompt instructions inside Step 4 (see Change 2 step 5)

## Implementation hints for the agent applying this request

- Apply Change 1 (discuss-phase) first. It's the larger edit and establishes the `### Blast Radius` subsection format that research-phase inherits.
- Then apply Change 2 (research-phase). Verify its CONTEXT.md read path looks for the exact subsection header `### Blast Radius` that Change 1 writes.
- When editing discuss-phase's `write_context` template, keep the existing `<code_context>` subsections in the same order — just append the new one. Do not reorder.
- When editing research-phase's Step 4 Task prompt, find the exact `<additional_context>` block and insert the new `<graph_blast_radius>` child before the closing `</additional_context>` (or as a sibling if the block uses flat tags).
- Verify every change with grep, per the `/updateGSD` process. The following phrases should all appear after the edits:
  - `scout_graph_blast_radius` (discuss-phase.md, ≥1 match)
  - `### Blast Radius` (discuss-phase.md, ≥1 match — in the CONTEXT.md template)
  - `Step 3.5: Graph Blast Radius Scout` (research-phase.md, ≥1 match)
  - `<graph_blast_radius>` (research-phase.md, ≥1 match — inside the Task prompt)
  - `reusing blast radius from CONTEXT.md` (research-phase.md, ≥1 match)
