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
INIT=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" init progress)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `project_exists`, `roadmap_exists`, `state_exists`, `phases`, `current_phase`, `next_phase`, `milestone_version`, `completed_count`, `phase_count`, `paused_at`, `state_path`, `roadmap_path`, `project_path`, `config_path`.

```bash
DISCUSS_MODE=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.discuss_mode 2>/dev/null || echo "discuss")
```

If `project_exists` is false (no `.planning/` directory):

```
No planning structure found.

Run /gsd-new-project to start a new project.
```

Exit.

If missing STATE.md: suggest `/gsd-new-project`.

**If ROADMAP.md missing but PROJECT.md exists:**

This means a milestone was completed and archived. Go to **Route F** (between milestones).

If missing both ROADMAP.md and PROJECT.md: suggest `/gsd-new-project`.
</step>

<step name="parallel_gather">
**Dispatch 3 parallel Explore sub-agents in a SINGLE message to gather all progress data concurrently.**

### Agent 1: Roadmap & Phase Status Table

Prompt:
```
1. Run: node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap analyze
2. Run: node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" progress bar --raw
3. For each phase in the roadmap JSON, check the phase directory:
   - Does {phase_dir}/{padded_phase}-CONTEXT.md exist? (context gathered)
   - How many *-PLAN.md files? (plans created)
   - How many *-SUMMARY.md files? (plans executed)
4. Build a Phase Overview status table:
   | Phase | Name | Status | Plans | Context |
   |-------|------|--------|-------|---------|
   | 1 | Foundation | Complete (3/3) | 3 PLANs, 3 SUMMARYs | Yes |
   | 2 | Core Features | In Progress (1/2) | 2 PLANs, 1 SUMMARY | Yes |
   | 3 | Polish | Planned | 0 PLANs | No |
5. Return: roadmap JSON, progress bar string, phase status table
```

### Agent 2: Recent Work & State Snapshot

Prompt:
```
1. Run: node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" state-snapshot
2. Find the 3 most recent SUMMARY.md files (by modification time)
3. For each, run: node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" summary-extract <path> --fields one_liner
4. Count pending todos: node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" init todos 2>/dev/null || echo "0"
5. Count active debug sessions: (ls .planning/debug/*.md 2>/dev/null || true) | grep -v resolved | wc -l
6. Read user profile if exists: .planning/PROFILE.md
7. Return: state snapshot JSON, recent summaries array, todo count, debug session count, profile summary
```

### Agent 3: Dependency Analysis

Prompt:
```
1. Read ROADMAP.md and parse "Depends on:" entries for each phase
2. Build a dependency graph: which phases block which
3. Identify parallelizable phases: phases whose dependencies are all complete
4. Suggest appropriate /gsd: commands for each actionable phase:
   - No CONTEXT.md -> /gsd-discuss-phase N
   - Has CONTEXT but no PLANs -> /gsd-plan-phase N
   - Has unexecuted PLANs -> /gsd-execute-phase N
   - All PLANs have SUMMARYs -> phase complete
5. Return: dependency map, parallelizable phases list, suggested commands
```

**Dispatch all 3 agents as parallel Explore calls in one message.** Wait for all to return before proceeding to report step.
</step>

<step name="report">
**Synthesize outputs from all 3 parallel agents into a rich status report.**

Present:

```
# [Project Name]

**Progress:** {PROGRESS_BAR from Agent 1}
**Profile:** [quality/balanced/budget/inherit]
**Discuss mode:** {DISCUSS_MODE}

## Phase Overview
{Phase status table from Agent 1}

| Phase | Name | Status | Plans | Context |
|-------|------|--------|-------|---------|
| ... | ... | ... | ... | ... |

## Recent Work
- [Phase X, Plan Y]: [what was accomplished - 1 line from Agent 2 summary-extract]
- [Phase X, Plan Z]: [what was accomplished - 1 line from Agent 2 summary-extract]
- [Phase X, Plan W]: [what was accomplished - 1 line from Agent 2 summary-extract]

## Current Position
Phase [N] of [total]: [phase-name]
Plan [M] of [phase-total]: [status]
CONTEXT: [checkmark if has_context | - if not]

## Key Decisions Made
- [extract from Agent 2 state snapshot decisions[]]

## Blockers/Concerns
- [extract from Agent 2 state snapshot blockers[]]

## Pending Todos
- [count from Agent 2] pending -- /gsd-check-todos to review

## Active Debug Sessions
- [count from Agent 2] active -- /gsd-debug to continue
(Only show this section if count > 0)

## Ready to Work In Parallel
{From Agent 3: phases whose dependencies are satisfied and can be worked on now}

| Phase | Name | Suggested Command |
|-------|------|-------------------|
| {N} | {name} | `/gsd-{command} {N}` |

## What's Next
[Next phase/plan objective from Agent 1 roadmap analyze]
[Dependency context from Agent 3 if relevant]
```

