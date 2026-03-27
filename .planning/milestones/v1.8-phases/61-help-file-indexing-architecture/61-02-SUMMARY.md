---
phase: 61-help-file-indexing-architecture
plan: 02
subsystem: infra
tags: [gsd-skills, documentation-drift, check-docs, update-docs, slash-commands]

# Dependency graph
requires:
  - phase: 61-help-file-indexing-architecture
    plan: 01
    provides: docs-manifest.json with source-to-doc mappings and lastReviewedCommit per mapping
provides:
  - /gsd:check-docs skill for detecting stale tutorial sections via git log against manifest
  - /gsd:update-docs skill for proposing section edits or acknowledging sections as reviewed
affects: [documentation-maintenance, help-file-drift-detection, future-guide-authoring]

# Tech tracking
tech-stack:
  added: []
  patterns: [gsd-skill-staleness-detection, ack-without-edit-pattern, section-granular-docs-maintenance]

key-files:
  created:
    - .agent/skills/check-docs/SKILL.md
    - .agent/skills/update-docs/SKILL.md
  modified: []

key-decisions:
  - "Both skills follow established SKILL.md conventions (frontmatter, Purpose, Usage, Workflow, When to Use, Notes)"
  - "Shell quoting: all commit message examples use single quotes to prevent # interpretation in guide#section format"
  - "check-docs is strictly read-only; update-docs handles both content edits and ack-only manifest bumps"

patterns-established:
  - "Staleness detection: git log {lastReviewedCommit}..HEAD -- {sourceGlobs} per manifest mapping"
  - "Ack pattern: --ack bumps lastReviewedCommit without editing section content (for refactor-only phases)"
  - "Shell quoting rule: commit messages containing # must use single quotes in bash"

requirements-completed: [HIDX-04, HIDX-05]

# Metrics
duration: 4min
completed: 2026-03-17
---

# Phase 61 Plan 02: GSD Skills for Documentation Drift Detection Summary

**/gsd:check-docs skill for staleness detection and /gsd:update-docs skill for section-level edits with --ack acknowledge-without-change support**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-17T17:22:12Z
- **Completed:** 2026-03-17T17:26:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created /gsd:check-docs skill (114 lines) with manifest loading, per-mapping git log staleness check, STALE/OK report format, and edge case handling
- Created /gsd:update-docs skill (173 lines) with interactive section picker, --ack/--ack-all flags, content edit workflow, manifest commit via gsd-tools.cjs, and 5 documented edge cases
- Both skills follow established project conventions (YAML frontmatter, Purpose/Usage/Workflow/When to Use/Notes sections)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /gsd:check-docs skill** - `28bccd0` (feat)
2. **Task 2: Create /gsd:update-docs skill** - `b0a55b9a` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `.agent/skills/check-docs/SKILL.md` - GSD skill for detecting stale tutorial sections via git log against docs-manifest.json
- `.agent/skills/update-docs/SKILL.md` - GSD skill for updating stale sections with --ack flag and gsd-tools.cjs commit integration

## Decisions Made
- Both skills follow the established SKILL.md pattern (handover, validate-plan) with YAML frontmatter and consistent section structure
- All bash examples with commit messages containing `#` (e.g., `expenses#overview`) use single quotes to prevent shell interpretation
- check-docs is strictly read-only (no file modifications); update-docs handles both content edits and acknowledge-only manifest bumps
- update-docs reuses the same staleness detection logic as check-docs (Step 1) rather than calling check-docs as a dependency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Documentation drift detection loop is now complete: check-docs detects staleness, update-docs fixes it
- Both skills are self-contained -- a Claude instance can execute them without clarification
- Future guides can be added to docs-manifest.json and immediately benefit from both skills
- Phase 61 (Help File Indexing Architecture) is fully complete (2/2 plans)

## Self-Check: PASSED

All 2 created files found. Both task commits (28bccd0, b0a55b9a) found in git log.

---
*Phase: 61-help-file-indexing-architecture*
*Completed: 2026-03-17*
