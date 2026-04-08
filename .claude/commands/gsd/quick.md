---
name: gsd:quick
description: Execute a quick task with full quality gates by default (plan-checking, verification, triple-review, simplify). Use --quick to skip optional agents.
argument-hint: "[--quick] [--validate] [--discuss] [--research]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---
<objective>
Execute small, ad-hoc tasks with GSD guarantees (atomic commits, STATE.md tracking).

Quick mode is the same system with a shorter path:
- Spawns gsd-planner (quick mode) + gsd-executor(s)
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md "Quick Tasks Completed" table (NOT ROADMAP.md)

**Default:** Enables the complete quality pipeline — discussion + research + plan-checking + verification. Full quality gates run unless you opt out.

**`--discuss` flag:** Lightweight discussion phase before planning. Surfaces assumptions, clarifies gray areas, captures decisions in CONTEXT.md. Use when the task has ambiguity worth resolving upfront.

**`--quick` flag:** Skips research, discussion, plan-checker, verifier. Use when you know exactly what to do and want to skip optional agents.

**`--validate` flag:** Enables plan-checking (max 2 iterations) and post-execution verification only. Use when you want quality guarantees without discussion or research.

**`--research` flag:** Spawns a focused research agent before planning. Investigates implementation approaches, library options, and pitfalls for the task. Use when you're unsure of the best approach.

Granular flags are composable: `--discuss --research --validate` gives the same result as the default (full pipeline).
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/quick.md
</execution_context>

<context>
$ARGUMENTS

Context files are resolved inside the workflow (`init quick`) and delegated via `<files_to_read>` blocks.
</context>

<process>
Execute the quick workflow from @D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/quick.md end-to-end.
Preserve all workflow gates (validation, task description, planning, execution, state updates, commits).
</process>