</step>

<step name="route">
**Determine next action based on verified counts.**

**Step 1: Count plans, summaries, and issues in current phase**

List files in the current phase directory:

```bash
(ls -1 .planning/phases/[current-phase-dir]/*-PLAN.md 2>/dev/null || true) | wc -l
(ls -1 .planning/phases/[current-phase-dir]/*-SUMMARY.md 2>/dev/null || true) | wc -l
(ls -1 .planning/phases/[current-phase-dir]/*-UAT.md 2>/dev/null || true) | wc -l
```

State: "This phase has {X} plans, {Y} summaries."

**Step 1.5: Check for unaddressed UAT gaps**

Check for UAT.md files with status "diagnosed" (has gaps needing fixes).

```bash
# Check for diagnosed UAT with gaps or partial (incomplete) testing
grep -l "status: diagnosed\|status: partial" .planning/phases/[current-phase-dir]/*-UAT.md 2>/dev/null || true
```

Track:
- `uat_with_gaps`: UAT.md files with status "diagnosed" (gaps need fixing)
- `uat_partial`: UAT.md files with status "partial" (incomplete testing)

**Step 1.6: Cross-phase health check**

Scan ALL phases in the current milestone for outstanding verification debt using the CLI (which respects milestone boundaries via `getMilestonePhaseFilter`):

```bash
DEBT=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" audit-uat --raw 2>/dev/null)
```

Parse JSON for `summary.total_items` and `summary.total_files`.

Track: `outstanding_debt` — `summary.total_items` from the audit.

**If outstanding_debt > 0:** Add a warning section to the progress report output (in the `report` step), placed between "## What's Next" and the route suggestion:

```markdown
## Verification Debt ({N} files across prior phases)

| Phase | File | Issue |
|-------|------|-------|
| {phase} | {filename} | {pending_count} pending, {skipped_count} skipped, {blocked_count} blocked |
| {phase} | {filename} | human_needed — {count} items |

Review: `/gsd-audit-uat ${GSD_WS}` — full cross-phase audit
Resume testing: `/gsd-verify-work {phase} ${GSD_WS}` — retest specific phase
```

This is a WARNING, not a blocker — routing proceeds normally. The debt is visible so the user can make an informed choice.

**Step 2: Route based on counts**

| Condition | Meaning | Action |
|-----------|---------|--------|
| uat_partial > 0 | UAT testing incomplete | Go to **Route E.2** |
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

`/clear` then:

`/gsd-execute-phase {phase} ${GSD_WS}`

---
```

---

**Route B: Phase needs planning**

Check if `{phase_num}-CONTEXT.md` exists in phase directory.

Check if current phase has UI indicators:

```bash
PHASE_SECTION=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap get-phase "${CURRENT_PHASE}" 2>/dev/null)
PHASE_HAS_UI=$(echo "$PHASE_SECTION" | grep -qi "UI hint.*yes" && echo "true" || echo "false")
```

**If CONTEXT.md exists:**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}
<sub>✓ Context gathered, ready to plan</sub>

`/clear` then:

`/gsd-plan-phase {phase-number} ${GSD_WS}`

---
```

**If CONTEXT.md does NOT exist AND phase has UI (`PHASE_HAS_UI` is `true`):**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}

`/clear` then:

`/gsd-discuss-phase {phase}` — gather context and clarify approach

---

