# Staff Review: Phase 35 — Schema Review & Audit

**Date:** 2026-03-05
**Reviewer:** Staff Engineer Agent
**Plans reviewed:** 35-01-PLAN.md, 35-02-PLAN.md

## Summary

Phase 35 proposes a two-plan approach: Plan 01 produces a comprehensive audit report (`docs/SCHEMA_AUDIT.md`) covering all 59 tables, 166 indexes, and 168 backend files; Plan 02 executes "safe quick-wins" identified in the report — adding missing indexes, removing unused fields/tables, and cleaning up over-indexing. The plan-to-goal alignment is strong: SCH-01 (audit identification) and SCH-02 (documented remediation) are clearly addressed by Plan 01, and SCH-03 (quick-win execution) by Plan 02.

The overall approach is sound and the scope is well-bounded. The CONTEXT.md decisions document shows thoughtful constraint-setting: table merge candidates are documented but not executed, deprecated fields are annotated but not removed, and `productionCounts` is preserved. These guardrails significantly reduce the risk of this phase.

However, there are several issues ranging from a direct contradiction with the REQUIREMENTS.md "Out of Scope" table, to missing mandatory plan sections required by CLAUDE.md, to gaps in how production data verification is handled during field removal. The audit task is also ambitious for a single task — 59 tables, 166 indexes, 556 `.withIndex()` calls across 95 files — and would benefit from explicit intermediate checkpoints.

## Critical Issues

### C1: REQUIREMENTS.md "Out of Scope" Contradiction

**Severity:** Critical
**Location:** `.planning/REQUIREMENTS.md` line 75

The Out of Scope table states:
> "New features or schema changes — This milestone is pure refactoring + resilience — zero schema changes"

But Plan 02 explicitly modifies `convex/schema.ts`: adding indexes, removing fields, dropping tables. This is a direct contradiction. Either:
1. The Out of Scope row should be updated to say "No new feature schema changes — cleanup/removal of dead schema is in scope" (recommended), or
2. Plan 02 should be downgraded to "report only" with no schema modifications.

Without resolving this, a planner or executor encountering the Out of Scope constraint may refuse to execute Plan 02 or, worse, partially execute it and stop mid-change.

**Recommendation:** Update REQUIREMENTS.md Out of Scope to clarify that schema CLEANUP (removing dead code, adding missing indexes) is in-scope for Phase 35. This is a cleanup milestone, not a "no schema touch" milestone.

### C2: Missing Mandatory Plan Sections (CLAUDE.md Violation)

**Severity:** Critical
**Location:** Both `35-01-PLAN.md` and `35-02-PLAN.md`

CLAUDE.md states: "Every implementation plan MUST include these 4 sections." Neither plan includes:
1. `## Git Workflow` — No branch name specified (should be `feature/schema-review-audit`)
2. `## Implementation Waves` — No wave table with agent/task/files breakdown
3. `## Documentation Updates` — No mention of CHANGELOG.md (required after every merge)
4. `## Success Criteria` checklist — The plans have `<success_criteria>` XML tags but not the markdown format with `npm run build` checkpoint

The plans use the GSD XML template format, which covers similar ground, but the CLAUDE.md requirement is explicit: "Before implementing, confirm all 4 sections exist. If any is missing, add it before proceeding." An executor following CLAUDE.md validation will block on this.

**Recommendation:** Add the 4 required sections to each plan. For Plan 01 (audit only, no code changes), the Git Workflow and Success Criteria sections can be minimal. For Plan 02, they are essential.

### C3: Production vs. Dev Data Verification Gap

**Severity:** Critical
**Location:** `35-02-PLAN.md`, Task 2 Section A

Plan 02 says: "For each field flagged as unused with zero documents populated: VERIFY by reading the audit finding — the audit should have confirmed zero documents have this field."

But the audit (Plan 01) runs against the development environment (`dev:exciting-fennec-671`). Production (`prod:decisive-wombat-7`) may have different data. A field that has zero documents in dev could have thousands in production. Removing it from the schema validator would cause Convex strict validation to reject those documents on next read, potentially crashing the production app.

