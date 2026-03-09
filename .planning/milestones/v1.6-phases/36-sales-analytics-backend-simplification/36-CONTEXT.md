# Phase 36: Sales & Analytics Backend Simplification - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract shared helpers (confidence types, WIB timezone formatting, sourceToPlatform) into `convex/lib/` modules, then split `externalData/queries.ts` (1,832 LOC) and `k3martCockpit/queries.ts` (985 LOC) by extracting aggregation logic into `helpers/` directories. Update `incomeStatement.ts` to import shared modules instead of local duplicates. No Convex API path changes, no schema changes, no new features.

</domain>

<decisions>
## Implementation Decisions

### Plan scope correction
- Drop OverviewTab splitting (Task 5 in existing plan) from Phase 36 — that's FFS-01, which belongs in Phase 38
- Add K3Mart cockpit extraction (BFS-02) — this IS Phase 36 scope and was missing from the existing plan
- The existing plan at `docs/plans/2026-03-03-sales-analytics-simplification-plan.md` covers Tasks 1-4 and 6 correctly (BSH-01/02/03, BFS-01) but needs Task 5 replaced with K3Mart cockpit extraction

### K3Mart cockpit extraction pattern
- Use the same `helpers/` directory structure as externalData extraction (consistent pattern across both files)
- Typed pure functions with module-level header comments

### Import strategy
- Update ALL importers directly — no re-export bridges for backward compatibility
- When `sourceToPlatform()` moves to `convex/lib/externalSource.ts`, every file that imported it from `externalData/queries.ts` gets updated to the new path
- Same approach for WIB helpers moving to `convex/lib/periodRange.ts`

### incomeStatement treatment
- Import swap only for BFS-03 — replace local confidence/WIB duplicates with shared imports
- No additional helper extraction from incomeStatement.ts (656 LOC is reasonable)
- COGS resolution helpers stay where they are

### Refactor depth
- Pure extraction — functions move as-is with zero logic changes
- No code cleanup, simplification, or signature changes during the move
- If extracted code looks ugly in its new home, that's acceptable — cleanup is a separate concern

### ctx handling
- Claude's discretion per function: pure computational functions receive pre-fetched data (testable without Convex); functions that need DB access can accept ctx as parameter
- Pragmatic choice per function, not a rigid rule

### Documentation
- Module-level header comment only at the top of each new helper file (what the file contains)
- Individual functions keep whatever comments they already have — no new JSDoc added

### Claude's Discretion
- Exact grouping of helper files within `externalData/helpers/` and `k3martCockpit/helpers/`
- Which specific functions to extract from K3Mart cockpit (researcher will analyze the 985 LOC file)
- Whether to keep or remove now-empty sections in slimmed query files
- Per-function decision on ctx parameter vs pre-fetched data

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/lib/externalSource.ts`: Already has `isExternalSource()`, `EXTERNAL_SOURCES[]`, `ExternalSource` type — `sourceToPlatform()` belongs here
- `convex/lib/periodRange.ts`: Already has `calculatePeriodRange()`, `calculateWeekRange()`, `WIB_OFFSET_HOURS` — WIB format helpers belong here
- `convex/lib/costCalculator.ts`: Has `buildProductCOGSMap()` — stays where it is (no extraction needed)

### Established Patterns
- No existing `helpers/` directories in `externalData/` or `k3martCockpit/` — these will be new
- `convex/orders/helpers/` directory exists as a precedent for the helpers pattern (ballDistribution, statusTransitions, etc.)
- Pure function extraction pattern: orders/helpers has both pure functions and ctx-dependent helpers

### Integration Points
- `convex/reports/incomeStatement.ts` imports from both `externalData/queries.ts` and has local confidence types — will import from shared modules
- `src/lib/financialHelpers.tsx` has frontend WIB helpers (separate from backend ones being consolidated)
- `convex/externalData/queries.ts` exports `sourceToPlatform` and `fetchInternalOrderDataMap` — other files import these

</code_context>

<specifics>
## Specific Ideas

- Existing implementation plan at `docs/plans/2026-03-03-sales-analytics-simplification-plan.md` covers Tasks 1-4 and 6 correctly — use as starting point, replace Task 5 (OverviewTab) with K3Mart cockpit extraction
- The `orders/helpers/` directory is a proven precedent for the helpers pattern in this codebase

</specifics>

<deferred>
## Deferred Ideas

- OverviewTab.tsx splitting (1,273 LOC) — Phase 38 (FFS-01)
- COGS resolution helper consolidation — not needed at current scale
- Code cleanup/simplification of extracted functions — separate concern from extraction

</deferred>

---

*Phase: 36-sales-analytics-backend-simplification*
*Context gathered: 2026-03-05*
