---
name: gsd:debug
description: Systematic debugging with persistent state across context resets
argument-hint: [--diagnose] [issue description]
allowed-tools:
  - Read
  - Bash
  - Task
  - AskUserQuestion
---

<objective>
Debug issues using scientific method with subagent isolation.

**Orchestrator role:** Gather symptoms, spawn gsd-debugger agent, handle checkpoints, spawn continuations.

**Why subagent:** Investigation burns context fast (reading files, forming hypotheses, testing). Fresh 200k context per investigation. Main context stays lean for user interaction.

**Flags:**
- `--diagnose` — Diagnose only. Find root cause without applying a fix. Returns a structured Root Cause Report. Use when you want to validate the diagnosis before committing to a fix.
</objective>

<available_agent_types>
Valid GSD subagent types (use exact names — do not fall back to 'general-purpose'):
- gsd-debugger — Diagnoses and fixes issues
</available_agent_types>

<context>
User's issue: $ARGUMENTS

Parse flags from $ARGUMENTS:
- If `--diagnose` is present, set `diagnose_only=true` and remove the flag from the issue description.
- Otherwise, `diagnose_only=false`.

Check for active sessions:
```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```
</context>

<process>

## 0. Initialize Context

```bash
INIT=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" state load)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract `commit_docs` from init JSON. Resolve debugger model:
```bash
debugger_model=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" resolve-model gsd-debugger --raw)
```

## 1. Check Active Sessions

If active sessions exist AND no $ARGUMENTS:
- List sessions with status, hypothesis, next action
- User picks number to resume OR describes new issue

If $ARGUMENTS provided OR user describes new issue:
- Continue to symptom gathering

## 2. Gather Symptoms (if new issue)

Use AskUserQuestion for each:

1. **Expected behavior** - What should happen?
2. **Actual behavior** - What happens instead?
3. **Error messages** - Any errors? (paste or describe)
4. **Timeline** - When did this start? Ever worked?
5. **Reproduction** - How do you trigger it?

After all gathered, confirm ready to investigate.

## 2.5. Task Tree

After gathering symptoms (or loading existing session), create explicit tasks for ALL phases using `TaskCreate`:

```
TaskCreate("Debug investigation")
TaskCreate("Triple review (/triple-review)", blockedBy: [debug_task])    # Step 6a
TaskCreate("Simplify (/simplify)", blockedBy: [triple_review_task])      # Step 6b
TaskCreate("Document and merge", blockedBy: [simplify_task])             # Step 7
```

Only create quality gate tasks if code changes are expected (i.e., `find_and_fix` mode, not `diagnose` mode). Update each task to `in_progress`/`completed` as work progresses. If a step is skipped (config disabled or no code changes), mark its task `completed` with a skip note.

## 3. Spawn gsd-debugger Agent

Fill prompt and spawn:

```markdown
<objective>
Investigate issue: {slug}

**Summary:** {trigger}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: true
goal: {if diagnose_only: "find_root_cause_only", else: "find_and_fix"}
</mode>

<debug_file>
Create: .planning/debug/{slug}.md
</debug_file>
```

```
Task(
  prompt=filled_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  description="Debug {slug}"
)
```

## 4. Handle Agent Return

**If `## ROOT CAUSE FOUND` (diagnose-only mode):**
- Display root cause, confidence level, files involved, and suggested fix strategies
- Offer options:
  - "Fix now" — spawn a continuation agent with `goal: find_and_fix` to apply the fix (see step 5)
  - "Plan fix" — suggest `/gsd-plan-phase --gaps`
  - "Manual fix" — done

**If `## DEBUG COMPLETE` (find_and_fix mode):**
- Display root cause and fix summary
- Offer options:
  - "Plan fix" — suggest `/gsd-plan-phase --gaps` if further work needed
  - "Done" — proceed to Step 6 (quality gates) and Step 7 (document and merge)

**If `## CHECKPOINT REACHED`:**
- Present checkpoint details to user
- Get user response
- If checkpoint type is `human-verify`:
  - If user confirms fixed: continue so agent can finalize/resolve/archive
  - If user reports issues: continue so agent returns to investigation/fixing
- Spawn continuation agent (see step 5)

**If `## INVESTIGATION INCONCLUSIVE`:**
- Show what was checked and eliminated
- Offer options:
  - "Continue investigating" - spawn new agent with additional context
  - "Manual investigation" - done
  - "Add more context" - gather more symptoms, spawn again

## 5. Spawn Continuation Agent (After Checkpoint or "Fix now")

When user responds to checkpoint OR selects "Fix now" from diagnose-only results, spawn fresh agent:

```markdown
<objective>
Continue debugging {slug}. Evidence is in the debug file.
</objective>

<prior_state>
<files_to_read>
- .planning/debug/{slug}.md (Debug session state)
</files_to_read>
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: find_and_fix
</mode>
```

```
Task(
  prompt=continuation_prompt,
  subagent_type="gsd-debugger",
  model="{debugger_model}",
  description="Continue debug {slug}"
)
```

</process>

## 6. Quality Gates

**Skip if:** The fix was resolved via "Plan fix" or "Manual fix" options (no code changes made by this workflow).

### 6a. Triple Review

```bash
TRIPLE_REVIEW=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.triple_review --raw 2>/dev/null || echo "false")
```

**If `TRIPLE_REVIEW` is `true`:**
- Spawn staffreview sub-agent with `.agent/skills/staffreview/SKILL.md` to review the fix
- Route all findings (Critical + Important + Refinements) back for revision if needed

**If `TRIPLE_REVIEW` is `false`:** Skip.

### 6b. Simplify

```bash
SIMPLIFY=$(node "D:/Claude/Product Manager/product_master/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.simplify --raw 2>/dev/null || echo "true")
```

**If `SIMPLIFY` is `true` (default):**
- Review changed code for reuse, quality, and efficiency
- Fix any issues found

**If `SIMPLIFY` is `false`:** Skip.

## 7. Document and Merge

**Skip if:** Currently on `main` branch (no branch to merge).

### 7a. Update CHANGELOG.md

Add an entry for the debug fix:
```bash
# Prepend entry to docs/CHANGELOG.md under the current version heading
```

### 7b. Push and Create PR

```bash
git push origin HEAD
gh pr create --title "fix: {slug}" --body "Debug fix for: {issue_description}"
```

### 7c. Squash-merge and Sync

```bash
gh pr merge --squash --delete-branch
git switch main && git pull
```

<success_criteria>
- [ ] Active sessions checked
- [ ] Symptoms gathered (if new)
- [ ] gsd-debugger spawned with context
- [ ] Checkpoints handled correctly
- [ ] Root cause confirmed before fixing
- [ ] Triple review passed (if workflow.triple_review enabled and fix applied)
- [ ] Simplify review passed (if workflow.simplify enabled and fix applied)
- [ ] CHANGELOG.md updated (if on feature branch and fix applied)
- [ ] PR created and merged (if on feature branch and fix applied)
</success_criteria>
