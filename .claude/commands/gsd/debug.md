---
name: gsd:debug
description: Systematic debugging with persistent state across context resets
argument-hint: [issue description]
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
</objective>

<context>
User's issue: $ARGUMENTS

Check for active sessions:
```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```
</context>

<process>

## 0. Initialize Context

```bash
INIT=$(node "./.claude/get-shit-done/bin/gsd-tools.cjs" state load)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract `commit_docs` from init JSON. Resolve debugger model:
```bash
debugger_model=$(node "./.claude/get-shit-done/bin/gsd-tools.cjs" resolve-model gsd-debugger --raw)
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
goal: find_and_fix
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

**If `## ROOT CAUSE FOUND`:**
- Display root cause and evidence summary
- Offer options:
  - "Fix now" - spawn fix subagent → after fix, run quality gates (step 6) then document & merge (step 7)
  - "Plan fix" - suggest /gsd:plan-phase --gaps
  - "Manual fix" - done

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

## 5. Spawn Continuation Agent (After Checkpoint)

When user responds to checkpoint, spawn fresh agent:

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

## 6. Quality Gates (After Fix Applied)

**Skip if:** fix was "Plan fix" or "Manual fix" (no code changes in this session).

After the fix subagent completes and commits:

**6a. Triple review:**

```bash
TRIPLE_REVIEW=$(node "./.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.triple_review 2>/dev/null || echo "false")
```

If `TRIPLE_REVIEW` is `"true"`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► TRIPLE REVIEW — DEBUG FIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn triple-review sub-agent (same pattern as execute-phase). Fix Critical + Important findings before proceeding.

**6b. Simplify:**

```bash
SIMPLIFY=$(node "./.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.simplify 2>/dev/null || echo "true")
```

If `SIMPLIFY` is `"true"`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► SIMPLIFY — DEBUG FIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn simplify sub-agent. If fixes applied, commit with `refactor: apply simplify cleanup for {slug} fix`.

## 7. Document and Merge (After Quality Gates)

**Skip if:** current branch is `main` (debug ran directly on main).

**7a. Update CHANGELOG.md:**

Add entry under `[Unreleased]`:

```markdown
### Bug Fix: {issue title} — {date}

**For the team:** {1-2 sentence non-technical summary of what was broken and how it's fixed}

#### Fixed
- {root cause and fix summary from debug session}

#### Tests
- {test evidence}
```

Commit: `docs: add changelog entry for {slug} fix`

**7b. Push and create PR:**

```bash
git push origin "$(git branch --show-current)" -u
gh pr create --title "fix: {short description}" --body "$(cat <<'EOF'
## Summary
- **Root cause:** {from debug session}
- **Fix:** {what was changed}

## Test plan
- [x] {test evidence}
- [x] npm run build passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**7c. Squash-merge and sync:**

```bash
gh pr merge {PR_NUMBER} --squash --delete-branch
git checkout main && git pull origin main
```

Report: `PR #{N} merged. Local main synced.`

</process>

<success_criteria>
- [ ] Active sessions checked
- [ ] Symptoms gathered (if new)
- [ ] gsd-debugger spawned with context
- [ ] Checkpoints handled correctly
- [ ] Root cause confirmed before fixing
- [ ] (fix applied) Triple review run if config enabled
- [ ] (fix applied) Simplify pass run if config enabled
- [ ] (feature branch) CHANGELOG.md updated, PR created and merged
</success_criteria>
