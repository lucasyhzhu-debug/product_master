---
name: triple-review
description: Use when completing a feature branch and wanting thorough parallel review before merge. Triggers on: "review this branch", "pre-merge review", "triple review", "review before merging".
---

<objective>
Dispatch 3 independent code review agents in parallel, synthesize their findings into a severity-tiered report, implement fixes, and surface lessons for memory.

**Orchestrator role:** Gather git context, spawn 3 reviewers simultaneously, wait for all to complete, cross-reference findings, triage by severity, drive fixes.
</objective>

<context>
Arguments: $ARGUMENTS
- First arg (optional): base branch for diff (default: `origin/main`)
- Remaining args (optional): plan file path(s) to pass to reviewers
</context>

<process>

## 0. Gather Git Context

```bash
BASE=${1:-origin/main}
BRANCH=$(git branch --show-current)
SLUG=$(echo "$BRANCH" | tr '/' '-')
TODAY=$(date +%Y-%m-%d)
git log --oneline ${BASE}..HEAD
git rev-parse ${BASE} HEAD
git diff --stat ${BASE}..HEAD -- '*.ts' '*.tsx'
```

Extract: `branch`, `slug`, `base_sha`, `head_sha`, `commit_list`, `changed_files`.

## 1. Auto-detect Supporting Files

```bash
# Plan files for current phase (infer phase number from branch name)
PHASE=$(echo "$BRANCH" | grep -oP '\d+' | head -1)
ls .planning/phases/${PHASE}-*/*.md 2>/dev/null | grep -i plan
ls .planning/phases/${PHASE}-*/*.md 2>/dev/null | head -10

# Design docs
ls docs/plans/*.md 2>/dev/null | sort -r | head -5

# Prior reviews for this branch/phase
ls docs/reviews/*${PHASE}*.md 2>/dev/null | sort -r | head -3
```

Collect: `plan_files`, `design_docs`, `prior_reviews`. Use these as `files_to_read` in agent prompts.

## 2. Spawn 3 Review Agents in Parallel

Launch all three with `run_in_background: true`. Do NOT wait between spawns.

---

### Agent 1 — Requirements & Business Logic Reviewer

```
Task(
  prompt="""
<objective>
Review Phase {phase} implementation on branch `{branch}` for plan compliance,
financial/business logic correctness, and architectural patterns.
</objective>

<context>
Base: {base_sha}
Head: {head_sha}
Branch: {branch}
Commits:
{commit_list}

Changed files:
{changed_files}
</context>

<files_to_read>
{plan_files}
{design_docs}
{prior_reviews}
</files_to_read>

<focus>
1. Plan compliance — does implementation match every requirement in the plan?
2. Business logic — financial calculations, aggregations, data flows correct?
3. Architectural patterns — follows project conventions (Convex patterns, auth, hooks)?
4. Confidence scoring — flag any logic that is inferred vs exact
5. Missing pieces — requirements in the plan with no corresponding implementation
</focus>

<output_format>
Return findings as a markdown list grouped by:
## REQUIREMENTS_REVIEWER FINDINGS
### Critical (plan violations or incorrect logic)
### Important (partial compliance, pattern deviations)
### Minor (small gaps)
### Nitpick (style, naming, optional improvements)

End with: ## REQUIREMENTS_REVIEWER COMPLETE
</output_format>
""",
  subagent_type="superpowers:code-reviewer",
  description="Review {branch}: requirements & business logic",
  run_in_background=true
)
```

---

### Agent 2 — Code Quality Reviewer

```
Task(
  prompt="""
<objective>
Review code quality, bugs, performance, security, and conventions for branch `{branch}`.
</objective>

<context>
Base: {base_sha}
Head: {head_sha}
Branch: {branch}
Changed files:
{changed_files}
</context>

<files_to_read>
Read each changed file fully. Also read CLAUDE.md for project conventions.
</files_to_read>

<focus>
1. Bugs & logic errors — off-by-ones, wrong conditions, incorrect data handling
2. Security — missing auth checks (requireRole), unvalidated inputs, exposed internals
3. Performance — N+1 queries (use Promise.all), expensive computations, missing indexes
4. Code quality — dead code, unclear naming, missing error handling, type safety holes
5. Test quality — coverage gaps, missing edge cases, brittle assertions
6. Project conventions — camelCase fields, hook patterns, Convex anti-patterns (dynamic imports, hooks after early returns)
</focus>

<output_format>
Return findings as a markdown list grouped by:
## CODE_QUALITY_REVIEWER FINDINGS
### Critical (bugs, security issues, missing auth)
### Important (performance, quality issues)
### Minor (conventions, clarity)
### Nitpick (style preferences)

End with: ## CODE_QUALITY_REVIEWER COMPLETE
</output_format>
""",
  subagent_type="code-reviewer",
  description="Review {branch}: code quality & bugs",
  run_in_background=true
)
```

