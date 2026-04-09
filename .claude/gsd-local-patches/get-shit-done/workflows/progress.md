<purpose>
Check project progress, summarize recent work and what's ahead, then intelligently route to the next action — either executing an existing plan or creating the next one. Provides situational awareness before continuing work.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
**Load progress context (paths only):**

```bash
INIT=$(node "./.claude/get-shit-done/bin/gsd-tools.cjs" init progress)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `project_exists`, `roadmap_exists`, `state_exists`, `phases`, `current_phase`, `next_phase`, `milestone_version`, `completed_count`, `phase_count`, `paused_at`, `state_path`, `roadmap_path`, `project_path`, `config_path`.

If `project_exists` is false (no `.planning/` directory):

```
No planning structure found.

Run /gsd:new-project to start a new project.
```

Exit.

If missing STATE.md: suggest `/gsd:new-project`.

**If ROADMAP.md missing but PROJECT.md exists:**

This means a milestone was completed and archived. Go to **Route F** (between milestones).

If missing both ROADMAP.md and PROJECT.md: suggest `/gsd:new-project`.
</step>

<step name="parallel_gather">
**Dispatch 3 parallel sub-agents to gather all data concurrently.**

Launch ALL 3 agents in a SINGLE message using the Agent tool (this makes them run in parallel). Use `subagent_type: "Explore"` for each. Each agent returns structured text that the orchestrator synthesizes in the report step.

**Agent 1 — Roadmap & Phase Status Table:**

Prompt the agent with:
```
You are gathering phase status data for a progress report. Do NOT output commentary — return ONLY the structured format below.

1. Run: node "./.claude/get-shit-done/bin/gsd-tools.cjs" roadmap analyze
   Parse the JSON output to get all phases with their goals and dependencies.
2. Run: node "./.claude/get-shit-done/bin/gsd-tools.cjs" progress bar --raw
3. For each phase from the roadmap output, check its directory in .planning/phases/:
   - Count *-PLAN.md files (glob for *-PLAN.md)
   - Count *-SUMMARY.md files (glob for *-SUMMARY.md)
   - Check if *-CONTEXT.md exists (glob for *-CONTEXT.md)
   - Determine status:
     • "Complete" — summaries >= plans AND plans > 0
     • "In Progress" — plans > 0 AND summaries > 0 AND summaries < plans
     • "Planned" — plans > 0 AND summaries = 0
     • "Discussed" — CONTEXT.md exists but no plans
     • "Pending" — none of the above

Return EXACTLY this format:
PROGRESS_BAR: {bar string}
PHASE_TABLE:
| # | Phase | Status | Key Objective |
|---|-------|--------|---------------|
| {num} | {short name} | {status} | {goal from roadmap, max 60 chars} |
```

**Agent 2 — Recent Work & State Snapshot:**

Prompt the agent with:
```
You are gathering recent work and project state for a progress report. Do NOT output commentary — return ONLY the structured format below.

1. Run: node "./.claude/get-shit-done/bin/gsd-tools.cjs" state-snapshot
   Parse decisions[] and blockers[] from the JSON output.
2. Find the 3 most recent *-SUMMARY.md files across all directories in .planning/phases/ (sort by file modification time).
   For each, run: node "./.claude/get-shit-done/bin/gsd-tools.cjs" summary-extract {path} --fields one_liner
