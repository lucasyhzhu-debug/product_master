# Phase 61: Help File Indexing Architecture - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build developer-side tooling to detect when tutorial documentation becomes stale due to feature changes, and efficiently review/update only the affected sections. Includes: a feature-to-docs manifest mapping codebase modules to tutorial sections, a `/gsd:check-docs` skill to detect staleness via git history, a `/gsd:update-docs` skill to propose and apply section-level edits, and refactoring the existing ExpenseGuide into section files to prove the pattern end-to-end.

This is NOT about user-facing search improvements. The current `String.includes` search on titles/sections (Phase 55) is sufficient. This phase solves **documentation drift** — ensuring tutorials stay accurate as the features they describe evolve.

</domain>

<decisions>
## Implementation Decisions

### Feature-to-Docs Manifest
- Standalone manifest file (`.planning/docs-manifest.json`) mapping source file globs to tutorial section files
- Section-level granularity — maps to specific section files, not whole guides
- Maps directly to file paths (`docFile` field) so tooling reads files without ID-to-path resolution
- Each mapping entry tracks `lastReviewedCommit` (per-mapping, not global) for independent staleness baselines
- Manually maintained with a validation script (`npm run validate:docs-manifest`) that checks every guide section has at least one source mapping and warns about unmapped sections

### Change Detection Trigger (`/gsd:check-docs`)
- GSD slash command — manual invocation only, no auto-triggers or CI gates
- Compares `git log {lastReviewedCommit}..HEAD -- {source glob}` per mapping entry
- Shows change summary for each stale section: which files changed, commit count, one-line commit summaries
- Claude's discretion on impact assessment (HIGH/MEDIUM/LOW) or whether to include that

### Section-Level File Structure
- Each guide split into section files: `src/pages/guides/{GuideName}/{SectionId}Section.tsx`
- Main guide file (`index.tsx`) imports and composes all section components
- Naming convention: `{PascalCase of section ID}Section.tsx` (e.g., section `submitting` → `SubmittingSection.tsx`)
- Validator can auto-detect mismatches between guide registry sections and file system
- Refactor existing ExpenseGuide.tsx into 8 section files as part of this phase (proves the pattern)
- **IMPORTANT**: ExpenseGuide content is actively being updated — researcher/planner MUST read the current state of ExpenseGuide at implementation time, not assume Phase 56 version

### Update Workflow (`/gsd:update-docs`)
- Reads the stale section file + git diff of mapped source files since `lastReviewedCommit`
- Claude analyzes what changed in the code and proposes specific edits to the tutorial section
- Developer reviews and approves/modifies the proposed changes
- Supports `--ack` flag to mark sections as reviewed WITHOUT making changes (for refactors that don't affect user-facing behavior)
- No arguments = interactive picker showing stale sections, pick which to update
- Auto-commits per section after approval: `docs(help): update {guide}#{section}` + manifest `lastReviewedCommit` bump

### Claude's Discretion
- Exact manifest JSON schema (field names, structure within constraints above)
- Validation script implementation (Node.js script vs Vitest test vs standalone)
- How `/gsd:check-docs` formats its output (exact formatting, colors, grouping)
- Whether to include an impact assessment (HIGH/MEDIUM/LOW) per stale section
- Internal implementation of the GSD skills (agent type, tool usage patterns)
- How to handle edge cases: deleted source files, renamed sections, guides with no mappings yet

</decisions>

<specifics>
## Specific Ideas

- Manifest lives in `.planning/docs-manifest.json` — version-controlled, sits with other planning artifacts
- Section file pattern: `src/pages/guides/ExpenseGuide/SubmittingSection.tsx` — each ~50-80 lines
- `/gsd:check-docs` output should clearly distinguish "STALE" vs "UP TO DATE" per section with commit summaries
- `/gsd:update-docs` should read only the affected section file (~60 lines) + relevant git diff — total context ~150 lines instead of ~800
- Auto-commit message format: `docs(help): update expenses#submitting for {brief reason}`
- `--ack` use case: "refactor only, no behavior change" — bumps commit without editing

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/helpGuides.ts`: Guide registry with `GuideConfig` interface, `GuideSection` interface, `HELP_GUIDES` array, `searchGuides()` function — section IDs already defined here
- `src/pages/guides/ExpenseGuide.tsx`: First (and only) live guide — ~800 lines, 8 sections, needs splitting
- `src/pages/guides/GuideRouter.tsx`: Routes `guideId` param to guide component
- `src/components/help/GuideLayout.tsx`: Sticky sidebar TOC, Intersection Observer active section tracking — already works with section IDs
- `src/components/help/GuideSection.tsx`: Section wrapper with anchor ID — section boundary already defined in JSX
- `.claude/get-shit-done/bin/gsd-tools.cjs`: Existing GSD tooling infrastructure for commit, state, config operations

### Established Patterns
- GSD skills live in `.agent/skills/{name}/SKILL.md` (e.g., check-docs, update-docs)
- GSD workflows live in `.claude/get-shit-done/workflows/` for more complex multi-step flows
- `gsd-tools.cjs` handles git operations (commit, state updates) used by all GSD skills
- Guide registry is data-driven — section IDs are already the source of truth for TOC and routing

### Integration Points
- New skills: `.agent/skills/check-docs/SKILL.md` and `.agent/skills/update-docs/SKILL.md` (or GSD workflow files)
- Manifest: `.planning/docs-manifest.json` — consumed by both skills
- Validation: `npm run validate:docs-manifest` script in `package.json`
- ExpenseGuide refactor: `src/pages/guides/ExpenseGuide.tsx` → `src/pages/guides/ExpenseGuide/index.tsx` + 8 section files
- Guide registry: may need minor updates to accommodate per-guide directory structure (import path changes)

</code_context>

<deferred>
## Deferred Ideas

- Auto-triggered checks (CI pipeline, phase completion hooks) — manual is sufficient for now
- User-facing full-text search improvement (searching body content, not just titles) — separate from developer tooling
- Contextual `?` buttons per page deep-linking to guide sections (already deferred from Phase 55)
- Auto-generating manifest entries when GSD phases create new guides
- Print/PDF export of guides

</deferred>

---

*Phase: 61-help-file-indexing-architecture*
*Context gathered: 2026-03-17*
