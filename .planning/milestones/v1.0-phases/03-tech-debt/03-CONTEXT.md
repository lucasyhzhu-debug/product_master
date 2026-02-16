# Phase 3: Quick Fixes — Tech Debt - Context

**Gathered:** 2026-02-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove deprecated code, dead files, shim modules, stale status mappings, and redundant indexes from the codebase. Five discrete cleanup tasks (QFIX-01 through QFIX-05) affecting 25-30 files across frontend and backend. No new features — purely subtractive.

</domain>

<decisions>
## Implementation Decisions

### Historical status display (QFIX-04)
- Map deprecated statuses to nearest active equivalents: `ProductionComplete` → `Boxed`, `Packaging` → `InProduction`
- Old orders display with the mapped status badge — they blend into the current workflow, no "Legacy" label
- Keep deprecated statuses as filter options so users can still find old orders (important for accounting, sales, and discount review)
- Allow status transitions out of deprecated statuses (e.g., cancellation) — don't freeze old orders
- Remove from UI color/label mappings by replacing with the mapped equivalents, not by deleting
- Schema validator keeps both values for historical data integrity

### KitchenView retirement (QFIX-02)
- KitchenViewV2 is a complete replacement — no features to preserve from V1
- Delete KitchenView.tsx and cascade: remove any orphaned components in `src/components/kitchen/` that only V1 used
- Route check: Claude determines during research whether routes differ and handles accordingly
- Git history is sufficient — no preservation artifacts needed beyond the changelog entry

### Shim removal & imports (QFIX-03)
- Remove `convex/orders/mutations.ts` shim and update all imports in one shot (single commit, clean break)
- Full audit of both frontend AND backend files for imports from the shim — not just the 19+ known frontend files
- No external callers — only this frontend repo references these mutations, so path changes are safe
- API surface: Claude's discretion on whether paths change or remain equivalent, based on Convex module resolution

### Index removal criteria (QFIX-05)
- Moderate aggressiveness: remove clearly redundant indexes (prefix duplicates) AND unused single-field indexes that no query references
- Requires code audit: match each index against actual query usage before removing
- If the audit reveals obviously missing indexes, add them opportunistically (don't defer everything to Phase 7)
- Document all removed (and added) indexes with justification in CHANGELOG.md
- Convex handles index removal safely — no special deploy caution needed
- Test in dev environment as standard practice, but no extra gates

### Claude's Discretion
- KitchenView route handling (same route swap vs redirect)
- API path structure after shim removal (preserve or restructure)
- Orphaned component detection methodology
- Exact index audit approach and tooling
- QFIX-01 implementation (replacing "current-user" with AuthContext username — straightforward, no user decisions needed)

</decisions>

<specifics>
## Specific Ideas

- Old orders with deprecated statuses are still used for accounting, sales, and discount review — not just historical artifacts
- "All at once" preference for shim removal — user prefers clean breaks over incremental migration
- Changelog is the preferred documentation artifact for this phase (not separate audit docs)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-tech-debt*
*Context gathered: 2026-02-13*