3. Read .planning/config.json and extract the model profile name.
4. Count files in .planning/todos/pending/ (if directory exists).
5. Count active debug sessions: glob .planning/debug/*.md (exclude resolved/ subdirectory).

Return EXACTLY this format:
PROFILE: {quality|balanced|budget}
RECENT_WORK:
- [{phase}-{plan}]: {one_liner}
DECISIONS:
- {decision text}
BLOCKERS:
- {blocker text}
TODO_COUNT: {N}
DEBUG_COUNT: {N}
```

**Agent 3 — Dependency Analysis & Parallelizable Phases:**

Prompt the agent with:
```
You are analyzing phase dependencies for a progress report. Do NOT output commentary — return ONLY the structured format below.

1. Run: node "./.claude/get-shit-done/bin/gsd-tools.cjs" roadmap analyze
   Parse the JSON to get each phase's dependencies list and disk status.
2. A phase is "complete" if its disk_status is "complete" (summaries >= plans > 0).
3. For each NON-complete phase:
   - If it has NO dependencies, or ALL its dependencies are complete → it is "parallelizable"
   - Otherwise → it is "blocked" (list which dependency phases are incomplete)
4. For each parallelizable phase, check its directory to determine available action:
   - No *-CONTEXT.md → action is "discuss" (suggest /gsd:discuss-phase {num})
   - *-CONTEXT.md exists but no *-PLAN.md → action is "plan" (suggest /gsd:plan-phase {num})
   - *-PLAN.md exists but not all have matching *-SUMMARY.md → action is "execute" (suggest /gsd:execute-phase {num})

Return EXACTLY this format:
PARALLELIZABLE:
- Phase {num}: {name} → /gsd:{action} {num}
BLOCKED:
- Phase {num}: {name} — waiting on Phase(s) {dep_nums}
```

**IMPORTANT:** Wait for all 3 agents to complete before proceeding to the report step. Store each agent's returned text for synthesis.
</step>

<step name="report">
**Synthesize all 3 agent results into a single enhanced progress report.**

Combine the structured output from Agent 1, Agent 2, and Agent 3 into this format:

```
# [Project Name] — v{milestone_version}

**Progress:** {PROGRESS_BAR from Agent 1}
**Profile:** {PROFILE from Agent 2}

## Phase Overview

{PHASE_TABLE from Agent 1 — full markdown table}

## Recent Work
{RECENT_WORK lines from Agent 2}

## Current Position
Phase [N] of [total]: [current phase name]

## Key Decisions Made
{DECISIONS from Agent 2}
(Omit section if empty)

## Blockers/Concerns
{BLOCKERS from Agent 2}
(Omit section if empty)

## Pending Todos
- {TODO_COUNT from Agent 2} pending — /gsd:check-todos to review
(Omit section if count = 0)

## Active Debug Sessions
- {DEBUG_COUNT from Agent 2} active — /gsd:debug to continue
(Omit section if count = 0)

## Ready to Work In Parallel
These phases have no blocking dependencies — you can discuss or plan them simultaneously:
{PARALLELIZABLE list from Agent 3, each with its /gsd: command suggestion}

Blocked phases:
{BLOCKED list from Agent 3}
(Omit blocked sub-section if empty)

## What's Next
[Next action suggestion — determined by the route step below]
```

</step>

<step name="route">
**Determine next action based on verified counts.**

**Step 1: Count plans, summaries, and issues in current phase**

List files in the current phase directory:

```bash
ls -1 .planning/phases/[current-phase-dir]/*-PLAN.md 2>/dev/null | wc -l
ls -1 .planning/phases/[current-phase-dir]/*-SUMMARY.md 2>/dev/null | wc -l
ls -1 .planning/phases/[current-phase-dir]/*-UAT.md 2>/dev/null | wc -l
```

State: "This phase has {X} plans, {Y} summaries."

**Step 1.5: Check for unaddressed UAT gaps**

Check for UAT.md files with status "diagnosed" (has gaps needing fixes).

```bash
# Check for diagnosed UAT with gaps
grep -l "status: diagnosed" .planning/phases/[current-phase-dir]/*-UAT.md 2>/dev/null
```

Track:
- `uat_with_gaps`: UAT.md files with status "diagnosed" (gaps need fixing)

**Step 2: Route based on counts**

| Condition | Meaning | Action |
|-----------|---------|--------|
| uat_with_gaps > 0 | UAT gaps need fix plans | Go to **Route E** |
| summaries < plans | Unexecuted plans exist | Go to **Route A** |
| summaries = plans AND plans > 0 | Phase complete | Go to Step 3 |
| plans = 0 | Phase not yet planned | Go to **Route B** |

---

**Route A: Unexecuted plan exists**

Find the first PLAN.md without matching SUMMARY.md.
Read its `<objective>` section.

```
---

## ▶ Next Up

**{phase}-{plan}: [Plan Name]** — [objective summary from PLAN.md]

`/gsd:execute-phase {phase}`

<sub>`/clear` first → fresh context window</sub>

---
```

---

**Route B: Phase needs planning**

Check if `{phase_num}-CONTEXT.md` exists in phase directory.

**If CONTEXT.md exists:**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}
<sub>✓ Context gathered, ready to plan</sub>

`/gsd:plan-phase {phase-number}`

<sub>`/clear` first → fresh context window</sub>

---
```

**If CONTEXT.md does NOT exist:**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}

`/gsd:discuss-phase {phase}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase {phase}` — skip discussion, plan directly
- `/gsd:list-phase-assumptions {phase}` — see Claude's assumptions

---
```

---

**Route E: UAT gaps need fix plans**

UAT.md exists with gaps (diagnosed issues). User needs to plan fixes.

```
---

## ⚠ UAT Gaps Found

**{phase_num}-UAT.md** has {N} gaps requiring fixes.

`/gsd:plan-phase {phase} --gaps`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:execute-phase {phase}` — execute phase plans
- `/gsd:verify-work {phase}` — run more UAT testing

---
```

---

**Step 3: Check milestone status (only when phase complete)**

Read ROADMAP.md and identify:
1. Current phase number
2. All phase numbers in the current milestone section

Count total phases and identify the highest phase number.

State: "Current phase is {X}. Milestone has {N} phases (highest: {Y})."

**Route based on milestone status:**

| Condition | Meaning | Action |
|-----------|---------|--------|
| current phase < highest phase | More phases remain | Go to **Route C** |
| current phase = highest phase | Milestone complete | Go to **Route D** |

---

**Route C: Phase complete, more phases remain**

Read ROADMAP.md to get the next phase's name and goal.

```
---

## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/gsd:discuss-phase {Z+1}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:plan-phase {Z+1}` — skip discussion, plan directly
- `/gsd:verify-work {Z}` — user acceptance test before continuing

---
```

---

**Route D: Milestone complete**

```
---

## 🎉 Milestone Complete

All {N} phases finished!

## ▶ Next Up

**Complete Milestone** — archive and prepare for next

`/gsd:complete-milestone`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/gsd:verify-work` — user acceptance test before completing milestone

---
```

---

**Route F: Between milestones (ROADMAP.md missing, PROJECT.md exists)**

A milestone was completed and archived. Ready to start the next milestone cycle.

Read MILESTONES.md to find the last completed milestone version.

```
---

## ✓ Milestone v{X.Y} Complete

Ready to plan the next milestone.

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → roadmap

`/gsd:new-milestone`

<sub>`/clear` first → fresh context window</sub>

---
```

</step>

<step name="edge_cases">
**Handle edge cases:**

- Phase complete but next phase not planned → offer `/gsd:plan-phase [next]`
- All work complete → offer milestone completion
- Blockers present → highlight before offering to continue
- Handoff file exists → mention it, offer `/gsd:resume-work`
  </step>

</process>

<success_criteria>

- [ ] 3 parallel agents dispatched in a SINGLE message (not sequential)
- [ ] Phase Overview table shown with status per phase (Pending/Discussed/Planned/In Progress/Complete)
- [ ] Parallelizable phases listed with suggested /gsd: commands
- [ ] Rich context provided (recent work, decisions, issues)
- [ ] Current position clear with visual progress
- [ ] What's next clearly explained
- [ ] Smart routing: /gsd:execute-phase if plans exist, /gsd:plan-phase if not
- [ ] User confirms before any action
- [ ] Seamless handoff to appropriate gsd command
      </success_criteria>