**Recommendation:** Plan 01 must explicitly state that "zero documents" verification must be done against PRODUCTION data, not dev. Add a step: "For each unused field candidate, run `npx convex run --prod` (or use the Convex dashboard production environment) to verify the field is not populated in production." Alternatively, the audit report should flag each finding with "verified against: dev only" or "verified against: prod" so Plan 02 knows which findings are safe to act on.

## Important Improvements

### I1: Convex Field Removal Requires 2-Step Migration

**Severity:** Important
**Location:** `35-02-PLAN.md`, Task 2 Section A

The project's own MEMORY.md records a hard-won lesson: "When removing a field from Convex schema, you must FIRST strip the field data from all existing documents, THEN remove from schema. Convex strict validation rejects extra fields not in the validator."

Plan 02 says "remove the field from the `v.object()` validator" but does not mention the prerequisite step of stripping field data from existing documents. Even for fields with "zero documents populated," this 2-step awareness should be documented in the plan. For fields where even 1 document has the field populated (edge cases, partial migrations), skipping the strip step would crash production.

**Recommendation:** Add explicit guidance to Plan 02 Task 2: "Before removing any field from schema.ts, run a mutation to `unset` the field from all documents in that table. Only after confirming the strip succeeded (zero documents with the field), remove from the validator. This is a Convex-specific requirement — the validator rejects documents with fields not defined in the schema."

### I2: Single-Task Audit of 59 Tables Is Ambitious

**Severity:** Important
**Location:** `35-01-PLAN.md`, Task 1

Plan 01 has exactly one task: "Audit all 59 tables and cross-reference indexes against query usage." This task involves:
- Reading 1,600 LOC of schema
- Grepping 168 backend files for table references
- Cross-referencing 166 `.index()` definitions against 556 `.withIndex()` calls across 95 files
- Checking 55 Phase 8 denormalization annotations
- Producing a 10-section report

This is a massive single task. If the executor (Claude agent) hits its context window limit mid-audit, it may produce a truncated report covering only the first 30 tables and miss the last 29. There is no checkpoint mechanism to resume.

**Recommendation:** Split Task 1 into 3 sub-tasks with intermediate artifacts:
- Task 1a: Tables 1-20 (base tables: ingredients, materials, products, recipes, packaging)
- Task 1b: Tables 21-40 (orders, kitchen, inventory, production)
- Task 1c: Tables 41-59 (external data, integrations, analytics) + cross-cutting analysis (over-indexing, Phase 8 annotations)
Each sub-task appends to the same `docs/SCHEMA_AUDIT.md`. If the agent restarts, it can pick up from the last completed sub-task.

### I3: No Rollback Plan for Schema Changes

**Severity:** Important
**Location:** `35-02-PLAN.md`

Plan 02 modifies `convex/schema.ts` in production. If a schema change causes issues after deploy (e.g., a query crashes because an "unused" index was actually used by a cron job or internal query), there is no documented rollback procedure.

**Recommendation:** Add a rollback section to Plan 02: "If any schema change causes production issues: (1) `git revert` the schema commit immediately, (2) run `npx convex deploy` to restore the previous schema, (3) document the false-positive finding in the audit report." Also note that adding new indexes is always safe to revert (just remove the index), but removing indexes or fields requires more care.

### I4: CHANGELOG.md and SCHEMA.md Updates Not Planned

**Severity:** Important
**Location:** Both plans

CLAUDE.md requires: "After every merge to main: Update docs/CHANGELOG.md (always required). Also update docs/SCHEMA.md if schema changed."

Neither plan mentions updating CHANGELOG.md or SCHEMA.md. Plan 02 modifies the schema, so SCHEMA.md should be updated to match. Plan 01 creates a new doc (`docs/SCHEMA_AUDIT.md`), which should be noted in the changelog.

**Recommendation:** Add a `## Documentation Updates` section to both plans listing:
- Plan 01: `docs/CHANGELOG.md` (new audit report created)
- Plan 02: `docs/CHANGELOG.md` (schema quick-wins applied), `docs/SCHEMA.md` (if tables/fields removed)

