---
phase: 35-schema-review-audit
plan: 01
subsystem: database
tags: [convex, schema, audit, indexes, denormalization]

# Dependency graph
requires: []
provides:
  - "Complete schema audit report (docs/SCHEMA_AUDIT.md) with 42 categorized findings"
  - "Index cross-reference table (166 indexes vs all .withIndex() calls)"
  - "Quick-win candidates prioritized for Plan 02 execution"
  - "Phase 8 annotation freshness verification"
affects: [35-02, 36-sales-analytics-backend-simplification]

# Tech tracking
tech-stack:
  added: []
  patterns: ["schema audit methodology: defineTable count + index cross-reference + withIndex grep"]

key-files:
  created:
    - docs/SCHEMA_AUDIT.md
    - docs/SCHEMA_AUDIT_2026-02-14.md
  modified: []

key-decisions:
  - "Categorize findings by issue type (not domain) per CONTEXT.md"
  - "22 unused indexes identified for safe removal (zero .withIndex references)"
  - "Keep by_expiry index on sessions and fix MIS-01 query to use it (critical)"
  - "6 index range bounds anti-patterns found across externalData, k3martCockpit, dispatchPlanner"
  - "productionUnitTypes + componentTypes merge documented but NOT recommended for this phase"

patterns-established:
  - "Schema audit cross-references .index() definitions against .withIndex() calls including crons.ts and http.ts"
  - "Severity classification: Critical (incorrect results/data loss), Moderate (storage/maintenance), Low (cosmetic)"

requirements-completed: [SCH-01, SCH-02]

# Metrics
duration: 13min
completed: 2026-03-05
---

# Phase 35 Plan 01: Schema Audit Summary

**Comprehensive audit of 65 Convex tables with 166 indexes, identifying 42 findings (1 critical, 20 moderate, 21 low) across 11 categories including 22 unused indexes and 6 range bounds anti-patterns**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-05T07:42:50Z
- **Completed:** 2026-03-05T07:55:34Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- All 65 tables audited with equal depth -- every defineTable and every .index() cross-referenced
- 22 unused indexes identified for safe removal (zero .withIndex() references confirmed)
- 1 critical finding: cleanupExpiredSessions does full table scan despite by_expiry index existing
- 6 index range bounds anti-patterns documented with exact file:line references and remediation code
- Phase 8 denormalization annotations verified (43/47 still accurate, 4 need minor updates)
- Quick-win candidates organized into 5 priority tiers for Plan 02

## Task Commits

Each task was committed atomically:

1. **Task 1: Archive existing audit and produce comprehensive schema audit report** - `59216f8` (feat)

## Files Created/Modified
- `docs/SCHEMA_AUDIT.md` - Complete 11-section schema audit report with summary scorecard, 42 categorized findings, remediation code snippets, and quick-win candidates
- `docs/SCHEMA_AUDIT_2026-02-14.md` - Archived v1.0 Phase 8 audit report for historical reference

## Decisions Made
- Used numbered section format (## 1. Duplicate Data) for clearer navigation in a long report
- Classified IRB-03 (inventoryBatches by_fifo + status filter) as legitimate different-field filter rather than anti-pattern
- Kept by_default_price index (OI-06) despite only 1 reference -- it serves GoFood auto-matching
- Kept by_expiry index (OI-08) -- fix MIS-01 first, then the index becomes actively used
- Documented productionUnitTypes + componentTypes merge candidate but recommended against execution in this phase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Quick-win candidates clearly prioritized for Plan 02 execution
- Priority 1 (critical): Fix cleanupExpiredSessions query
- Priority 2 (safe): Remove 20 unused indexes from schema.ts
- Priority 3 (safe): Add 5 missing compound indexes
- Priority 4 (safe): Fix 11 range bound anti-patterns in query files
- No blockers

---
*Phase: 35-schema-review-audit*
*Completed: 2026-03-05*