---

### Agent 3 — Staff/Principal Engineer Reviewer

```
Task(
  prompt="""
<objective>
Perform a senior engineer review of the implementation on branch `{branch}`,
focusing on plan-to-implementation fidelity and architectural risks.
Then write the review report to disk.
</objective>

<context>
Branch: {branch}
Changed files:
{changed_files}
</context>

<files_to_read>
{plan_files}
{design_docs}
{prior_reviews}
CLAUDE.md
docs/CODE_STYLE.md
</files_to_read>

<focus>
1. Plan fidelity — what was planned vs what was built; gaps, scope creep, shortcuts
2. Design doc compliance — does implementation honour architectural decisions?
3. Architectural risks — coupling, real-time subscription load, schema implications
4. Missing pieces — planned items absent from the diff
5. Over-engineering — unnecessary complexity relative to the requirement
</focus>

<output>
Write full review to: docs/reviews/staffreview-{slug}-{today}.md
Use the staffreview report format (sections: Summary, Critical Issues, Improvements, Refinements).
</output>

<output_format>
Also return inline summary:
## STAFFREVIEW FINDINGS
### Critical
### Important
### Minor
### Nitpick

End with: ## STAFFREVIEW COMPLETE
</output_format>
""",
  subagent_type="general-purpose",
  description="Review {branch}: staff/principal engineer review",
  run_in_background=true
)
```

## 3. Wait for All 3 Agents

Do not proceed until all three return `## [REVIEWER] COMPLETE` signals. If any agent errors, note it and continue synthesis with the findings available.

## 4. Synthesize Findings

Cross-reference all three result sets:

**Priority rules:**
- Flagged by 2+ reviewers → bump to highest tier claimed
- Only 1 reviewer → keep at claimed tier

**Severity tiers (output order):**
1. **Critical** — bugs, missing auth, plan violations, incorrect calculations. Must fix before merge.
2. **Important** — performance (N+1), pattern deviations, partial compliance. Fix before merge.
3. **Minor** — clarity, minor gaps, style. Fix if quick; document if deferred.
4. **Nitpick** — preferences, optional polish. Mention only, do not block.

Present unified report:

```
## Triple Review — {branch}
Date: {today}
Reviewers: requirements-reviewer · code-quality-reviewer · staffreview

### Critical ({n})
- [C1] {finding} — flagged by: {reviewers}
...

### Important ({n})
- [I1] {finding} — flagged by: {reviewers}
...

### Minor ({n})
...

### Nitpick ({n})
...

### Consensus Issues (2+ reviewers)
List items where ≥2 reviewers flagged the same root concern.
```

## 5. Implement Fixes

Ask the user: "Implement Critical + Important fixes now?"

If yes:
- Fix Critical items first, one at a time
- Commit after each logical group: `fix: {description}`
- Run `npm run type-check` after all fixes
- Run `npm run build` before final commit

If no: summarise fixes as a checklist the user can action manually.

## 6. Document Lessons

Append findings worth retaining to `~/.claude/projects/D--Claude-Product-Manager-product-master/memory/MEMORY.md` under an appropriate heading (e.g., "## Lessons from Phase {phase} Review"). Include only patterns that recur or that are non-obvious.

</process>

<success_criteria>
- [ ] All 3 agents spawned in parallel
- [ ] All 3 agents completed before synthesis
- [ ] Unified report produced with severity tiers
- [ ] Consensus issues (2+ reviewers) called out explicitly
- [ ] Staffreview saved to docs/reviews/
- [ ] Fixes implemented or checklist handed to user
- [ ] Lessons documented to memory
</success_criteria>
