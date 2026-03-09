# Phase 35: Schema Review & Audit - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Expert audit of all 65 Convex tables to identify data duplication, unused/redundant tables, denormalization waste, missing indexes, and inefficient patterns. Produce a structured audit report and execute safe quick-wins that don't require data migration. No new features, no schema redesigns.

</domain>

<decisions>
## Implementation Decisions

### Report format & deliverable
- Audit report lives at `docs/SCHEMA_AUDIT.md` — standalone doc alongside existing SCHEMA.md, stays in repo permanently
- Findings categorized by issue type: Duplicate data, Unused tables/fields, Missing indexes, Denormalization waste, Over-indexing — not by domain or severity
- Each finding includes full remediation with concrete code snippets (exact field/table changes, index definitions, migration steps) — planner can copy-paste
- Report includes a top-level summary scorecard with total findings, severity breakdown per category, and estimated effort

### Quick-win execution boundary
- Missing indexes: Add directly during this phase — Convex backfills automatically, no data risk, immediate performance benefit
- Unused fields: Remove from schema if confirmed unused (run query to verify zero documents have field populated, then strip + remove from validator)
- Entire tables: Drop if the table has zero documents AND is fully superseded by another table
- Denormalized data: Claude decides per case — trivial denorm cleanup executed, complex ones flagged in report only

### Audit coverage & depth
- All 65 tables audited with equal depth — no domain weighting. This is a tech debt milestone, thoroughness matters
- Cross-table relationship integrity checked: orphaned references, dangling foreign keys, inconsistent cross-table data (integrityChecks/ infrastructure already exists)
- Over-indexing audited: cross-reference every `.index()` in schema against actual `.withIndex()` calls in queries — unused indexes flagged for removal
- Table merge candidates identified and documented with rationale, but NOT executed in this phase — merging is a bigger undertaking

### Legacy artifact handling
- `productionCounts` table: Keep but annotate as archived/deprecated in schema comments — don't drop even if no active reads (safest approach)
- Deprecated `productionType`/`productionUnits` fields on `menuProducts` and `orderItems`: Keep as-is, just document — v1.0 Phase 8 already annotated them, removal is risky on production data with active orders
- `feedback` table: ACTIVE — used in Layout.tsx, feedback components, and hooks. Audit for stale fields or over-indexing only, do NOT treat as removed/orphaned
- ~56 denormalization annotations from v1.0 Phase 8: Verify all annotations against current query patterns — some may be stale after 6 milestones of changes

### Claude's Discretion
- Severity classification per finding (critical/moderate/low)
- Order of tables in the audit (can group by domain internally for efficiency)
- Whether to include Convex-specific optimization recommendations (e.g., query patterns that could leverage existing indexes better)
- How to handle edge cases where a field has data in only 1-2 documents (near-zero usage)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/integrityChecks/` — Existing integrity check infrastructure (queries + mutations) that validates production data weekly. Can be leveraged for cross-table relationship auditing
- `docs/SCHEMA.md` — Existing schema documentation to cross-reference and update
- Phase 8 (v1.0) denormalization annotations — ~56 inline comments in `convex/schema.ts` documenting intentional denormalization decisions

### Established Patterns
- Schema uses `defineTable` + `v.object()` validators with explicit field types
- 166 existing indexes across 65 tables (65 `defineTable` calls in 1,600 LOC file)
- Tables organized by domain directories: `convex/orders/`, `convex/inventory/`, `convex/externalData/`, etc.
- Query files use `.withIndex()` for indexed lookups, `.query().filter()` for non-indexed scans

### Integration Points
- `convex/schema.ts` is the single source of truth — any changes here affect the entire backend
- 35 query files + 33 mutation files reference schema tables
- `npm run build` includes Convex codegen — schema changes trigger type regeneration
- Production environment (`prod:decisive-wombat-7`) applies schema changes on deploy

</code_context>

<specifics>
## Specific Ideas

- The audit should cross-reference indexes against ACTUAL query patterns (`.withIndex()` calls), not just check if indexes exist
- The report should be useful beyond this phase — it becomes the reference for future schema decisions
- Known items to investigate: productionCounts (archived?), feedback (active — audit fields only), deprecated fields on menuProducts/orderItems, ~56 denormalization annotations freshness

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 35-schema-review-audit*
*Context gathered: 2026-03-05*