### I5: Over-Index Removal Needs Cron/Internal Query Check

**Severity:** Important
**Location:** `35-02-PLAN.md`, Task 2 Section C

The plan says to remove indexes with "zero `.withIndex()` references." But Convex cron jobs (`convex/crons.ts`) and internal queries/mutations may use indexes that don't show up in a simple grep for `.withIndex()`. Some patterns to watch for:
- `ctx.db.query("table").order("desc")` uses the creation time index implicitly
- Cron-triggered functions that use indexes
- HTTP endpoint handlers (`convex/http.ts`) that query with indexes

**Recommendation:** Expand the audit scope to include `crons.ts`, `http.ts`, and any `internalQuery`/`internalMutation` files when cross-referencing index usage. Add a note: "Indexes used only by cron jobs or HTTP endpoints may have zero references in standard query files but are still actively used."

## Minor Refinements

### M1: Audit Report Should Include Table Row Count Estimates

**Severity:** Minor
**Location:** `35-01-PLAN.md`

The audit checks for "zero documents" but doesn't propose capturing approximate row counts for each table. Knowing that `orders` has 5,000 documents vs `feedback` has 0 helps prioritize remediation effort and assess risk of changes.

**Recommendation:** Add a column to the Summary Scorecard showing approximate document count per table (from `ctx.db.query("table").collect().length` in dev, or dashboard for production).

### M2: "Autonomous: true" May Be Risky for Plan 02

**Severity:** Minor
**Location:** `35-02-PLAN.md` frontmatter

Plan 02 is marked `autonomous: true`, meaning the executor agent runs without human checkpoints. For an audit-only plan (Plan 01), autonomous is fine. For Plan 02, which modifies the production schema, autonomous execution means schema changes go directly to the feature branch without human review of each change before merge.

**Recommendation:** Consider `autonomous: false` for Plan 02, or at minimum add a checkpoint after Task 1 (index additions, low risk) before proceeding to Task 2 (field/table removals, higher risk).

### M3: Plan 02 Verification Should Include Index Count Delta

**Severity:** Minor
**Location:** `35-02-PLAN.md` verification section

The verification checks `npm run build` and `npm run test` but doesn't verify that the expected number of changes were actually made. A useful sanity check: "Count `.index()` calls in schema.ts before and after. Expected delta: +N (new) -M (removed)."

**Recommendation:** Add a pre/post index count comparison to the verification section.

### M4: Phase 8 Annotation Freshness Review Could Be Deferred

**Severity:** Minor
**Location:** `35-01-PLAN.md`, Task 1 item 9

Reviewing all 55 Phase 8 denormalization annotations against current query patterns is valuable but adds significant scope to an already large task. These annotations are comments, not code — stale annotations don't break anything.

**Recommendation:** If the single-task audit proves too large, the Phase 8 annotation review is the first candidate to defer to a follow-up task.

## Verdict

**APPROVE WITH CONDITIONS**

The phase design is solid and well-scoped. The 2-plan split (audit then execute) is the right approach. The guardrails around deprecated fields and table preservation are sensible. However, the following conditions must be met before execution:

1. **[C1] Resolve the REQUIREMENTS.md Out of Scope contradiction** — Update the row to clarify schema cleanup is in-scope for Phase 35.
2. **[C2] Add the 4 mandatory CLAUDE.md plan sections** — Git Workflow, Implementation Waves, Documentation Updates, Success Criteria (at minimum to Plan 02).
3. **[C3] Specify that "zero documents" verification must cover production data** — Dev-only verification is insufficient for production schema changes.
4. **[I1] Document the Convex 2-step field removal pattern** — Strip data first, then remove from validator. Reference the MEMORY.md lesson.
5. **[I4] Add CHANGELOG.md and SCHEMA.md to documentation updates** — Required by CLAUDE.md after every merge.

All 5 conditions are straightforward to address and do not require re-planning the phase. Once addressed, the plans are ready for execution.