**Also available:**
- `/gsd-ui-phase {phase}` — generate UI design contract (recommended for frontend phases)
- `/gsd-plan-phase {phase}` — skip discussion, plan directly
- `/gsd-list-phase-assumptions {phase}` — see Claude's assumptions

---
```

**If CONTEXT.md does NOT exist AND phase has no UI:**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from ROADMAP.md}

`/clear` then:

`/gsd-discuss-phase {phase} ${GSD_WS}` — gather context and clarify approach

---

**Also available:**
- `/gsd-plan-phase {phase} ${GSD_WS}` — skip discussion, plan directly
- `/gsd-list-phase-assumptions {phase} ${GSD_WS}` — see Claude's assumptions

---
```

---

**Route E: UAT gaps need fix plans**

UAT.md exists with gaps (diagnosed issues). User needs to plan fixes.

```
---

## ⚠ UAT Gaps Found

**{phase_num}-UAT.md** has {N} gaps requiring fixes.

`/clear` then:

`/gsd-plan-phase {phase} --gaps ${GSD_WS}`

---

**Also available:**
- `/gsd-execute-phase {phase} ${GSD_WS}` — execute phase plans
- `/gsd-verify-work {phase} ${GSD_WS}` — run more UAT testing

---
```

---

**Route E.2: UAT testing incomplete (partial)**

UAT.md exists with `status: partial` — testing session ended before all items resolved.

```
---

## Incomplete UAT Testing

**{phase_num}-UAT.md** has {N} unresolved tests (pending, blocked, or skipped).

`/clear` then:

`/gsd-verify-work {phase} ${GSD_WS}` — resume testing from where you left off

---

**Also available:**
- `/gsd-audit-uat ${GSD_WS}` — full cross-phase UAT audit
- `/gsd-execute-phase {phase} ${GSD_WS}` — execute phase plans

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

Check if next phase has UI indicators:

```bash
NEXT_PHASE_SECTION=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap get-phase "$((Z+1))" 2>/dev/null)
NEXT_HAS_UI=$(echo "$NEXT_PHASE_SECTION" | grep -qi "UI hint.*yes" && echo "true" || echo "false")
```

**If next phase has UI (`NEXT_HAS_UI` is `true`):**

```
---

## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/clear` then:

`/gsd-discuss-phase {Z+1}` — gather context and clarify approach

---

**Also available:**
- `/gsd-ui-phase {Z+1}` — generate UI design contract (recommended for frontend phases)
- `/gsd-plan-phase {Z+1}` — skip discussion, plan directly
- `/gsd-verify-work {Z}` — user acceptance test before continuing

---
```

**If next phase has no UI:**

```
---

## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/clear` then:

`/gsd-discuss-phase {Z+1} ${GSD_WS}` — gather context and clarify approach

---

**Also available:**
- `/gsd-plan-phase {Z+1} ${GSD_WS}` — skip discussion, plan directly
- `/gsd-verify-work {Z} ${GSD_WS}` — user acceptance test before continuing

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

`/clear` then:

`/gsd-complete-milestone ${GSD_WS}`

---

**Also available:**
- `/gsd-verify-work ${GSD_WS}` — user acceptance test before completing milestone

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

`/clear` then:

`/gsd-new-milestone ${GSD_WS}`

---
```

</step>

<step name="edge_cases">
**Handle edge cases:**

- Phase complete but next phase not planned → offer `/gsd-plan-phase [next] ${GSD_WS}`
- All work complete → offer milestone completion
- Blockers present → highlight before offering to continue
- Handoff file exists → mention it, offer `/gsd-resume-work ${GSD_WS}`
  </step>

</process>

<success_criteria>

- [ ] 3 parallel Explore agents dispatched and results synthesized
- [ ] Phase Overview table with per-phase status displayed
- [ ] Rich context provided (recent work, decisions, issues)
- [ ] Current position clear with visual progress bar
- [ ] Parallelizable phases identified with suggested commands
- [ ] What's next clearly explained
- [ ] Smart routing: /gsd-execute-phase if plans exist, /gsd-plan-phase if not
- [ ] User confirms before any action
- [ ] Seamless handoff to appropriate gsd command
      </success_criteria>
